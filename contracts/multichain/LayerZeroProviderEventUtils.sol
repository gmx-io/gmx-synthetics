// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import { EventEmitter } from "../event/EventEmitter.sol";
import { EventUtils } from "../event/EventUtils.sol";
import { Cast } from "../utils/Cast.sol";

/**
 * @title LayerZeroProviderEventUtils
 */
library LayerZeroProviderEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;

    function emitComposedMessageReceived(
        EventEmitter eventEmitter,
        uint256 srcChainId,
        address account,
        address from,
        bytes32 guid,
        bytes calldata message,
        address executor,
        bytes calldata extraData
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "from", from);
        eventData.addressItems.setItem(2, "executor", executor);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "srcChainId", srcChainId);
        
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "guid", guid);

        eventData.bytesItems.initItems(2);
        eventData.bytesItems.setItem(0, "message", message);
        eventData.bytesItems.setItem(1, "extraData", extraData);

        eventEmitter.emitEventLog1("MessageComposedReceived", Cast.toBytes32(account), eventData);
    }
}
