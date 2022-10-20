// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library Array {
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

    function sort(uint256[] memory data) internal pure returns (uint256[] memory) {
       quickSort(data, 0, data.length - 1);
       return data;
    }

    function quickSort(uint256[] memory arr, uint256 left, uint256 right) internal {
        uint256 i = left;
        uint256 j = right;

        if (i == j) { return; }

        uint256 pivot = arr[left + (right - left) / 2];

        while (i <= j) {
            while (arr[i] < pivot) {
                i++;
            }

            while (pivot < arr[j]) {
                j--;
            }

            if (i <= j) {
                (arr[i], arr[j]) = (arr[j], arr[i]);
                i++;
                j--;
            }
        }

        if (left < j) {
            quickSort(arr, left, j);
        }

        if (i < right) {
            quickSort(arr, i, right);
        }
    }
}
