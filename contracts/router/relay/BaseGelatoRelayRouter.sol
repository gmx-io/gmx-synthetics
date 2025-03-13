// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {GelatoRelayContext} from "@gelatonetwork/relay-context/contracts/GelatoRelayContext.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../../data/DataStore.sol";
import "../../exchange/IOrderHandler.sol";
import "../../external/IExternalHandler.sol";
import "../../feature/FeatureUtils.sol";
import "../../oracle/OracleModule.sol";
import "../../order/IBaseOrderUtils.sol";
import "../../order/OrderStoreUtils.sol";
import "../../order/OrderVault.sol";
import "../../router/Router.sol";
import "../../token/TokenUtils.sol";
import "../../gas/GasUtils.sol";

import "./RelayUtils.sol";

abstract contract BaseGelatoRelayRouter is GelatoRelayContext, ReentrancyGuard, OracleModule {
    using Order for Order.Props;
    using SafeERC20 for IERC20;

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

    struct ExternalCalls {
        address[] externalCallTargets;
        bytes[] externalCallDataList;
        address[] refundTokens;
        address[] refundReceivers;
    }

    struct RelayParams {
        OracleUtils.SetPricesParams oracleParams;
        ExternalCalls externalCalls;
        TokenPermit[] tokenPermits;
        FeeParams fee;
        uint256 userNonce;
        uint256 deadline;
        bytes signature;
    }

    // @note all params except account should be part of the corresponding struct hash
    struct UpdateOrderParams {
        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        uint256 triggerPrice;
        uint256 minOutputAmount;
        uint256 validFromTime;
        bool autoCancel;
    }

    IOrderHandler public immutable orderHandler;
    OrderVault public immutable orderVault;
    Router public immutable router;
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    IExternalHandler public immutable externalHandler;

    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        keccak256(bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));

    bytes32 public constant DOMAIN_SEPARATOR_NAME_HASH = keccak256(bytes("GmxBaseGelatoRelayRouter"));
    bytes32 public constant DOMAIN_SEPARATOR_VERSION_HASH = keccak256(bytes("1"));

    mapping(address => uint256) public userNonces;

    constructor(
        Router _router,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler
    ) OracleModule(_oracle) {
        orderHandler = _orderHandler;
        orderVault = _orderVault;
        router = _router;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        externalHandler = _externalHandler;
    }

    function _validateSignature(
        bytes32 digest,
        bytes calldata signature,
        address expectedSigner,
        string memory signatureType
    ) internal pure {
        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(digest, signature);
        if (error != ECDSA.RecoverError.NoError || recovered != expectedSigner) {
            revert Errors.InvalidSignature(signatureType);
        }
    }

    function _getContracts() internal view returns (Contracts memory contracts) {
        DataStore _dataStore = dataStore;
        address wnt = TokenUtils.wnt(_dataStore);
        contracts = Contracts({dataStore: _dataStore, eventEmitter: eventEmitter, orderVault: orderVault, wnt: wnt});
    }

    function _createOrder(
        RelayParams calldata relayParams,
        address account,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params, // can't use calldata because need to modify params.numbers.executionFee
        bool isSubaccount,
        uint256 startingGas
    ) internal returns (bytes32) {
        Contracts memory contracts = _getContracts();
        uint256 residualFeeAmount = _handleRelayBeforeAction(
            contracts,
            relayParams,
            account,
            params.numbers.executionFee,
            isSubaccount
        );

        if (
            params.orderType == Order.OrderType.MarketSwap ||
            params.orderType == Order.OrderType.LimitSwap ||
            params.orderType == Order.OrderType.MarketIncrease ||
            params.orderType == Order.OrderType.LimitIncrease ||
            params.orderType == Order.OrderType.StopIncrease
        ) {
            _sendTokens(
                account,
                params.addresses.initialCollateralToken,
                address(contracts.orderVault),
                collateralDeltaAmount
            );
        }

        bytes32 key = orderHandler.createOrder(
            account,
            params,
            isSubaccount && params.addresses.callbackContract != address(0)
        );
        _handleRelayAfterAction(contracts, startingGas, residualFeeAmount, account);
        return key;
    }

    function _updateOrder(
        RelayParams calldata relayParams,
        address account,
        bytes32 key,
        UpdateOrderParams calldata params,
        uint256 executionFee,
        bool isSubaccount,
        uint256 startingGas
    ) internal {
        Contracts memory contracts = _getContracts();
        Order.Props memory order = OrderStoreUtils.get(contracts.dataStore, key);

        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.account() != account) {
            revert Errors.Unauthorized(account, "account for updateOrder");
        }

        uint256 residualFeeAmount = _handleRelayBeforeAction(contracts, relayParams, account, executionFee, isSubaccount);

        orderHandler.updateOrder(
            key,
            params.sizeDeltaUsd,
            params.acceptablePrice,
            params.triggerPrice,
            params.minOutputAmount,
            params.validFromTime,
            params.autoCancel,
            order,
            // shouldCapMaxExecutionFee
            // see GasUtils.validateExecutionFee
            isSubaccount && order.callbackContract() != address(0) && executionFee != 0
        );
        _handleRelayAfterAction(contracts, startingGas, residualFeeAmount, account);
    }

    function _cancelOrder(
        RelayParams calldata relayParams,
        address account,
        bytes32 key,
        bool isSubaccount,
        uint256 startingGas
    ) internal {
        Contracts memory contracts = _getContracts();
        Order.Props memory order = OrderStoreUtils.get(contracts.dataStore, key);
        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.account() != account) {
            revert Errors.Unauthorized(account, "account for cancelOrder");
        }

        uint256 residualFeeAmount = _handleRelayBeforeAction(contracts, relayParams, account, 0, isSubaccount);
        orderHandler.cancelOrder(key);
        _handleRelayAfterAction(contracts, startingGas, residualFeeAmount, account);
    }

    function _handleRelayBeforeAction(
        Contracts memory contracts,
        RelayParams calldata relayParams,
        address account,
        uint256 executionFee,
        bool isSubaccount
    ) internal returns (uint256) {
        if (relayParams.externalCalls.externalCallTargets.length != 0 && relayParams.fee.feeSwapPath.length != 0) {
            revert Errors.InvalidRelayParams();
        }

        if (relayParams.externalCalls.externalCallTargets.length != 0 && isSubaccount) {
            // malicious subaccount could steal main account funds through external calls
            revert Errors.NonEmptyExternalCallsForSubaccountOrder();
        }

        _handleTokenPermits(relayParams.tokenPermits);
        return _handleRelayFee(contracts, relayParams, account, executionFee);
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

            try
                IERC20Permit(permit.token).permit(
                    permit.owner,
                    permit.spender,
                    permit.value,
                    permit.deadline,
                    permit.v,
                    permit.r,
                    permit.s
                )
            {} catch {}
        }
    }

    function _handleRelayFee(
        Contracts memory contracts,
        RelayParams calldata relayParams,
        address account,
        uint256 executionFee
    ) internal returns (uint256) {
        if (_getFeeToken() != contracts.wnt) {
            revert Errors.UnsupportedRelayFeeToken(_getFeeToken(), contracts.wnt);
        }

        uint256 outputAmount;
        if (relayParams.externalCalls.externalCallTargets.length > 0) {
            _sendTokens(account, relayParams.fee.feeToken, address(externalHandler), relayParams.fee.feeAmount);
            externalHandler.makeExternalCalls(
                relayParams.externalCalls.externalCallTargets,
                relayParams.externalCalls.externalCallDataList,
                relayParams.externalCalls.refundTokens,
                relayParams.externalCalls.refundReceivers
            );
            outputAmount = ERC20(_getFeeToken()).balanceOf(address(this));
        } else if (relayParams.fee.feeSwapPath.length != 0) {
            _sendTokens(account, relayParams.fee.feeToken, address(contracts.orderVault), relayParams.fee.feeAmount);
            outputAmount = RelayUtils.swapFeeTokens(contracts, oracle, relayParams.fee);
        } else if (relayParams.fee.feeToken == contracts.wnt) {
            _sendTokens(account, relayParams.fee.feeToken, address(this), relayParams.fee.feeAmount);
            outputAmount = relayParams.fee.feeAmount;
        } else {
            revert Errors.UnexpectedRelayFeeToken(relayParams.fee.feeToken, contracts.wnt);
        }

        if (executionFee != 0) {
            IERC20(contracts.wnt).safeTransfer(address(contracts.orderVault), executionFee);
        }

        return outputAmount - executionFee;
    }

    function _handleRelayAfterAction(
        Contracts memory contracts,
        uint256 startingGas,
        uint256 residualFeeAmount,
        address residualFeeReceiver
    ) internal {
        bool isSponsoredCall = !_isGelatoRelay(msg.sender);
        uint256 relayFee;
        if (isSponsoredCall) {
            // multiply by 2 because the calldata is first sent to the Relay contract, and then to GMX contract
            relayFee = GasUtils.payGelatoRelayFee(contracts.dataStore, startingGas, contracts.wnt, msg.data.length * 2);
        } else {
            relayFee = _getFee();
            _transferRelayFeeCapped(relayFee);
        }

        residualFeeAmount -= relayFee;
        if (residualFeeAmount > 0) {
            IERC20(contracts.wnt).safeTransfer(residualFeeReceiver, residualFeeAmount);
        }
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

    function _validateCall(RelayParams calldata relayParams, address account, bytes32 structHash) internal {
        bytes32 domainSeparator = _getDomainSeparator(block.chainid);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        _validateSignature(digest, relayParams.signature, account, "call");

        _validateNonce(account, relayParams.userNonce);
        _validateDeadline(relayParams.deadline);
    }

    function _validateDeadline(uint256 deadline) internal view {
        if (block.timestamp > deadline) {
            revert Errors.DeadlinePassed(block.timestamp, deadline);
        }
    }

    function _validateNonce(address account, uint256 userNonce) internal {
        if (userNonces[account] != userNonce) {
            revert Errors.InvalidUserNonce(userNonces[account], userNonce);
        }
        userNonces[account] = userNonce + 1;
    }

    function _getRelayParamsHash(RelayParams calldata relayParams) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    relayParams.oracleParams,
                    relayParams.externalCalls,
                    relayParams.tokenPermits,
                    relayParams.fee,
                    relayParams.userNonce,
                    relayParams.deadline
                )
            );
    }

    function _validateGaslessFeature() internal view {
        FeatureUtils.validateFeature(dataStore, Keys.gaslessFeatureDisabledKey(address(this)));
    }
}
