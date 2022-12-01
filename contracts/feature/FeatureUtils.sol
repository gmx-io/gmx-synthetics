// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

// @title FeatureUtils
// @dev Library to validate if a feature is enabled or blocked
library FeatureUtils {
    error BlockedFeature(bytes32 key);

    // @dev get whether a feature is blocked
    // @param dataStore DataStore
    // @param key the feature key
    // @return whether the feature is blocked
    function isFeatureBlocked(DataStore dataStore, bytes32 key) internal view returns (bool) {
        return dataStore.getBool(key);
    }

    // @dev validate whether a feature is enabled, reverts if the feature is blocked
    // @param dataStore DataStore
    // @param key the feature key
    function validateFeature(DataStore dataStore, bytes32 key) internal view {
        if (isFeatureBlocked(dataStore, key)) {
            revert BlockedFeature(key);
        }
    }
}
