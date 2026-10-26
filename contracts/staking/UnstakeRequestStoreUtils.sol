// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

// @title UnstakeRequestStoreUtils
// @dev DataStore layout for RewardRouterV3 unstake requests.
// A request is owned by the account whose list contains its key.
// A requestedAt of zero means the request was executed or cancelled.
library UnstakeRequestStoreUtils {
    bytes32 public constant AMOUNT = keccak256(abi.encode("AMOUNT"));
    bytes32 public constant REQUESTED_AT = keccak256(abi.encode("REQUESTED_AT"));

    struct UnstakeRequest {
        uint256 amount;
        uint256 requestedAt;
    }

    function get(DataStore dataStore, bytes32 key) internal view returns (UnstakeRequest memory request) {
        request.amount = dataStore.getUint(keccak256(abi.encode(key, AMOUNT)));
        request.requestedAt = dataStore.getUint(keccak256(abi.encode(key, REQUESTED_AT)));
    }

    function set(DataStore dataStore, address account, bytes32 key, UnstakeRequest memory request) internal {
        dataStore.addBytes32(Keys.accountUnstakeRequestListKey(account), key);
        dataStore.setUint(keccak256(abi.encode(key, AMOUNT)), request.amount);
        dataStore.setUint(keccak256(abi.encode(key, REQUESTED_AT)), request.requestedAt);
    }

    function move(DataStore dataStore, bytes32 key, address from, address to) internal {
        dataStore.removeBytes32(Keys.accountUnstakeRequestListKey(from), key);
        dataStore.addBytes32(Keys.accountUnstakeRequestListKey(to), key);
    }

    function remove(DataStore dataStore, address account, bytes32 key) internal {
        dataStore.removeBytes32(Keys.accountUnstakeRequestListKey(account), key);
        dataStore.removeUint(keccak256(abi.encode(key, AMOUNT)));
        dataStore.removeUint(keccak256(abi.encode(key, REQUESTED_AT)));
    }

    function contains(DataStore dataStore, address account, bytes32 key) internal view returns (bool) {
        return dataStore.containsBytes32(Keys.accountUnstakeRequestListKey(account), key);
    }

    function getCount(DataStore dataStore, address account) internal view returns (uint256) {
        return dataStore.getBytes32Count(Keys.accountUnstakeRequestListKey(account));
    }

    function getKeys(DataStore dataStore, address account) internal view returns (bytes32[] memory) {
        return dataStore.getBytes32ValuesAt(Keys.accountUnstakeRequestListKey(account), 0, type(uint256).max);
    }
}
