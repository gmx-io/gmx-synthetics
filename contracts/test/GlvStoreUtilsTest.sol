
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/GlvStoreUtils.sol";

/**
 * @title GlvStoreUtilsTest
 * @dev Contract to help test the StoreUtils library
 */
contract GlvStoreUtilsTest {
    function getEmptyGlv() external pure returns (Glv.Props memory) {
        Glv.Props memory glv;
        return glv;
    }

    function setGlv(DataStore dataStore, address key, bytes32 salt, Glv.Props memory glv) external {
        GlvStoreUtils.set(dataStore, key, salt, glv);
    }

    function removeGlv(DataStore dataStore, address key) external {
        GlvStoreUtils.remove(dataStore, key);
    }
}
