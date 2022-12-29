// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter2.sol";
import "./Order.sol";

library OrderEventUtils {
    using Order for Order.Props;

    function emitOrderCreated(
        EventEmitter2 eventEmitter,
        bytes32 key,
        Order.Props memory order
    ) external {
        EventUtils.AddressItems memory addressItems;
        addressItems.values = new EventUtils.AddressKeyValue[](5);
        addressItems.values[0] = EventUtils.AddressKeyValue("account", order.account());
        addressItems.values[1] = EventUtils.AddressKeyValue("receiver", order.receiver());
        addressItems.values[2] = EventUtils.AddressKeyValue("callbackContract", order.callbackContract());
        addressItems.values[3] = EventUtils.AddressKeyValue("market", order.market());
        addressItems.values[4] = EventUtils.AddressKeyValue("initialCollateralToken", order.initialCollateralToken());
        addressItems.arrayValues = new EventUtils.AddressArrayKeyValue[](1);
        addressItems.arrayValues[0] = EventUtils.AddressArrayKeyValue("swapPath", order.swapPath());

        EventUtils.UintItems memory uintItems;
        uintItems.values = new EventUtils.UintKeyValue[](9);
        uintItems.values[0] = EventUtils.UintKeyValue("sizeDeltaUsd", order.sizeDeltaUsd());
        uintItems.values[1] = EventUtils.UintKeyValue("initialCollateralDeltaAmount", order.initialCollateralDeltaAmount());
        uintItems.values[2] = EventUtils.UintKeyValue("triggerPrice", order.triggerPrice());
        uintItems.values[3] = EventUtils.UintKeyValue("acceptablePrice", order.acceptablePrice());
        uintItems.values[4] = EventUtils.UintKeyValue("executionFee", order.executionFee());
        uintItems.values[5] = EventUtils.UintKeyValue("callbackGasLimit", order.callbackGasLimit());
        uintItems.values[6] = EventUtils.UintKeyValue("minOutputAmount", order.minOutputAmount());
        uintItems.values[7] = EventUtils.UintKeyValue("updatedAtBlock", order.updatedAtBlock());
        uintItems.values[8] = EventUtils.UintKeyValue("orderType", uint256(order.orderType()));

        EventUtils.IntItems memory intItems;

        EventUtils.BoolItems memory boolItems;
        boolItems.values = new EventUtils.BoolKeyValue[](3);
        boolItems.values[0] = EventUtils.BoolKeyValue("isLong", order.isLong());
        boolItems.values[1] = EventUtils.BoolKeyValue("shouldUnwrapNativeToken", order.shouldUnwrapNativeToken());
        boolItems.values[2] = EventUtils.BoolKeyValue("isFrozen", order.isFrozen());

        EventUtils.Bytes32Items memory bytes32Items;
        bytes32Items.values = new EventUtils.Bytes32KeyValue[](1);
        bytes32Items.values[0] = EventUtils.Bytes32KeyValue("key", key);

        EventUtils.DataItems memory dataItems;

        eventEmitter.log(
            "PoolAmountUpdated",
            addressItems,
            uintItems,
            intItems,
            boolItems,
            bytes32Items,
            dataItems
        );
    }
}
