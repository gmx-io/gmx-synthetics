// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./DataStore.sol";


// @title DataStoreOps
// @dev library with internal functions for data store operations, used by other contracts to reduce smart contract size: 
// @dev smart contract size could be reduced by using internal functions instead of calling external contract directly
library DataStoreOps {
    function getUintValueFromDataStore(DataStore dataStore, bytes32 key) internal view returns (uint256) {
        return dataStore.getUint(key);
    }

    function getIntValueFromDataStore(DataStore dataStore, bytes32 key) internal view returns (int256) {
        return dataStore.getInt(key);
    }

    function getAddressValueFromDataStore(DataStore dataStore, bytes32 key) internal view returns (address) {
        return dataStore.getAddress(key);
    }

    function getBoolValueFromDataStore(DataStore dataStore, bytes32 key) internal view returns (bool) {
        return dataStore.getBool(key);
    }
}