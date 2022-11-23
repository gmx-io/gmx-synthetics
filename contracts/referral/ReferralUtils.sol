// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "../event/EventEmitter.sol";

import "./IReferralStorage.sol";
import "./ReferralTier.sol";

import "../utils/Precision.sol";

library ReferralUtils {
    function setTraderReferralCode(
        IReferralStorage referralStorage,
        address account,
        bytes32 referralCode
    ) internal {
        if (referralCode == bytes32(0)) {
            return;
        }

        referralStorage.setTraderReferralCode(account, referralCode);
    }

    function incrementAffiliateReward(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address affiliate,
        address trader,
        address token,
        uint256 delta
    ) internal {
        if (delta == 0) {
            return;
        }

        dataStore.incrementUint(Keys.affiliateRewardKey(affiliate, token), delta);
        eventEmitter.emitAffiliateReward(affiliate, trader, token, delta);
    }

    function getReferralInfo(
        IReferralStorage referralStorage,
        address trader
    ) internal view returns (address, uint256, uint256) {
        bytes32 code = referralStorage.traderReferralCodes(trader);
        address affiliate;
        uint256 totalRebate;
        uint256 discountShare;

        if (code != bytes32(0)) {
            affiliate = referralStorage.codeOwners(code);
            uint256 referralTierLevel = referralStorage.referrerTiers(affiliate);
            ReferralTier.Props memory referralTier = referralStorage.tiers(referralTierLevel);

            totalRebate = referralTier.totalRebate;
            discountShare = referralTier.discountShare;

            uint256 customDiscountShare = referralStorage.referrerDiscountShares(affiliate);
            if (customDiscountShare != 0) {
                discountShare = customDiscountShare;
            }
        }

        return (
            affiliate,
            Precision.basisPointsToFloat(totalRebate),
            Precision.basisPointsToFloat(discountShare)
        );
    }
}
