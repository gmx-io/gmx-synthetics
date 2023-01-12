// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

// @title FeatureUtils
// @dev Library to validate if a feature is enabled or disabled
library FeatureUtils {
    error DisabledFeature(bytes32 key);

    // @dev get whether a feature is disabled
    // @param dataStore DataStore
    // @param key the feature key
    // @return whether the feature is disabled
    function isFeatureDisabled(DataStore dataStore, bytes32 key) internal view returns (bool) {
        return dataStore.getBool(key);
    }

    // @dev validate whether a feature is enabled, reverts if the feature is disabled
    // @param dataStore DataStore
    // @param key the feature key
    function validateFeature(DataStore dataStore, bytes32 key) internal view {
        if (isFeatureDisabled(dataStore, key)) {
            revert DisabledFeature(key);
        }
    }
}
