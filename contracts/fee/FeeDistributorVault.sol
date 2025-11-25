// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/Bank.sol";

contract FeeDistributorVault is Bank {
    constructor(RoleStore _roleStore, DataStore _dataStore) Bank(_roleStore, _dataStore) {}

    // @dev withdraw the specified 'amount' of native token from this contract to 'receiver'
    // @param receiver the receiver of the native token
    // @param amount the amount of native token to withdraw
    function withdrawNativeToken(address receiver, uint256 amount) external onlyTimelockAdmin {
        TokenUtils.sendNativeToken(dataStore, receiver, amount);
    }

    // @dev withdraw the specified 'amount' of `token` from this contract to `receiver`
    // @param token the token to withdraw
    // @param amount the amount to withdraw
    // @param receiver the address to withdraw to
    function withdrawToken(address token, address receiver, uint256 amount) external onlyTimelockAdmin {
        _transferOut(token, receiver, amount);
    }
}
