// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

import "./Order.sol";

library OrderEventUtils {
    using Order for Order.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitOrderCreated(
        EventEmitter eventEmitter,
        bytes32 key,
        Order.Props memory order
    ) external {
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(5);
        data.addressItems.setItem(0, "account", order.account());
        data.addressItems.setItem(1, "receiver", order.receiver());
        data.addressItems.setItem(2, "callbackContract", order.callbackContract());
        data.addressItems.setItem(3, "market", order.market());
        data.addressItems.setItem(4, "initialCollateralToken", order.initialCollateralToken());

        data.addressItems.initArrayItems(1);
        data.addressItems.setItem(0, "swapPath", order.swapPath());

        data.uintItems.initItems(9);
        data.uintItems.setItem(0, "sizeDeltaUsd", order.sizeDeltaUsd());
        data.uintItems.setItem(1, "initialCollateralDeltaAmount", order.initialCollateralDeltaAmount());
        data.uintItems.setItem(2, "triggerPrice", order.triggerPrice());
        data.uintItems.setItem(3, "acceptablePrice", order.acceptablePrice());
        data.uintItems.setItem(4, "executionFee", order.executionFee());
        data.uintItems.setItem(5, "callbackGasLimit", order.callbackGasLimit());
        data.uintItems.setItem(6, "minOutputAmount", order.minOutputAmount());
        data.uintItems.setItem(7, "updatedAtBlock", order.updatedAtBlock());
        data.uintItems.setItem(8, "orderType", uint256(order.orderType()));

        data.boolItems.initItems(3);
        data.boolItems.setItem(0, "isLong", order.isLong());
        data.boolItems.setItem(1, "shouldUnwrapNativeToken", order.shouldUnwrapNativeToken());
        data.boolItems.setItem(2, "isFrozen", order.isFrozen());

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog1(
            "OrderCreated",
            Cast.toBytes32(order.account()),
            data
        );
    }
}
