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

address constant GMX_SIMULATION_ORIGIN = address(uint160(uint256(keccak256("GMX SIMULATION ORIGIN"))));

abstract contract BaseGelatoRelayRouter is GelatoRelayContext, ReentrancyGuard, OracleModule {
    using Order for Order.Props;
    using SafeERC20 for IERC20;

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

    modifier withRelay(
        RelayParams calldata relayParams,
        address account,
        bool isSubaccount
    ) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        Contracts memory contracts = _getContracts();
        _handleRelayBeforeAction(contracts, relayParams, account, isSubaccount);
        _;
        _handleRelayAfterAction(contracts, startingGas, account);
    }

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
    ) internal view {
        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(digest, signature);

        // allow to optionally skip signature validation for eth_estimateGas / eth_call if tx.origin is GMX_SIMULATION_ORIGIN
        // do not use address(0) to avoid relays accidentally skipping signature validation if they use address(0) as the origin
        if (tx.origin == GMX_SIMULATION_ORIGIN) {
            return;
        }

        if (error != ECDSA.RecoverError.NoError || recovered != expectedSigner) {
            revert Errors.InvalidSignature(signatureType);
        }
    }

    function _getContracts() internal view returns (Contracts memory contracts) {
        DataStore _dataStore = dataStore;
        address wnt = TokenUtils.wnt(_dataStore);
        contracts = Contracts({dataStore: _dataStore, orderVault: orderVault, wnt: wnt});
    }

    function _batch(
        address account,
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys,
        bool isSubaccount
    ) internal {
        uint256 actionsCount = createOrderParamsList.length + updateOrderParamsList.length + cancelOrderKeys.length;
        if (actionsCount == 0) {
            revert Errors.RelayEmptyBatch();
        }

        for (uint256 i = 0; i < createOrderParamsList.length; i++) {
            _createOrder(account, createOrderParamsList[i], isSubaccount);
        }

        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            _updateOrder(account, updateOrderParamsList[i], isSubaccount);
        }

        for (uint256 i = 0; i < cancelOrderKeys.length; i++) {
            _cancelOrder(account, cancelOrderKeys[i]);
        }
    }

    function _createOrder(
        address account,
        IBaseOrderUtils.CreateOrderParams calldata params,
        bool isSubaccount
    ) internal returns (bytes32) {
        Contracts memory contracts = _getContracts();
        IERC20(contracts.wnt).safeTransfer(address(contracts.orderVault), params.numbers.executionFee);

        if (
            params.numbers.initialCollateralDeltaAmount != 0 &&
            (BaseOrderUtils.isSwapOrder(params.orderType) || BaseOrderUtils.isIncreaseOrder(params.orderType))
        ) {
            // for increase and swap orders OrderUtils sets initialCollateralDeltaAmount based on the amount of received initialCollateralToken
            // instead of using initialCollateralDeltaAmount from params
            // it is possible to use external calls to send tokens to OrderVault, in this case initialCollateralDeltaAmount could be zero
            // and there is no need to call _sendTokens here
            _sendTokens(
                account,
                params.addresses.initialCollateralToken,
                address(contracts.orderVault),
                params.numbers.initialCollateralDeltaAmount
            );
        }

        return
            orderHandler.createOrder(account, params, isSubaccount && params.addresses.callbackContract != address(0));
    }

    function _updateOrder(address account, UpdateOrderParams calldata params, bool isSubaccount) internal {
        Contracts memory contracts = _getContracts();
        Order.Props memory order = OrderStoreUtils.get(contracts.dataStore, params.key);

        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.account() != account) {
            revert Errors.Unauthorized(account, "account for updateOrder");
        }

        if (params.executionFeeIncrease != 0) {
            IERC20(contracts.wnt).safeTransfer(address(contracts.orderVault), params.executionFeeIncrease);
        }

        orderHandler.updateOrder(
            params.key,
            params.sizeDeltaUsd,
            params.acceptablePrice,
            params.triggerPrice,
            params.minOutputAmount,
            params.validFromTime,
            params.autoCancel,
            order,
            // shouldCapMaxExecutionFee
            // see GasUtils.validateExecutionFee
            isSubaccount && order.callbackContract() != address(0) && params.executionFeeIncrease != 0
        );
    }

    function _cancelOrder(address account, bytes32 key) internal {
        Contracts memory contracts = _getContracts();
        Order.Props memory order = OrderStoreUtils.get(contracts.dataStore, key);
        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.account() != account) {
            revert Errors.Unauthorized(account, "account for cancelOrder");
        }
        orderHandler.cancelOrder(key);
    }

    function _handleRelayBeforeAction(
        Contracts memory contracts,
        RelayParams calldata relayParams,
        address account,
        bool isSubaccount
    ) internal withOraclePricesForAtomicAction(relayParams.oracleParams) {
        _handleTokenPermits(relayParams.tokenPermits);
        _handleExternalCalls(account, relayParams.externalCalls, isSubaccount);

        return _handleRelayFee(contracts, relayParams, account, isSubaccount);
    }

    function _handleExternalCalls(address account, ExternalCalls calldata externalCalls, bool isSubaccount) internal {
        if (externalCalls.externalCallTargets.length == 0) {
            return;
        }

        if (isSubaccount) {
            // malicious subaccount could steal main account funds through external calls
            revert Errors.NonEmptyExternalCallsForSubaccountOrder();
        }

        if (
            externalCalls.sendTokens.length == 0 || externalCalls.sendTokens.length != externalCalls.sendAmounts.length
        ) {
            revert Errors.InvalidExternalCalls(externalCalls.sendTokens.length, externalCalls.sendAmounts.length);
        }

        for (uint256 i = 0; i < externalCalls.sendTokens.length; i++) {
            _sendTokens(account, externalCalls.sendTokens[i], address(externalHandler), externalCalls.sendAmounts[i]);
        }

        externalHandler.makeExternalCalls(
            externalCalls.externalCallTargets,
            externalCalls.externalCallDataList,
            externalCalls.refundTokens,
            externalCalls.refundReceivers
        );
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
        bool isSubaccount
    ) internal {
        if (_isGelatoRelay(msg.sender) && _getFeeToken() != contracts.wnt) {
            revert Errors.UnsupportedRelayFeeToken(_getFeeToken(), contracts.wnt);
        }

        if (relayParams.fee.feeSwapPath.length != 0) {
            if (isSubaccount) {
                // a malicious subaccount could create a large swap with a negative price impact
                // and then execute a personal swap with a positive price impact
                // to mitigate this, we limit the max relay fee swap size for subaccounts
                uint256 maxRelayFeeSwapUsd = contracts.dataStore.getUint(Keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT);
                uint256 relayFeeUsd = relayParams.fee.feeAmount * oracle.getPrimaryPrice(relayParams.fee.feeToken).min;
                if (relayFeeUsd > maxRelayFeeSwapUsd) {
                    revert Errors.MaxRelayFeeSwapForSubaccountExceeded(relayFeeUsd, maxRelayFeeSwapUsd);
                }
            }

            _sendTokens(account, relayParams.fee.feeToken, address(contracts.orderVault), relayParams.fee.feeAmount);
            RelayUtils.swapFeeTokens(contracts, eventEmitter, oracle, relayParams.fee);
        } else if (relayParams.fee.feeToken == contracts.wnt) {
            // fee tokens could be sent through external calls
            // in this case feeAmount could be 0 and there is no need to call _sendTokens
            if (relayParams.fee.feeAmount != 0) {
                _sendTokens(account, relayParams.fee.feeToken, address(this), relayParams.fee.feeAmount);
            }
        } else {
            revert Errors.UnexpectedRelayFeeToken(relayParams.fee.feeToken, contracts.wnt);
        }
    }

    function _handleRelayAfterAction(
        Contracts memory contracts,
        uint256 startingGas,
        address residualFeeReceiver
    ) internal {
        bool isSponsoredCall = !_isGelatoRelay(msg.sender);
        uint256 residualFeeAmount = ERC20(contracts.wnt).balanceOf(address(this));
        uint256 relayFee;
        if (isSponsoredCall) {
            relayFee = GasUtils.payGelatoRelayFee(
                contracts.dataStore,
                contracts.wnt,
                startingGas,
                msg.data.length,
                residualFeeAmount
            );
        } else {
            relayFee = _getFee();

            if (relayFee > residualFeeAmount) {
                revert Errors.InsufficientRelayFee(relayFee, residualFeeAmount);
            }

            _transferRelayFee();
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

    function _validateGaslessFeature() internal view {
        FeatureUtils.validateFeature(dataStore, Keys.gaslessFeatureDisabledKey(address(this)));
    }
}
