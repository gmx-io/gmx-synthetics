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
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler
    )
        BaseGelatoRelayRouter(_router, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault, _externalHandler)
    {}

    // @note all params except account should be part of the corresponding struct hash
    function batch(
        RelayParams calldata relayParams,
        address account,
        BatchParams calldata params
    ) external nonReentrant withRelay(relayParams, account, false) returns (bytes32[] memory) {
        bytes32 structHash = RelayUtils.getBatchStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return _batch(
            account,
            params.createOrderParamsList,
            params.updateOrderParamsList,
            params.cancelOrderKeys,
            false // isSubaccount
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function createOrder(
        RelayParams calldata relayParams,
        address account,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return
            _createOrder(
                account,
                params,
                false // isSubaccount
            );
    }

    // @note all params except account should be part of the corresponding struct hash
    function updateOrder(
        RelayParams calldata relayParams,
        address account,
        UpdateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, false) {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        _updateOrder(
            account,
            params,
            false // isSubaccount
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function cancelOrder(
        RelayParams calldata relayParams,
        address account,
        bytes32 key
    ) external nonReentrant withRelay(relayParams, account, false) {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash);

        _cancelOrder(account, key);
    }
}
