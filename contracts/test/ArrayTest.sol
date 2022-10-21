
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Array.sol";

import "hardhat/console.sol";

contract ArrayTest {
    function getMedian(uint256[] memory arr) external pure returns (uint256) {
        return Array.getMedian(arr);
    }

    function sort(uint256[] memory arr) external pure returns (uint256[] memory) {
        Array.sort(arr);
        return arr;
    }

    function sortGasUsage(uint256[] memory arr) external view {
        uint256 startingGas = gasleft();
        Array.sort(arr);
        uint256 gasUsed = startingGas - gasleft();
        console.log("ArrayTest.sortGasUsage", arr.length, gasUsed);
    }
}
