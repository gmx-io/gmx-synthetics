// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title ReferralTier
// @dev Struct for referral tiers
library ReferralTier {
    // @param totalRebate the total rebate for the tier (affiliate reward + trader discount)
    // @param discountShare the share of the totalRebate for traders
    struct Props {
        uint256 totalRebate;
        uint256 discountShare;
    }
}
