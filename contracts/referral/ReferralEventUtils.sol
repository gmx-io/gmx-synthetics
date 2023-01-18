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

    function emitTraderReferralDiscountApplied(
        EventEmitter eventEmitter,
        address market,
        address token,
        address trader,
        uint256 amount
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "trader", trader);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            "TraderReferralDiscountApplied",
            Cast.toBytes32(trader),
            eventData
        );
    }

    function emitAffiliateRewardEarned(
        EventEmitter eventEmitter,
        address market,
        address token,
        address affiliate,
        address trader,
        uint256 amount
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(4);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "affiliate", affiliate);
        eventData.addressItems.setItem(3, "trader", trader);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            "AffiliateRewardEarned",
            Cast.toBytes32(affiliate),
            eventData
        );
    }

    function emitAffiliateRewardClaimed(
        EventEmitter eventEmitter,
        address market,
        address token,
        address affiliate,
        address trader,
        uint256 amount
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(4);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "affiliate", affiliate);
        eventData.addressItems.setItem(3, "trader", trader);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            "AffiliateRewardClaimed",
            Cast.toBytes32(affiliate),
            eventData
        );
    }
}
