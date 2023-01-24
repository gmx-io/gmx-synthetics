// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * @title Array
 * @dev Library for array functions
 */
library Array {
    using SafeCast for int256;

    error CompactedArrayOutOfBounds(
        uint256[] compactedValues,
        uint256 index,
        uint256 slotIndex,
        string label
    );

    error ArrayOutOfBoundsUint256(
        uint256[] values,
        uint256 index,
        string label
    );

    error ArrayOutOfBoundsBytes(
        bytes[] values,
        uint256 index,
        string label
    );

    /**
     * @dev Gets the value of the element at the specified index in the given array. If the index is out of bounds, returns 0.
     *
     * @param arr the array to get the value from
     * @param index the index of the element in the array
     * @return the value of the element at the specified index in the array
     */
    function get(bytes32[] memory arr, uint256 index) internal pure returns (bytes32) {
        if (index < arr.length) {
            return arr[index];
        }

        return bytes32(0);
    }

    /**
     * @dev Determines whether all of the elements in the given array are equal to the specified value.
     *
     * @param arr the array to check the elements of
     * @param value the value to compare the elements of the array to
     * @return true if all of the elements in the array are equal to the specified value, false otherwise
     */
    function areEqualTo(uint256[] memory arr, uint256 value) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] != value) {
                return false;
            }
        }

        return true;
    }

    /**
     * @dev Determines whether all of the elements in the given array are greater than the specified value.
     *
     * @param arr the array to check the elements of
     * @param value the value to compare the elements of the array to
     * @return true if all of the elements in the array are greater than the specified value, false otherwise
     */
    function areGreaterThan(uint256[] memory arr, uint256 value) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] <= value) {
                return false;
            }
        }

        return true;
    }

    /**
     * @dev Determines whether all of the elements in the given array are greater than or equal to the specified value.
     *
     * @param arr the array to check the elements of
     * @param value the value to compare the elements of the array to
     * @return true if all of the elements in the array are greater than or equal to the specified value, false otherwise
     */
    function areGreaterThanOrEqualTo(uint256[] memory arr, uint256 value) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] < value) {
                return false;
            }
        }

        return true;
    }

    /**
     * @dev Determines whether all of the elements in the given array are less than the specified value.
     *
     * @param arr the array to check the elements of
     * @param value the value to compare the elements of the array to
     * @return true if all of the elements in the array are less than the specified value, false otherwise
     */
    function areLessThan(uint256[] memory arr, uint256 value) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] >= value) {
                return false;
            }
        }

        return true;
    }

    /**
     * @dev Determines whether all of the elements in the given array are less than or equal to the specified value.
     *
     * @param arr the array to check the elements of
     * @param value the value to compare the elements of the array to
     * @return true if all of the elements in the array are less than or equal to the specified value, false otherwise
     */
    function areLessThanOrEqualTo(uint256[] memory arr, uint256 value) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] > value) {
                return false;
            }
        }

        return true;
    }

    /**
     * @dev Gets the median value of the elements in the given array. For arrays with an odd number of elements, returns the element at the middle index. For arrays with an even number of elements, returns the average of the two middle elements.
     *
     * @param arr the array to get the median value from
     * @return the median value of the elements in the given array
     */
    function getMedian(uint256[] memory arr) internal pure returns (uint256) {
        if (arr.length % 2 == 1) {
            return arr[arr.length / 2];
        }

        return (arr[arr.length / 2] + arr[arr.length / 2 - 1]) / 2;
    }

    /**
     * @dev Gets the uncompacted value at the specified index in the given array of compacted values.
     *
     * @param compactedValues the array of compacted values to get the uncompacted value from
     * @param index the index of the uncompacted value in the array
     * @param compactedValueBitLength the length of each compacted value, in bits
     * @param bitmask the bitmask to use to extract the uncompacted value from the compacted value
     * @return the uncompacted value at the specified index in the array of compacted values
     */
    function getUncompactedValue(
        uint256[] memory compactedValues,
        uint256 index,
        uint256 compactedValueBitLength,
        uint256 bitmask,
        string memory label
    ) internal pure returns (uint256) {
        uint256 compactedValuesPerSlot = 256 / compactedValueBitLength;

        uint256 slotIndex = index / compactedValuesPerSlot;
        if (slotIndex >= compactedValues.length) {
            revert CompactedArrayOutOfBounds(compactedValues, index, slotIndex, label);
        }

        uint256 slotBits = compactedValues[slotIndex];
        uint256 offset = (index - slotIndex * compactedValuesPerSlot) * compactedValueBitLength;

        uint256 value = (slotBits >> offset) & bitmask;

        return value;
    }

    function revertArrayOutOfBounds(uint256[] memory values, uint256 index, string memory label) internal pure {
        revert ArrayOutOfBoundsUint256(values, index, label);
    }

    function revertArrayOutOfBounds(bytes[] memory values, uint256 index, string memory label) internal pure {
        revert ArrayOutOfBoundsBytes(values, index, label);
    }
}
