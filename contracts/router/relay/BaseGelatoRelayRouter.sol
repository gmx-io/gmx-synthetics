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

    struct Vars {
        Contracts contracts;
        uint256 residualFeeAmount;
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
    ) internal view {
        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(digest, signature);

        // allow to optionally skip signature validation for eth_estimateGas / eth_call if tx.origin is zero
        if (tx.origin == address(0)) {
            return;
        }

        if (error != ECDSA.RecoverError.NoError || recovered != expectedSigner) {
            revert Errors.InvalidSignature(signatureType);
        }
    }

    function _getContracts() internal view returns (Contracts memory contracts) {
        DataStore _dataStore = dataStore;
        address wnt = TokenUtils.wnt(_dataStore);
        contracts = Contracts({dataStore: _dataStore, eventEmitter: eventEmitter, orderVault: orderVault, wnt: wnt});
    }

    function _batch(
        RelayParams calldata relayParams,
        address account,
        BatchCreateOrderParams[] calldata batchCreateOrderParams,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys,
        bool isSubaccount,
        uint256 startingGas
    ) internal {
        Vars memory vars;
        vars.contracts = _getContracts();
        vars.residualFeeAmount = _handleRelayBeforeAction(vars.contracts, relayParams, account, isSubaccount);

        for (uint256 i = 0; i < batchCreateOrderParams.length; i++) {
            vars.residualFeeAmount -= batchCreateOrderParams[i].params.numbers.executionFee;
            _createOrderImpl(
                vars.contracts,
                account,
                batchCreateOrderParams[i].params,
                isSubaccount,
                batchCreateOrderParams[i].collateralDeltaAmount
            );
        }

        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            _updateOrderImpl(vars.contracts, account, updateOrderParamsList[i], isSubaccount);
        }

        for (uint256 i = 0; i < cancelOrderKeys.length; i++) {
            _cancelOrderImpl(vars.contracts, account, cancelOrderKeys[i]);
        }

        _handleRelayAfterAction(
            vars.contracts,
            startingGas,
            vars.residualFeeAmount,
            account,
            relayParams.oracleParams.tokens.length
        );
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
        uint256 feeAmount = _handleRelayBeforeAction(
            contracts,
            relayParams,
            account,
            // params.numbers.executionFee,
            isSubaccount
        );

        bytes32 key = _createOrderImpl(contracts, account, params, isSubaccount, collateralDeltaAmount);
        _handleRelayAfterAction(
            contracts,
            startingGas,
            feeAmount - params.numbers.executionFee,
            account,
            relayParams.oracleParams.tokens.length
        );
        return key;
    }

    function _createOrderImpl(
        Contracts memory contracts,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params,
        bool isSubaccount,
        uint256 collateralDeltaAmount
    ) internal returns (bytes32) {
        IERC20(contracts.wnt).safeTransfer(address(contracts.orderVault), params.numbers.executionFee);

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

        return
            orderHandler.createOrder(account, params, isSubaccount && params.addresses.callbackContract != address(0));
    }

    function _updateOrder(
        RelayParams calldata relayParams,
        address account,
        UpdateOrderParams calldata params,
        bool isSubaccount,
        uint256 startingGas
    ) internal {
        Contracts memory contracts = _getContracts();

        uint256 feeAmount = _handleRelayBeforeAction(contracts, relayParams, account, isSubaccount);

        _updateOrderImpl(contracts, account, params, isSubaccount);

        _handleRelayAfterAction(
            contracts,
            startingGas,
            feeAmount - params.executionFeeIncrease,
            account,
            relayParams.oracleParams.tokens.length
        );
    }

    function _updateOrderImpl(
        Contracts memory contracts,
        address account,
        UpdateOrderParams calldata params,
        bool isSubaccount
    ) internal {
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


    function _cancelOrder(
        RelayParams calldata relayParams,
        address account,
        bytes32 key,
        bool isSubaccount,
        uint256 startingGas
    ) internal {
        Contracts memory contracts = _getContracts();

        uint256 residualFeeAmount = _handleRelayBeforeAction(contracts, relayParams, account, isSubaccount);

        _cancelOrderImpl(contracts, account, key);

        _handleRelayAfterAction(
            contracts,
            startingGas,
            residualFeeAmount,
            account,
            relayParams.oracleParams.tokens.length
        );
    }

    function _cancelOrderImpl(Contracts memory contracts, address account, bytes32 key) internal {
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
    ) internal returns (uint256) {
        if (relayParams.externalCalls.externalCallTargets.length != 0 && relayParams.fee.feeSwapPath.length != 0) {
            revert Errors.InvalidRelayParams();
        }

        if (relayParams.externalCalls.externalCallTargets.length != 0 && isSubaccount) {
            // malicious subaccount could steal main account funds through external calls
            revert Errors.NonEmptyExternalCallsForSubaccountOrder();
        }

        _handleTokenPermits(relayParams.tokenPermits);
        return _handleRelayFee(contracts, relayParams, account);
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
        address account
    ) internal returns (uint256) {
        if (_isGelatoRelay(msg.sender) && _getFeeToken() != contracts.wnt) {
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
            outputAmount = ERC20(contracts.wnt).balanceOf(address(this));
        } else if (relayParams.fee.feeSwapPath.length != 0) {
            _sendTokens(account, relayParams.fee.feeToken, address(contracts.orderVault), relayParams.fee.feeAmount);
            outputAmount = RelayUtils.swapFeeTokens(contracts, oracle, relayParams.fee);
        } else if (relayParams.fee.feeToken == contracts.wnt) {
            _sendTokens(account, relayParams.fee.feeToken, address(this), relayParams.fee.feeAmount);
            outputAmount = relayParams.fee.feeAmount;
        } else {
            revert Errors.UnexpectedRelayFeeToken(relayParams.fee.feeToken, contracts.wnt);
        }

        return outputAmount;
    }

    function _handleRelayAfterAction(
        Contracts memory contracts,
        uint256 startingGas,
        uint256 residualFeeAmount,
        address residualFeeReceiver,
        uint256 oraclePriceCount
    ) internal {
        bool isSponsoredCall = !_isGelatoRelay(msg.sender);
        uint256 relayFee;
        if (isSponsoredCall) {
            relayFee = GasUtils.payGelatoRelayFee(
                contracts.dataStore,
                contracts.wnt,
                startingGas,
                msg.data.length,
                oraclePriceCount,
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
