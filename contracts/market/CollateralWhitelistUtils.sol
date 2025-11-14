// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

// @title CollateralWhitelistUtils
// @dev Library for managing the collateral whitelist
library CollateralWhitelistUtils {
    // @dev check if a token is whitelisted as collateral
    // @param dataStore DataStore
    // @param token the token to check
    // @return true if the token is whitelisted
    function isWhitelistedCollateral(DataStore dataStore, address token) internal view returns (bool) {
        return dataStore.containsAddress(Keys.COLLATERAL_WHITELIST, token);
    }

    // @dev add a token to the collateral whitelist
    // @param dataStore DataStore
    // @param token the token to add
    function addToWhitelist(DataStore dataStore, address token) internal {
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }
        dataStore.addAddress(Keys.COLLATERAL_WHITELIST, token);
    }

    // @dev remove a token from the collateral whitelist
    // @param dataStore DataStore
    // @param token the token to remove
    function removeFromWhitelist(DataStore dataStore, address token) internal {
        dataStore.removeAddress(Keys.COLLATERAL_WHITELIST, token);
    }

    // @dev get the count of whitelisted collateral tokens
    // @param dataStore DataStore
    // @return the count of whitelisted tokens
    function getWhitelistCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getAddressCount(Keys.COLLATERAL_WHITELIST);
    }

    // @dev get whitelisted collateral tokens in a range
    // @param dataStore DataStore
    // @param start the start index
    // @param end the end index
    // @return array of whitelisted token addresses
    function getWhitelistedTokens(DataStore dataStore, uint256 start, uint256 end) internal view returns (address[] memory) {
        return dataStore.getAddressValuesAt(Keys.COLLATERAL_WHITELIST, start, end);
    }
}

