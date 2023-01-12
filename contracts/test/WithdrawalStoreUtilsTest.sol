
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../withdrawal/WithdrawalStoreUtils.sol";

/**
 * @title WithdrawalStoreUtilsTest
 * @dev Contract to help test the WithdrawalStoreUtils library
 */
contract WithdrawalStoreUtilsTest {
    function getEmptyWithdrawal() external pure returns (Withdrawal.Props memory) {
        Withdrawal.Props memory withdrawal;
        return withdrawal;
    }

    function setWithdrawal(DataStore dataStore, bytes32 key, Withdrawal.Props memory withdrawal) external {
        WithdrawalStoreUtils.set(dataStore, key, withdrawal);
    }

    function removeWithdrawal(DataStore dataStore, bytes32 key, address account) external {
        WithdrawalStoreUtils.remove(dataStore, key, account);
    }
}
