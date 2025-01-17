// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {GelatoRelayContextERC2771} from "@gelatonetwork/relay-context/contracts/GelatoRelayContextERC2771.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../exchange/IOrderHandler.sol";
import "../oracle/OracleModule.sol";
import "../order/IBaseOrderUtils.sol";
import "../order/OrderStoreUtils.sol";
import "../order/OrderVault.sol";
import "../router/Router.sol";
import "../token/TokenUtils.sol";
import "../swap/SwapUtils.sol";
import "../nonce/NonceUtils.sol";
import "../role/RoleModule.sol";

abstract contract BaseGelatoRelayRouter is GelatoRelayContextERC2771, ReentrancyGuard, OracleModule, RoleModule {
    using Order for Order.Props;

    IOrderHandler public immutable orderHandler;
    OrderVault public immutable orderVault;
    Router public immutable router;
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    // Define the EIP-712 struct type:
    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        keccak256(bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));

    bytes32 public constant DOMAIN_SEPARATOR_NAME_HASH = keccak256(bytes("GmxBaseGelatoRelayRouter"));
    bytes32 public constant DOMAIN_SEPARATOR_VERSION_HASH = keccak256(bytes("1"));

    struct TokenPermit {
        address owner;
        address spender;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
        address token;
    }

    struct RelayFeeParams {
        address feeToken;
        uint256 feeAmount;
        address[] feeSwapPath;
    }

    struct RelayParams {
        OracleUtils.SetPricesParams oracleParams;
        TokenPermit[] tokenPermit;
        RelayFeeParams fee;
    }

    struct UpdateOrderParams {
        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        uint256 triggerPrice;
        uint256 minOutputAmount;
        uint256 validFromTime;
        bool autoCancel;
    }

    struct Contracts {
        DataStore dataStore;
        EventEmitter eventEmitter;
        OrderVault orderVault;
    }

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault
    ) RoleModule(_roleStore) OracleModule(_oracle) {
        orderHandler = _orderHandler;
        orderVault = _orderVault;
        router = _router;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    function _validateSignature(bytes32 digest, bytes calldata signature, address expectedSigner) internal pure {
        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(digest, signature);
        if (error != ECDSA.RecoverError.NoError || recovered != expectedSigner) {
            revert Errors.InvalidSignature();
        }
    }

    function _updateOrder(
        RelayParams calldata relayParams,
        address account,
        bytes32 key,
        UpdateOrderParams calldata params
    ) internal {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            orderVault: orderVault
        });

        Order.Props memory order = OrderStoreUtils.get(contracts.dataStore, key);
        if (order.account() != account) {
            revert Errors.Unauthorized(account, "account for updateOrder");
        }

        _handleRelay(
            contracts,
            relayParams.tokenPermit,
            relayParams.fee,
            account,
            key,
            order.uiFeeReceiver(),
            account
        );

        orderHandler.updateOrder(
            key,
            params.sizeDeltaUsd,
            params.acceptablePrice,
            params.triggerPrice,
            params.minOutputAmount,
            params.validFromTime,
            params.autoCancel,
            order
        );
    }

    function _cancelOrder(RelayParams calldata relayParams, address account, bytes32 key) internal {
        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.account() != account) {
            revert Errors.Unauthorized(account, "account for cancelOrder");
        }

        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            orderVault: orderVault
        });

        _handleRelay(
            contracts,
            relayParams.tokenPermit,
            relayParams.fee,
            account,
            key,
            order.uiFeeReceiver(),
            account
        );

        orderHandler.cancelOrder(key);
    }

    function _getCreateOrderSignatureMessage(
        RelayParams memory relayParams,
        uint256 collateralAmount,
        IBaseOrderUtils.CreateOrderParams memory params
    ) internal pure returns (bytes memory) {
        return abi.encode(relayParams, collateralAmount, params);
    }

    function _createOrder(
        TokenPermit[] calldata tokenPermit,
        RelayFeeParams calldata fee,
        uint256 collateralAmount,
        IBaseOrderUtils.CreateOrderParams memory params, // can't use calldata because need to modify params.numbers.executionFee
        address account
    ) internal returns (bytes32) {
        if (params.addresses.receiver != account) {
            // otherwise malicious relayer can set receiver to any address and steal user's funds
            revert Errors.InvalidReceiver(params.addresses.receiver);
        }

        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            orderVault: orderVault
        });

        params.numbers.executionFee = _handleRelay(
            contracts,
            tokenPermit,
            fee,
            account,
            NonceUtils.getNextKey(contracts.dataStore), // order key
            params.addresses.uiFeeReceiver,
            address(contracts.orderVault)
        );

        if (collateralAmount > 0) {
            _sendTokens(
                account,
                params.addresses.initialCollateralToken,
                address(contracts.orderVault),
                collateralAmount
            );
        }

        return orderHandler.createOrder(account, params);
    }

    function _swapFeeTokens(
        Contracts memory contracts,
        address wnt,
        RelayFeeParams calldata fee,
        bytes32 orderKey,
        address uiFeeReceiver
    ) internal returns (uint256) {
        // swap fee tokens to WNT
        Market.Props[] memory swapPathMarkets = MarketUtils.getSwapPathMarkets(contracts.dataStore, fee.feeSwapPath);

        (address outputToken, uint256 outputAmount) = SwapUtils.swap(
            SwapUtils.SwapParams({
                dataStore: contracts.dataStore,
                eventEmitter: contracts.eventEmitter,
                oracle: oracle,
                bank: contracts.orderVault,
                key: orderKey,
                tokenIn: fee.feeToken,
                amountIn: fee.feeAmount,
                swapPathMarkets: swapPathMarkets,
                minOutputAmount: _getFee(),
                receiver: address(this),
                uiFeeReceiver: uiFeeReceiver,
                shouldUnwrapNativeToken: false
            })
        );

        if (outputToken != wnt) {
            revert Errors.InvalidSwapOutputToken(outputToken, wnt);
        }

        return outputAmount;
    }

    function _handleRelay(
        Contracts memory contracts,
        TokenPermit[] calldata tokenPermit,
        RelayFeeParams calldata fee,
        address account,
        bytes32 orderKey,
        address uiFeeReceiver,
        address residualFeeReceiver
    ) internal returns (uint256) {
        _handleTokenPermits(tokenPermit);
        return _handleRelayFee(contracts, fee, account, orderKey, uiFeeReceiver, residualFeeReceiver);
    }

    function _handleTokenPermits(TokenPermit[] calldata tokenPermits) internal {
        // not all tokens support ERC20Permit, for them separate transaction is needed

        if (tokenPermits.length == 0) {
            return;
        }

        address _router = address(router);

        for (uint256 i; i < tokenPermits.length; i++) {
            TokenPermit memory permit = tokenPermits[i];

            if (permit.spender != _router) {
                // to avoid permitting spending by an incorrect spender for extra safety
                revert Errors.InvalidPermitSpender(permit.spender, _router);
            }

            if (ERC20(permit.token).allowance(permit.owner, permit.spender) >= permit.value) {
                // allowance is already sufficient
                continue;
            }

            IERC20Permit(permit.token).permit(
                permit.owner,
                permit.spender,
                permit.value,
                permit.deadline,
                permit.v,
                permit.r,
                permit.s
            );
        }
    }

    function _handleRelayFee(
        Contracts memory contracts,
        RelayFeeParams calldata fee,
        address account,
        bytes32 orderKey,
        address uiFeeReceiver,
        address residualFeeReceiver
    ) internal returns (uint256) {
        address wnt = TokenUtils.wnt(contracts.dataStore);

        if (_getFeeToken() != wnt) {
            revert Errors.InvalidRelayFeeToken(fee.feeToken, wnt);
        }

        _sendTokens(account, fee.feeToken, address(contracts.orderVault), fee.feeAmount);
        uint256 outputAmount = _swapFeeTokens(contracts, wnt, fee, orderKey, uiFeeReceiver);
        // TODO if Gelato accepts native token then it should be unwrapped in the swap
        _transferRelayFee();

        uint256 residualFee = outputAmount - _getFee();
        TokenUtils.transfer(contracts.dataStore, wnt, residualFeeReceiver, residualFee);
        return residualFee;
    }

    function _sendTokens(address account, address token, address receiver, uint256 amount) internal {
        AccountUtils.validateReceiver(receiver);
        router.pluginTransfer(token, account, receiver, amount);
    }

    function _getDomainSeparator(uint256 sourceChainId) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_SEPARATOR_TYPEHASH,
                    DOMAIN_SEPARATOR_NAME_HASH,
                    DOMAIN_SEPARATOR_VERSION_HASH,
                    sourceChainId,
                    address(this)
                )
            );
    }
}
