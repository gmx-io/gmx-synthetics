// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

library ReferralEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitAffiliateRewardUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        address affiliate,
        uint256 delta,
        uint256 nextValue,
        uint256 nextPoolValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "affiliate", affiliate);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "delta", delta);
        eventData.uintItems.setItem(1, "nextValue", nextValue);
        eventData.uintItems.setItem(2, "nextPoolValue", nextPoolValue);

        eventEmitter.emitEventLog2(
            "AffiliateRewardUpdated",
            Cast.toBytes32(market),
            Cast.toBytes32(affiliate),
            eventData
        );
    }

    function emitAffiliateRewardClaimed(
        EventEmitter eventEmitter,
        address market,
        address token,
        address affiliate,
        address receiver,
        uint256 amount,
        uint256 nextPoolValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(4);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "affiliate", affiliate);
        eventData.addressItems.setItem(3, "receiver", receiver);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "nextPoolValue", nextPoolValue);

        eventEmitter.emitEventLog1(
            "AffiliateRewardClaimed",
            Cast.toBytes32(affiliate),
            eventData
        );
    }
}
