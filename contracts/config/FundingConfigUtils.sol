// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {Keys} from "../data/Keys.sol";

library FundingConfigUtils {
    function getFundingConfigKeys() internal pure returns (bytes32[9] memory) {
        return [
            Keys.FUNDING_FACTOR,
            Keys.FUNDING_EXPONENT_FACTOR,
            Keys.FUNDING_INCREASE_FACTOR_PER_SECOND,
            Keys.MIN_FUNDING_INCREASE_RATE_PER_SECOND,
            Keys.FUNDING_DECREASE_FACTOR_PER_SECOND,
            Keys.MIN_FUNDING_FACTOR_PER_SECOND,
            Keys.MAX_FUNDING_FACTOR_PER_SECOND,
            Keys.THRESHOLD_FOR_STABLE_FUNDING,
            Keys.THRESHOLD_FOR_DECREASE_FUNDING
        ];
    }

    function isFundingConfigKey(bytes32 baseKey) internal pure returns (bool) {
        bytes32[9] memory fundingConfigKeys = getFundingConfigKeys();
        for (uint256 i; i < fundingConfigKeys.length; i++) {
            if (baseKey == fundingConfigKeys[i]) {
                return true;
            }
        }

        return false;
    }
}
