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
    using Order for Order.Props;

    constructor(
        Router _router,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler
    ) BaseGelatoRelayRouter(_router, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault, _externalHandler) {}

    // @note all params except account should be part of the corresponding struct hash
    function createOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    )
        external
        nonReentrant
        withOraclePricesForAtomicAction(relayParams.oracleParams)
        onlyGelatoRelay
        returns (bytes32)
    {
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, collateralDeltaAmount, params);
        _validateCall(relayParams, account, structHash, params.numbers.srcChainId);

        return _createOrder(relayParams, account, collateralDeltaAmount, params, false);
    }

    // @note all params except account should be part of the corresponding struct hash
    function updateOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        bytes32 key,
        RelayUtils.UpdateOrderParams calldata params,
        bool increaseExecutionFee
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, key, params, increaseExecutionFee);
        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        _validateCall(relayParams, account, structHash, order.srcChainId());

        _updateOrder(relayParams, account, key, params, increaseExecutionFee, false);
    }

    // @note all params except account should be part of the corresponding struct hash
    function cancelOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        _validateCall(relayParams, account, structHash, order.srcChainId());

        _cancelOrder(relayParams, account, key);
    }
}
