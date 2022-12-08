// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/Bank.sol";

// @title FeeReceiver
// @dev Contract to receive fees
contract FeeReceiver is Bank {
    // @param key the fee action
    // @param token the fee token
    // @param amount the fee amount
    event FeeReceived(bytes32 key, address token, uint256 amount);
    event FeesWithdrawn(address token, uint256 amount, address receiver);

    constructor(RoleStore _roleStore, DataStore _dataStore) Bank(_roleStore, _dataStore) {}

    // @dev called after a fee is received
    // @param key the fee action
    // @param token the fee token
    // @param amount the fee amount
    function notifyFeeReceived(bytes32 key, address token, uint256 amount) external {
        emit FeeReceived(key, token, amount);
    }

    function withdrawFees(
        address token,
        uint256 amount,
        address receiver
    ) external onlyFeeKeeper {
        _transferOut(token, amount, receiver);
        emit FeesWithdrawn(token, amount, receiver);
    }
}
