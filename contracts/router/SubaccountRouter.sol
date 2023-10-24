// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseRouter.sol";
import "../exchange/IOrderHandler.sol";
import "../feature/FeatureUtils.sol";
import "../subaccount/SubaccountUtils.sol";
import "../order/OrderVault.sol";
import "../order/OrderStoreUtils.sol";

contract SubaccountRouter is BaseRouter {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    using Order for Order.Props;

    IOrderHandler public immutable orderHandler;
    OrderVault public immutable orderVault;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOrderHandler _orderHandler,
        OrderVault _orderVault
    ) BaseRouter(_router, _roleStore, _dataStore, _eventEmitter) {
        orderHandler = _orderHandler;
        orderVault = _orderVault;
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

    function setSubaccountAutoTopUpAmount(
        address subaccount,
        uint256 amount
    ) external payable nonReentrant {
        address account = msg.sender;

        SubaccountUtils.setSubaccountAutoTopUpAmount(
            dataStore,
            eventEmitter,
            account,
            subaccount,
            amount
        );
    }

    function createOrderForAccount(
        address account,
        BaseOrderUtils.CreateOrderParams calldata params
    ) external payable nonReentrant returns (bytes32) {
        _handleSubaccountAction(account, Keys.SUBACCOUNT_ORDER_ACTION);

        if (params.addresses.receiver != account) {
            revert Errors.InvalidReceiverForSubaccountOrder(params.addresses.receiver, account);
        }

        if (
            params.orderType == Order.OrderType.MarketSwap ||
            params.orderType == Order.OrderType.LimitSwap ||
            params.orderType == Order.OrderType.MarketIncrease ||
            params.orderType == Order.OrderType.LimitIncrease
        ) {
            router.pluginTransfer(
                params.addresses.initialCollateralToken, // token
                account, // account
                address(orderVault), // receiver
                params.numbers.initialCollateralDeltaAmount // amount
            );
        }

        return orderHandler.createOrder(
            account,
            params
        );
    }

    function updateOrder(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 acceptablePrice,
        uint256 triggerPrice,
        uint256 minOutputAmount
    ) external payable nonReentrant {
        Order.Props memory order = OrderStoreUtils.get(dataStore, key);

        _handleSubaccountAction(order.account(), Keys.SUBACCOUNT_ORDER_ACTION);

        orderHandler.updateOrder(
            key,
            sizeDeltaUsd,
            acceptablePrice,
            triggerPrice,
            minOutputAmount,
            order
        );
    }

    function cancelOrder(
        bytes32 key
    ) external payable nonReentrant {
        Order.Props memory order = OrderStoreUtils.get(dataStore, key);

        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        _handleSubaccountAction(order.account(), Keys.SUBACCOUNT_ORDER_ACTION);

        orderHandler.cancelOrder(key);
    }

    function _handleSubaccountAction(address account, bytes32 actionType) internal {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        address subaccount = msg.sender;
        SubaccountUtils.validateSubaccount(dataStore, account, subaccount);

        SubaccountUtils.incrementSubaccountActionCount(
            dataStore,
            eventEmitter,
            account,
            subaccount,
            actionType
        );

        _autoTopUpSubaccount(account, subaccount);
    }

    function _autoTopUpSubaccount(address account, address subaccount) internal {
        uint256 amount = SubaccountUtils.getSubaccountAutoTopUpAmount(dataStore, account, subaccount);
        if (amount == 0) {
            return;
        }

        IERC20 wnt = IERC20(dataStore.getAddress(Keys.WNT));

        if (wnt.allowance(account, address(router)) < amount) { return; }
        if (wnt.balanceOf(account) < amount) { return; }

        router.pluginTransfer(
            address(wnt), // token
            account, // account
            subaccount, // receiver
            amount // amount
        );

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog2(
            "SubaccountAutoTopUp",
            Cast.toBytes32(account),
            Cast.toBytes32(subaccount),
            eventData
        );
    }
}
