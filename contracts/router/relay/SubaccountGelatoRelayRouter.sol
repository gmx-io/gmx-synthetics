// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../router/Router.sol";
import "./BaseGelatoRelayRouter.sol";
import "./SubaccountRouterUtils.sol";

contract SubaccountGelatoRelayRouter is BaseGelatoRelayRouter {
    mapping(address => uint256) public subaccountApprovalNonces;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler
    )
        BaseGelatoRelayRouter(_oracle, _orderHandler, _orderVault, _externalHandler)
        BaseRouter(_router, _roleStore, _dataStore, _eventEmitter)

    {}

    struct BatchVars {
        bytes32 structHash;
        uint256 actionsCount;
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function batch(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        address subaccount,
        BatchParams calldata params
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId */, true) returns (bytes32[] memory) {
        BatchVars memory vars;
        vars.structHash = RelayUtils.getBatchStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, vars.structHash, block.chainid /* srcChainId */);

        for (uint256 i = 0; i < params.createOrderParamsList.length; i++) {
            SubaccountRouterUtils.validateCreateOrderParams(account, params.createOrderParamsList[i]);
        }

        vars.actionsCount = params.createOrderParamsList.length +
            params.updateOrderParamsList.length +
            params.cancelOrderKeys.length;

        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, vars.actionsCount, subaccountApproval);

        return _batch(
            account,
            0, // srcChainId
            params.createOrderParamsList,
            params.updateOrderParamsList,
            params.cancelOrderKeys,
            true // isSubaccount
        );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function createOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId */, true) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, block.chainid /* srcChainId */);
        SubaccountRouterUtils.validateCreateOrderParams(account, params);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);

        return
            _createOrder(
                account,
                0, // srcChainId
                params,
                true // isSubaccount
            );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function updateOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        UpdateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId */, true) {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, block.chainid /* srcChainId */);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);

        _updateOrder(
            account,
            params,
            true // isSubaccount
        );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function cancelOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        bytes32 key
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId */, true) {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, subaccountApproval, account, key);
        _validateCall(relayParams, subaccount, structHash, block.chainid /* srcChainId */);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
        _cancelOrder(account, key);
    }

    // @note all params except account should be part of the corresponding struct hash
    function removeSubaccount(
        RelayParams calldata relayParams,
        address account,
        address subaccount
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId */, false) {
        // isSubaccount=false is passed to `withRelay` modifier because this action is signed by the main account
        bytes32 structHash = RelayUtils.getRemoveSubaccountStructHash(relayParams, subaccount);
        _validateCall(relayParams, account, structHash, block.chainid /* srcChainId */);

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
