// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseRouter.sol";
import "../exchange/IOrderHandler.sol";
import "../feature/FeatureUtils.sol";

contract SubaccountRouter is BaseRouter {
    IOrderHandler public immutable orderHandler;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOrderHandler _orderHandler
    ) BaseRouter(_router, _roleStore, _dataStore, _eventEmitter) {
        orderHandler = _orderHandler;
    }

    function createOrder(
        BaseOrderUtils.CreateOrderParams calldata params
    ) external payable nonReentrant returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        address account = msg.sender;

        return orderHandler.createOrder(
            account,
            params
        );
    }
}
