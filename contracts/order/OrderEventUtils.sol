// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "./Order.sol";

library OrderEventUtils {
    using Order for Order.Props;

    function emitOrderCreated(
        EventEmitter eventEmitter,
        bytes32 key,
        Order.Props memory order
    ) external {
        EventUtils.AddressItems memory addressItems;
        addressItems.items = new EventUtils.AddressKeyValue[](5);
        addressItems.items[0] = EventUtils.AddressKeyValue("account", order.account());
        addressItems.items[1] = EventUtils.AddressKeyValue("receiver", order.receiver());
        addressItems.items[2] = EventUtils.AddressKeyValue("callbackContract", order.callbackContract());
        addressItems.items[3] = EventUtils.AddressKeyValue("market", order.market());
        addressItems.items[4] = EventUtils.AddressKeyValue("initialCollateralToken", order.initialCollateralToken());
        addressItems.arrayItems = new EventUtils.AddressArrayKeyValue[](1);
        addressItems.arrayItems[0] = EventUtils.AddressArrayKeyValue("swapPath", order.swapPath());

        EventUtils.UintItems memory uintItems;
        uintItems.items = new EventUtils.UintKeyValue[](9);
        uintItems.items[0] = EventUtils.UintKeyValue("sizeDeltaUsd", order.sizeDeltaUsd());
        uintItems.items[1] = EventUtils.UintKeyValue("initialCollateralDeltaAmount", order.initialCollateralDeltaAmount());
        uintItems.items[2] = EventUtils.UintKeyValue("triggerPrice", order.triggerPrice());
        uintItems.items[3] = EventUtils.UintKeyValue("acceptablePrice", order.acceptablePrice());
        uintItems.items[4] = EventUtils.UintKeyValue("executionFee", order.executionFee());
        uintItems.items[5] = EventUtils.UintKeyValue("callbackGasLimit", order.callbackGasLimit());
        uintItems.items[6] = EventUtils.UintKeyValue("minOutputAmount", order.minOutputAmount());
        uintItems.items[7] = EventUtils.UintKeyValue("updatedAtBlock", order.updatedAtBlock());
        uintItems.items[8] = EventUtils.UintKeyValue("orderType", uint256(order.orderType()));

        EventUtils.IntItems memory intItems;

        EventUtils.BoolItems memory boolItems;
        boolItems.items = new EventUtils.BoolKeyValue[](3);
        boolItems.items[0] = EventUtils.BoolKeyValue("isLong", order.isLong());
        boolItems.items[1] = EventUtils.BoolKeyValue("shouldUnwrapNativeToken", order.shouldUnwrapNativeToken());
        boolItems.items[2] = EventUtils.BoolKeyValue("isFrozen", order.isFrozen());

        EventUtils.Bytes32Items memory bytes32Items;
        bytes32Items.items = new EventUtils.Bytes32KeyValue[](1);
        bytes32Items.items[0] = EventUtils.Bytes32KeyValue("key", key);

        EventUtils.DataItems memory dataItems;

        eventEmitter.emitEventLog1(
            "OrderCreated",
            bytes32(uint256(uint160(order.account()))),
            addressItems,
            uintItems,
            intItems,
            boolItems,
            bytes32Items,
            dataItems
        );
    }
}
