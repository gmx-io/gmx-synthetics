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
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        uint256 srcChainId,
        address subaccount,
        IRelayUtils.BatchParams calldata params
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

    // @dev needed to keep `batch` under the stack limit
    function _handleBatch(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        uint256 srcChainId,
        address subaccount,
        IRelayUtils.BatchParams calldata params
    ) private {
        bytes32 structHash = RelayUtils.getBatchStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);

        for (uint256 i = 0; i < params.createOrderParamsList.length; i++) {
            SubaccountUtils.validateCreateOrderParams(account, params.createOrderParamsList[i]);
        }

        uint256 actionsCount = params.createOrderParamsList.length +
            params.updateOrderParamsList.length +
            params.cancelOrderKeys.length;

        _handleSubaccountOrderAction(account, srcChainId, subaccount, actionsCount, subaccountApproval);
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function createOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) returns (bytes32) {
        _handleCreateOrder(relayParams, subaccountApproval, account, srcChainId, subaccount, params);

        return
            _createOrder(
                account,
                srcChainId,
                params,
                true // isSubaccount
            );
    }

    // @dev needed to keep `createOrder` under the stack limit
    function _handleCreateOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) private {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        SubaccountUtils.validateCreateOrderParams(account, params);
        _handleSubaccountOrderAction(account, srcChainId, subaccount, 1, subaccountApproval);
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function updateOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        IRelayUtils.UpdateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) {
        _handleUpdateOrder(relayParams, subaccountApproval, account, srcChainId, subaccount, params);
        _updateOrder(
            account,
            params,
            true // isSubaccount
        );
    }

    // @dev needed to keep `updateOrder` under the stack limit
    function _handleUpdateOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        IRelayUtils.UpdateOrderParams calldata params
    ) private {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        _handleSubaccountOrderAction(account, srcChainId, subaccount, 1, subaccountApproval);
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function cancelOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        bytes32 key
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) {
        _handleCancelOrder(relayParams, subaccountApproval, account, srcChainId, subaccount, key);
        _cancelOrder(account, key);
    }

    // @dev needed to keep `cancelOrder` under the stack limit
    function _handleCancelOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        bytes32 key
    ) private {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, subaccountApproval, account, key);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        _handleSubaccountOrderAction(account, srcChainId, subaccount, 1, subaccountApproval);
    }

    // @note all params except account/srcChainId should be part of the corresponding struct hash
    function removeSubaccount(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address subaccount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        // isSubaccount=false is passed to `withRelay` modifier because this action is signed by the main account
        bytes32 structHash = RelayUtils.getRemoveSubaccountStructHash(relayParams, subaccount);
        _validateCall(relayParams, account, structHash, srcChainId);

        SubaccountUtils.removeSubaccount(dataStore, eventEmitter, account, subaccount);
    }

    function _handleSubaccountOrderAction(
        address account,
        uint256 srcChainId,
        address subaccount,
        uint256 actionsCount,
        SubaccountApproval calldata subaccountApproval
    ) private {
        SubaccountRouterUtils.handleSubaccountAction(
            dataStore,
            eventEmitter,
            account,
            srcChainId,
            subaccount,
            Keys.SUBACCOUNT_ORDER_ACTION, // actionType
            actionsCount,
            subaccountApproval,
            subaccountApprovalNonces
        );
    }
}
