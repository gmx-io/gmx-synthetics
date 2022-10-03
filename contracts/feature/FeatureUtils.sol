// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

library FeatureUtils {
    error BlockedFeature(bytes32 key);

    function isFeatureBlocked(DataStore dataStore, bytes32 key) internal view returns (bool) {
        return dataStore.getBool(key);
    }

    function validateFeature(DataStore dataStore, bytes32 key) internal view {
        if (isFeatureBlocked(dataStore, key)) {
            revert BlockedFeature(key);
        }
    }
}
