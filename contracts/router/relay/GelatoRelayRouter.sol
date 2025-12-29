// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../event/EventEmitter.sol";
import "../../exchange/IOrderHandler.sol";
import "../../order/IBaseOrderUtils.sol";
import "../../order/OrderVault.sol";
import "../../router/Router.sol";
import "./BaseGelatoRelayRouter.sol";

contract GelatoRelayRouter is BaseGelatoRelayRouter {
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

    // @note all params except account should be part of the corresponding struct hash
    function batch(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.BatchParams calldata params
    )
        external
        nonReentrant
        withRelay(relayParams, account, 0, false) // srcChainId is the current block.chainId
        returns (bytes32[] memory)
    {
        bytes32 structHash = RelayUtils.getBatchStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, block.chainid /* srcChainId */);

        return
            _batch(
                account,
                0, // srcChainId is the current block.chainId
                params.createOrderParamsList,
                params.updateOrderParamsList,
                params.cancelOrderKeys,
                false // isSubaccount
            );
    }

    // @note all params except account should be part of the corresponding struct hash
    function createOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IBaseOrderUtils.CreateOrderParams calldata params
    )
        external
        nonReentrant
        withRelay(relayParams, account, 0, false) // srcChainId is the current block.chainId
        returns (bytes32)
    {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, block.chainid /* srcChainId */);

        return
            _createOrder(
                account,
                0, // srcChainId is the current block.chainId
                params,
                false // isSubaccount
            );
    }

    // @note all params except account should be part of the corresponding struct hash
    function updateOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.UpdateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId is the current block.chainId */, false) {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, block.chainid /* srcChainId */);

        _updateOrder(
            account,
            params,
            false // isSubaccount
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function cancelOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        bytes32 key
    ) external nonReentrant withRelay(relayParams, account, 0 /* srcChainId is the current block.chainId */, false) {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, block.chainid /* srcChainId */);

        _cancelOrder(account, key);
    }
}
