// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./DataStore.sol";
import "./DataStoreAccessor.sol";

// @title DataStoreClient
// @dev Stores the DataStore reference and provides the accessor implementation
contract DataStoreClient is DataStoreAccessor {
    DataStore public immutable dataStore;

    constructor(DataStore _dataStoreArg) {
        dataStore = _dataStoreArg;
    }

    function _dataStore() internal view virtual override returns (DataStore) {
        return dataStore;
    }
}
