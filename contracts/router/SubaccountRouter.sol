// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseRouter.sol";
import "../exchange/IOrderHandler.sol";
import "../feature/FeatureUtils.sol";
import "../subaccount/SubaccountUtils.sol";

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

    function addSubaccount(address subaccount) external payable nonReentrant {
        address account = msg.sender;
        SubaccountUtils.addSubaccount(dataStore, eventEmitter, account, subaccount);
    }

    function removeSubaccount(address subaccount) external payable nonReentrant {
        address account = msg.sender;
        SubaccountUtils.removeSubaccount(dataStore, eventEmitter, account, subaccount);
    }

    function setMaxAllowedSubaccountActionCount(
        address subaccount,
        bytes32 actionType,
        uint256 maxAllowedCount
    ) external payable nonReentrant {
        address account = msg.sender;

        SubaccountUtils.setMaxAllowedSubaccountActionCount(
            dataStore,
            eventEmitter,
            account,
            subaccount,
            actionType,
            maxAllowedCount
        );
    }

    function createOrderForAccount(
        address account,
        BaseOrderUtils.CreateOrderParams calldata params
    ) external payable nonReentrant returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        address subaccount = msg.sender;
        SubaccountUtils.validateSubaccount(dataStore, account, subaccount);

        if (params.addresses.receiver != account) {
            revert Errors.InvalidReceiverForSubaccountOrder(params.addresses.receiver, account);
        }

        SubaccountUtils.incrementSubaccountActionCount(
            dataStore,
            eventEmitter,
            account,
            subaccount,
            Keys.SUBACCOUNT_CREATE_ORDER_ACTION
        );

        return orderHandler.createOrder(
            account,
            params
        );
    }
}
