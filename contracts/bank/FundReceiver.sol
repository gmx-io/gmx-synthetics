// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";
import "../data/DataStore.sol";
import "../token/TokenUtils.sol";

// @title FundReceiver
// @dev Contract to handle recovery of incorrectly sent native tokens
contract FundReceiver is RoleModule {
    DataStore public immutable dataStore;

    constructor(RoleStore _roleStore, DataStore _dataStore) RoleModule(_roleStore) {
        dataStore = _dataStore;
    }

    // @dev users may incorrectly send the native token into this contract, allow it to be recovered
    //
    // @param receiver the address to recover the native token to
    // @param amount the amount of native token to recover
    function recoverNativeToken(address payable receiver, uint256 amount) external onlyController {
        TokenUtils.transferNativeToken(dataStore, receiver, amount);
    }
}
