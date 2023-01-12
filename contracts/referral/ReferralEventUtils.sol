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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(3);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);
        data.addressItems.setItem(2, "trader", trader);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            "TraderReferralDiscountApplied",
            Cast.toBytes32(trader),
            data
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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(4);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);
        data.addressItems.setItem(2, "affiliate", affiliate);
        data.addressItems.setItem(3, "trader", trader);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            "AffiliateRewardEarned",
            Cast.toBytes32(affiliate),
            data
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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(4);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);
        data.addressItems.setItem(2, "affiliate", affiliate);
        data.addressItems.setItem(3, "trader", trader);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            "AffiliateRewardClaimed",
            Cast.toBytes32(affiliate),
            data
        );
    }
}
