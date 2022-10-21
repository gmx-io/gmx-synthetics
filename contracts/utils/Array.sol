// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

library Array {
    using SafeCast for int256;

    function get(bytes32[] memory arr, uint256 index) internal pure returns (bytes32) {
        if (index < arr.length) {
            return arr[index];
        }

        return bytes32(0);
    }

    function createCopy(bytes32[] memory arr, uint256 index, bytes32 value) internal pure returns (bytes32[] memory) {
        if (index < arr.length) {
            arr[index] = value;
            return arr;
        }

        bytes32[] memory newArr = createResized(arr, index + 1);
        newArr[index] = value;

        return newArr;
    }

    function createResized(bytes32[] memory arr, uint256 length) internal pure returns (bytes32[] memory) {
        if (length <= arr.length) {
            return arr;
        }

        bytes32[] memory newArr = new bytes32[](length);

        for (uint256 i = 0; i < arr.length; i++) {
            newArr[i] = arr[i];
        }

        return newArr;
    }

    function areEqualTo(uint256[] memory arr, uint256 value) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] != value) {
                return false;
            }
        }

        return true;
    }

    function areGreaterThan(uint256[] memory arr, uint256 value) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] <= value) {
                return false;
            }
        }

        return true;
    }

    function getMedian(uint256[] memory arr) internal pure returns (uint256) {
        if (arr.length % 2 == 1) {
            return arr[arr.length / 2];
        }

        return (arr[arr.length / 2] + arr[arr.length / 2 - 1]) / 2;
    }

    function getUncompactedValue(
        uint256[] memory compactedValues,
        uint256 index,
        uint256 compactedValueBitLength,
        uint256 bitmask
    ) internal pure returns (uint256) {
        uint256 compactedValuesPerSlot = 256 / compactedValueBitLength;

        uint256 slotIndex = index / compactedValuesPerSlot;
        uint256 slotBits = compactedValues[slotIndex];
        uint256 offset = (index - slotIndex * compactedValuesPerSlot) * compactedValueBitLength;

        uint256 value = (slotBits >> offset) & bitmask;

        return value;
    }

    function sort(uint256[] memory arr) internal pure {
       quickSort(arr, int256(0), int256(arr.length - 1));
    }

    // adapted from https://www.guru99.com/quicksort-in-javascript.html
    function quickSort(uint256[] memory arr, int256 left, int256 right) internal pure {
        if (arr.length <= 1) { return; }

        uint256 pivot = arr[((left + right) / 2).toUint256()];
        int256 i = left;
        int256 j = right;

        while (i <= j) {
            while (arr[i.toUint256()] < pivot) {
                i++;
            }

            while (arr[j.toUint256()] > pivot) {
                j--;
            }

            if (i <= j) {
                (arr[i.toUint256()], arr[j.toUint256()]) = (arr[j.toUint256()], arr[i.toUint256()]);
                i++;
                j--;
            }
        }

        if (left < i - 1) {
            quickSort(arr, left, i - 1);
        }

        if (i < right) {
            quickSort(arr, i, right);
        }
    }
}
