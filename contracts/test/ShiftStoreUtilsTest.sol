// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../shift/ShiftStoreUtils.sol";

contract ShiftStoreUtilsTest {
    function getEmptyShift() external pure returns (Shift.Props memory) {
        Shift.Props memory shift;
        return shift;
    }

    function setShift(DataStore dataStore, bytes32 key, Shift.Props memory shift) external {
        ShiftStoreUtils.set(dataStore, key, shift);
    }

    function removeShift(DataStore dataStore, bytes32 key, address account) external {
        ShiftStoreUtils.remove(dataStore, key, account);
    }
}
