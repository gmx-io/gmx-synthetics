// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";
import "../data/DataStore.sol";
import "../token/TokenUtils.sol";

contract FundReceiver is RoleModule {
    DataStore public immutable dataStore;

    constructor(RoleStore _roleStore, DataStore _dataStore) RoleModule(_roleStore) {
        dataStore = _dataStore;
    }

    // users may incorrectly send the native token into the contract, allow it to be recovered
    function recoverWnt(address payable receiver, uint256 amount) external onlyController {
        TokenUtils.transferNativeToken(dataStore, receiver, amount);
    }
}
