// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../event/EventEmitter.sol";
import "../../event/EventUtils.sol";

import "./GlvShift.sol";

library GlvShiftEventUtils {
    using GlvShift for GlvShift.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitGlvShiftCreated(EventEmitter eventEmitter, bytes32 key, GlvShift.Props memory glvShift) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "fromMarket", glvShift.fromMarket());
        eventData.addressItems.setItem(1, "toMarket", glvShift.toMarket());
        eventData.addressItems.setItem(2, "glv", glvShift.glv());

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "marketTokenAmount", glvShift.marketTokenAmount());
        eventData.uintItems.setItem(1, "minMarketTokens", glvShift.minMarketTokens());
        eventData.uintItems.setItem(2, "updatedAtTime", glvShift.updatedAtTime());

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog1("GlvShiftCreated", key, eventData);
    }

    function emitGlvShiftExecuted(EventEmitter eventEmitter, bytes32 key, uint256 receivedMarketTokens) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "receivedMarketTokens", receivedMarketTokens);

        eventEmitter.emitEventLog1("GlvShiftExecuted", key, eventData);
    }

    function emitGlvShiftCancelled(
        EventEmitter eventEmitter,
        bytes32 key,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.stringItems.initItems(1);
        eventData.stringItems.setItem(0, "reason", reason);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "reasonBytes", reasonBytes);

        eventEmitter.emitEventLog1("GlvShiftCancelled", key, eventData);
    }
}
