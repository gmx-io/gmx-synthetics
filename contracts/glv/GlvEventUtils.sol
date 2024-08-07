// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

library GlvEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitGlvMarketAdded(EventEmitter eventEmitter, address glv, address market) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "glv", glv);
        eventData.addressItems.setItem(1, "market", market);

        eventEmitter.emitEventLog2("GlvMarketAdded", Cast.toBytes32(glv), Cast.toBytes32(market), eventData);
    }

    function emitGlvMarketRemoved(EventEmitter eventEmitter, address glv, address market) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "glv", glv);
        eventData.addressItems.setItem(1, "market", market);

        eventEmitter.emitEventLog2("GlvMarketRemoved", Cast.toBytes32(glv), Cast.toBytes32(market), eventData);
    }

    function emitGlvValueUpdated(EventEmitter eventEmitter, address glv, uint256 value, uint256 supply) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "glv", glv);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "value", value);
        eventData.uintItems.setItem(1, "supply", supply);

        eventEmitter.emitEventLog1("GlvValueUpdated", Cast.toBytes32(glv), eventData);
    }
}
