
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/glvDeposit/GlvDepositStoreUtils.sol";

/**
 * @title DepositeStoreUtilsTest
 * @dev Contract to help test the DepositStoreUtils library
 */
contract GlvDepositStoreUtilsTest {
    function getEmptyGlvDeposit() external pure returns (GlvDeposit.Props memory) {
        GlvDeposit.Props memory glvDeposit;
        return glvDeposit;
    }

    function setGlvDeposit(DataStore dataStore, bytes32 key, GlvDeposit.Props memory glvDeposit) external {
        GlvDepositStoreUtils.set(dataStore, key, glvDeposit);
    }

    function removeGlvDeposit(DataStore dataStore, bytes32 key, address account) external {
        GlvDepositStoreUtils.remove(dataStore, key, account);
    }
}
