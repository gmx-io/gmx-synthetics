// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../event/EventEmitter.sol";
import "../../exchange/IOrderHandler.sol";
import "../../order/IBaseOrderUtils.sol";
import "../../order/OrderVault.sol";
import "../../router/Router.sol";
import "./BaseGelatoRelayRouterERC2771.sol";

contract GelatoRelayRouterERC2771 is BaseGelatoRelayRouterERC2771 {
    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault
    ) BaseGelatoRelayRouterERC2771(_router, _roleStore, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault) {}

    function createOrder(
        RelayParams calldata relayParams,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    )
        external
        nonReentrant
        withOraclePricesForAtomicAction(relayParams.oracleParams)
        onlyGelatoRelayERC2771
        returns (bytes32)
    {
        // should not use msg.sender directly because Gelato relayer passes it in calldata
        address account = _getMsgSender();
        return _createOrder(relayParams.tokenPermits, relayParams.fee, collateralDeltaAmount, params, account);
    }

    function updateOrder(
        RelayParams calldata relayParams,
        bytes32 key,
        UpdateOrderParams calldata params
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelayERC2771 {
        // should not use msg.sender directly because Gelato relayer passes it in calldata
        address account = _getMsgSender();
        _updateOrder(relayParams, account, key, params);
    }

    function cancelOrder(
        RelayParams calldata relayParams,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelayERC2771 {
        // should not use msg.sender directly because Gelato relayer passes it in calldata
        address account = _getMsgSender();
        _cancelOrder(relayParams, account, key);
    }
}
