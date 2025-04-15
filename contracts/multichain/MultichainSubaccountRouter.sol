// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/Router.sol";
import "../router/relay/SubaccountRouterUtils.sol";
import "./MultichainRouter.sol";

contract MultichainSubaccountRouter is MultichainRouter {
    mapping(address => uint256) public subaccountApprovalNonces;

    constructor(
        BaseConstructorParams memory params
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {}

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function batch(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        uint256 srcChainId,
        address subaccount,
        BatchParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) returns (bytes32[] memory) {
        _handleBatch(
            relayParams,
            subaccountApproval,
            account,
            srcChainId,
            subaccount,
            params
        );

        return _batch(
            account,
            srcChainId,
            params.createOrderParamsList,
            params.updateOrderParamsList,
            params.cancelOrderKeys,
            true // isSubaccount
        );
    }

    function _handleBatch(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        uint256 srcChainId,
        address subaccount,
        BatchParams calldata params
    ) private {
        bytes32 structHash = RelayUtils.getBatchStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);

        for (uint256 i = 0; i < params.createOrderParamsList.length; i++) {
            SubaccountRouterUtils.validateCreateOrderParams(account, params.createOrderParamsList[i]);
        }

        uint256 actionsCount = params.createOrderParamsList.length +
            params.updateOrderParamsList.length +
            params.cancelOrderKeys.length;

        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, actionsCount, subaccountApproval);
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function createOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) returns (bytes32) {
        _handleCreateOrder(
            relayParams,
            subaccountApproval,
            account,
            srcChainId,
            subaccount,
            params
        );

        return
            _createOrder(
                account,
                srcChainId,
                params,
                true // isSubaccount
            );
    }

    function _handleCreateOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) private {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        SubaccountRouterUtils.validateCreateOrderParams(account, params);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function updateOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        UpdateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);

        _updateOrder(
            account,
            params,
            true // isSubaccount
        );
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function cancelOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        bytes32 key
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, subaccountApproval, account, key);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
        _cancelOrder(account, key);
    }

    // @note all params except account/srcChainId should be part of the corresponding struct hash
    function removeSubaccount(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address subaccount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        // isSubaccount=false is passed to `withRelay` modifier because this action is signed by the main account
        bytes32 structHash = RelayUtils.getRemoveSubaccountStructHash(relayParams, subaccount);
        _validateCall(relayParams, account, structHash, srcChainId);

        SubaccountUtils.removeSubaccount(dataStore, eventEmitter, account, subaccount);
    }

    function _handleSubaccountAction(
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 actionsCount,
        SubaccountApproval calldata subaccountApproval
    ) private {
        uint256 storedNonce = subaccountApprovalNonces[account];
        SubaccountRouterUtils.handleSubaccountAction(
            dataStore,
            eventEmitter,
            account,
            subaccount,
            actionType,
            actionsCount,
            subaccountApproval,
            storedNonce
        );
        subaccountApprovalNonces[account] = storedNonce + 1;
    }
}
