// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./DataStore.sol";

// @title DataStoreAccessor
// @dev Abstract contract that exposes a function to retrieve the DataStore reference
abstract contract DataStoreAccessor {
    function _dataStore() internal view virtual returns (DataStore);
}
