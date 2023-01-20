// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

// @title NonceUtils
// @dev Library to keep track of an incrementing nonce value
library NonceUtils {
    // @dev get the current nonce value
    // @param dataStore DataStore
    function getCurrentNonce(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getUint(Keys.NONCE);
    }

    // @dev increment the current nonce value
    // @param dataStore DataStore
    // @return the new nonce value
    function incrementNonce(DataStore dataStore) internal returns (uint256) {
        return dataStore.incrementUint(Keys.NONCE, 1);
    }

    // @dev convenience function to create a bytes32 hash using the next nonce
    // it would be possible to use the nonce directly as an ID / key
    // however, for positions the key is a bytes32 value based on a hash of
    // the position values
    // so bytes32 is used instead for a standard key type
    // @param dataStore DataStore
    // @return bytes32 hash using the next nonce value
    function getNextKey(DataStore dataStore) internal returns (bytes32) {
        uint256 nonce = incrementNonce(dataStore);
        bytes32 key = keccak256(abi.encode(address(dataStore), nonce));

        return key;
    }
}
