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

    // @note all params except subaccount should be part of the corresponding struct hash
    function batch(
        RelayParams calldata relayParams,
        address account,
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getBatchStructHash(
            relayParams,
            createOrderParamsList,
            updateOrderParamsList,
            cancelOrderKeys
        );
        _validateCall(relayParams, account, structHash);

        _batch(
            relayParams,
            account,
            createOrderParamsList,
            updateOrderParamsList,
            cancelOrderKeys,
            false, // isSubaccount
            startingGas
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function createOrder(
        RelayParams calldata relayParams,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) returns (bytes32) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return
            _createOrder(
                relayParams,
                account,
                params,
                false, // isSubaccount
                startingGas
            );
    }

    // @note all params except account should be part of the corresponding struct hash
    function updateOrder(
        RelayParams calldata relayParams,
        address account,
        UpdateOrderParams calldata params
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        _updateOrder(
            relayParams,
            account,
            params,
            false, // isSubaccount
            startingGas
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function cancelOrder(
        RelayParams calldata relayParams,
        address account,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash);

        _cancelOrder(
            relayParams,
            account,
            key,
            false, // isSubaccount
            startingGas
        );
    }
}
