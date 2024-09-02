
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/glvWithdrawal/GlvWithdrawalStoreUtils.sol";

/**
 * @title WithdrawaleStoreUtilsTest
 * @dev Contract to help test the WithdrawalStoreUtils library
 */
contract GlvWithdrawalStoreUtilsTest {
    function getEmptyGlvWithdrawal() external pure returns (GlvWithdrawal.Props memory) {
        GlvWithdrawal.Props memory glvWithdrawal;
        return glvWithdrawal;
    }

    function setGlvWithdrawal(DataStore dataStore, bytes32 key, GlvWithdrawal.Props memory glvWithdrawal) external {
        GlvWithdrawalStoreUtils.set(dataStore, key, glvWithdrawal);
    }

    function removeGlvWithdrawal(DataStore dataStore, bytes32 key, address account) external {
        GlvWithdrawalStoreUtils.remove(dataStore, key, account);
    }
}
