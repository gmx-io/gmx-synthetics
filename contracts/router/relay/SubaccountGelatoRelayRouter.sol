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
        IOracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        ISwapHandler _swapHandler,
        IExternalHandler _externalHandler
    )
        BaseGelatoRelayRouter(_oracle, _orderHandler, _orderVault, _swapHandler, _externalHandler)
        BaseRouter(_router, _roleStore, _dataStore, _eventEmitter)
    {}

    struct BatchVars {
        bytes32 structHash;
        uint256 actionsCount;
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function batch(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        address subaccount,
        IRelayUtils.BatchParams calldata params
    )
        external
        nonReentrant
        withRelay(relayParams, account, 0, true) // srcChainId is the current block.chainId
        returns (bytes32[] memory)
    {
        BatchVars memory vars;
        vars.structHash = RelayUtils.getBatchStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, vars.structHash, block.chainid /* srcChainId */);

        for (uint256 i = 0; i < params.createOrderParamsList.length; i++) {
            SubaccountUtils.validateCreateOrderParams(account, params.createOrderParamsList[i]);
        }

        vars.actionsCount =
            params.createOrderParamsList.length +
            params.updateOrderParamsList.length +
            params.cancelOrderKeys.length;

        _handleSubaccountOrderAction(
            account,
            subaccount,
            vars.actionsCount,
            subaccountApproval
        );

        return
            _batch(
                account,
                0, // srcChainId is the current block.chainId
                params.createOrderParamsList,
                params.updateOrderParamsList,
                params.cancelOrderKeys,
                true // isSubaccount
            );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function createOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        IBaseOrderUtils.CreateOrderParams calldata params
    )
        external
        nonReentrant
        withRelay(relayParams, account, 0, true) // srcChainId is the current block.chainId
        returns (bytes32)
    {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, block.chainid /* srcChainId */);
        SubaccountUtils.validateCreateOrderParams(account, params);
        _handleSubaccountOrderAction(account, subaccount, 1, subaccountApproval);

        return
            _createOrder(
                account,
                0, // srcChainId is the current block.chainId
                params,
                true // isSubaccount
            );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function updateOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        IRelayUtils.UpdateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId is the current block.chainId */, true) {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, block.chainid /* srcChainId */);
        _handleSubaccountOrderAction(account, subaccount, 1, subaccountApproval);

        _updateOrder(
            account,
            params,
            true // isSubaccount
        );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function cancelOrder(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        bytes32 key
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId is the current block.chainId */, true) {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, subaccountApproval, account, key);
        _validateCall(relayParams, subaccount, structHash, block.chainid /* srcChainId */);
        _handleSubaccountOrderAction(account, subaccount, 1, subaccountApproval);
        _cancelOrder(account, key);
    }

    // @note all params except account should be part of the corresponding struct hash
    function removeSubaccount(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address subaccount
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId is the current block.chainId */, false) {
        // isSubaccount=false is passed to `withRelay` modifier because this action is signed by the main account
        bytes32 structHash = RelayUtils.getRemoveSubaccountStructHash(relayParams, subaccount);
        _validateCall(relayParams, account, structHash, block.chainid /* srcChainId */);

        SubaccountUtils.removeSubaccount(dataStore, eventEmitter, account, subaccount);
    }

    function _handleSubaccountOrderAction(
        address account,
        address subaccount,
        uint256 actionsCount,
        SubaccountApproval calldata subaccountApproval
    ) private {
        SubaccountRouterUtils.handleSubaccountAction(
            dataStore,
            eventEmitter,
            account,
            block.chainid, // srcChainId
            subaccount,
            Keys.SUBACCOUNT_ORDER_ACTION, // actionType
            actionsCount,
            subaccountApproval,
            subaccountApprovalNonces
        );
    }
}
