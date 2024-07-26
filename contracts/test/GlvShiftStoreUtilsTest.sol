
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/glvShift/GlvShiftStoreUtils.sol";

/**
 * @title ShifteStoreUtilsTest
 * @dev Contract to help test the ShiftStoreUtils library
 */
contract GlvShiftStoreUtilsTest {
    function getEmptyGlvShift() external pure returns (GlvShift.Props memory) {
        GlvShift.Props memory glvShift;
        return glvShift;
    }

    function setGlvShift(DataStore dataStore, bytes32 key, GlvShift.Props memory glvShift) external {
        GlvShiftStoreUtils.set(dataStore, key, glvShift);
    }

    function removeGlvShift(DataStore dataStore, bytes32 key) external {
        GlvShiftStoreUtils.remove(dataStore, key);
    }
}
