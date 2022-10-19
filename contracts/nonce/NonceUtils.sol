// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

library NonceUtils {
    function getCurrentNonce(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getUint(Keys.NONCE);
    }

    function incrementNonce(DataStore dataStore) internal returns (uint256) {
        return dataStore.incrementUint(Keys.NONCE, 1);
    }

    function getNextKey(DataStore dataStore) internal returns (bytes32) {
        uint256 nonce = incrementNonce(dataStore);
        bytes32 key = keccak256(abi.encode(nonce));

        return key;
    }
}
