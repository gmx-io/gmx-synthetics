// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";

// @title FeatureUtils
// @dev Library to validate if a feature is enabled or disabled
// disabling a feature should only be used if it is absolutely necessary
// disabling of features could lead to unexpected effects, e.g. increasing / decreasing of orders
// could be disabled while liquidations may remain enabled
// this could also occur if the chain is not producing blocks and lead to liquidatable positions
// when block production resumes
// the effects of disabling features should be carefully considered
library FeatureUtils {
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
        validateFeature(dataStore, key, address(0), address(0));
    }

    // @dev validate whether a feature is enabled, reverts if the feature is disabled
    //
    // Features can be disabled at multiple scopes, in the following order:
    // - global kill switch: Keys.ALL_FEATURES_DISABLED
    // - global feature disable: featureKey
    // - module-scoped feature disable: Keys.featureModuleKey(featureKey, module)
    // - market-scoped feature disable: Keys.featureMarketKey(featureKey, market)
    //
    // If any of these checks indicate the feature is disabled, the function reverts
    // and the remaining checks are not evaluated.
    function validateFeature(DataStore dataStore, bytes32 featureKey, address module, address market) internal view {
        if (dataStore.getBool(Keys.ALL_FEATURES_DISABLED)) {
            revert Errors.AllFeaturesDisabled();
        }

        if (dataStore.getBool(featureKey)) {
            revert Errors.DisabledFeature(featureKey);
        }

        if (module != address(0)) {
            if (dataStore.getBool(Keys.featureModuleKey(featureKey, module))) {
                revert Errors.DisabledFeatureForModule(featureKey, module);
            }
        }

        if (market != address(0)) {
            if (dataStore.getBool(Keys.featureMarketKey(featureKey, market))) {
                revert Errors.DisabledFeatureForMarket(featureKey, market);
            }
        }
    }
}
