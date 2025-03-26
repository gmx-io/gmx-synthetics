// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../order/IBaseOrderUtils.sol";
import "../../router/Router.sol";
import "../../feature/FeatureUtils.sol";
import "../../subaccount/SubaccountUtils.sol";
import "./BaseGelatoRelayRouter.sol";

contract SubaccountGelatoRelayRouter is BaseGelatoRelayRouter {
    mapping(address => uint256) public subaccountApprovalNonces;

    constructor(
        Router _router,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler
    )
        BaseGelatoRelayRouter(_router, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault, _externalHandler)
    {}

    struct BatchVars {
        uint256 startingGas;
        uint256 actionsCount;
        bytes32 structHash;
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function batch(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        address subaccount,
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) external nonReentrant {
        BatchVars memory vars;
        vars.startingGas = gasleft();

        _validateGaslessFeature();
        vars.structHash = RelayUtils.getBatchStructHash(
            relayParams,
            subaccountApproval,
            account,
            createOrderParamsList,
            updateOrderParamsList,
            cancelOrderKeys
        );
        _validateCall(relayParams, subaccount, vars.structHash);

        for (uint256 i = 0; i < createOrderParamsList.length; i++) {
            _validateCreateOrderParams(account, createOrderParamsList[i]);
        }

        vars.actionsCount = createOrderParamsList.length + updateOrderParamsList.length + cancelOrderKeys.length;
        if (vars.actionsCount == 0) {
            revert Errors.RelayEmptyBatch();
        }

        _handleSubaccountAction(
            account,
            subaccount,
            Keys.SUBACCOUNT_ORDER_ACTION,
            vars.actionsCount,
            subaccountApproval
        );

        _batch(
            relayParams,
            account,
            createOrderParamsList,
            updateOrderParamsList,
            cancelOrderKeys,
            false, // isSubaccount
            vars.startingGas
        );
    }

    function _validateCreateOrderParams(
        address account,
        IBaseOrderUtils.CreateOrderParams memory params
    ) internal pure {
        if (params.addresses.receiver != account) {
            revert Errors.InvalidReceiver(params.addresses.receiver);
        }

        if (params.addresses.cancellationReceiver != address(0) && params.addresses.cancellationReceiver != account) {
            revert Errors.InvalidCancellationReceiverForSubaccountOrder(params.addresses.cancellationReceiver, account);
        }
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function createOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant returns (bytes32) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(
            relayParams,
            subaccountApproval,
            account,
            params
        );
        _validateCall(relayParams, subaccount, structHash);
        _validateCreateOrderParams(account, params);

        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);

        return
            _createOrder(
                relayParams,
                account,
                params,
                true, // isSubaccount
                startingGas
            );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function updateOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        UpdateOrderParams calldata params
    ) external nonReentrant {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
        _updateOrder(
            relayParams,
            account,
            params,
            true, // isSubaccount
            startingGas
        );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function cancelOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        bytes32 key
    ) external nonReentrant {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, subaccountApproval, account, key);
        _validateCall(relayParams, subaccount, structHash);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
        _cancelOrder(
            relayParams,
            account,
            key,
            true, // isSubaccount
            startingGas
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function removeSubaccount(
        RelayParams calldata relayParams,
        address account,
        address subaccount
    ) external nonReentrant {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getRemoveSubaccountStructHash(relayParams, subaccount);
        _validateCall(relayParams, account, structHash);

        Contracts memory contracts = _getContracts();
        uint256 residualFeeAmount = _handleRelayBeforeAction(
            contracts,
            relayParams,
            account,
            false // isSubaccount is false because the `removeSubaccount` call is signed by the main account
        );

        SubaccountUtils.removeSubaccount(dataStore, eventEmitter, account, subaccount);

        _handleRelayAfterAction(
            contracts,
            startingGas,
            residualFeeAmount,
            account
        );
    }

    function _handleSubaccountAction(
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 actionsCount,
        SubaccountApproval calldata subaccountApproval
    ) internal {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        _handleSubaccountApproval(account, subaccountApproval);

        SubaccountUtils.handleSubaccountAction(dataStore, eventEmitter, account, subaccount, actionType, actionsCount);
    }

    function _handleSubaccountApproval(address account, SubaccountApproval calldata subaccountApproval) internal {
        if (subaccountApproval.signature.length == 0) {
            return;
        }

        if (subaccountApproval.subaccount == address(0)) {
            revert Errors.InvalidSubaccountApprovalSubaccount();
        }

        if (block.timestamp > subaccountApproval.deadline) {
            revert Errors.SubaccountApprovalDeadlinePassed(block.timestamp, subaccountApproval.deadline);
        }

        uint256 storedNonce = subaccountApprovalNonces[account];
        if (storedNonce != subaccountApproval.nonce) {
            revert Errors.InvalidSubaccountApprovalNonce(storedNonce, subaccountApproval.nonce);
        }
        subaccountApprovalNonces[account] = storedNonce + 1;

        bytes32 domainSeparator = _getDomainSeparator(block.chainid);
        bytes32 structHash = RelayUtils.getSubaccountApprovalStructHash(subaccountApproval);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        _validateSignature(digest, subaccountApproval.signature, account, "subaccount approval");

        SubaccountUtils.handleSubaccountApproval(dataStore, eventEmitter, account, subaccountApproval);
    }
}
