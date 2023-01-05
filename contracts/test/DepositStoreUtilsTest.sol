
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../deposit/DepositStoreUtils.sol";

/**
 * @title DepositeStoreUtilsTest
 * @dev Contract to help test the DepositStoreUtils library
 */
contract DepositStoreUtilsTest {
    function getEmptyDeposit() external pure returns (Deposit.Props memory) {
        Deposit.Props memory deposit;
        return deposit;
    }

    function setDeposit(DataStore dataStore, bytes32 key, Deposit.Props memory deposit) external {
        DepositStoreUtils.set(dataStore, key, deposit);
    }

    function removeDeposit(DataStore dataStore, bytes32 key, address account) external {
        DepositStoreUtils.remove(dataStore, key, account);
    }
}
