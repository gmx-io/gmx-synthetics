
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title GasUsageTest
 */
contract GasUsageTest {
    function getGasUsageForExternalLibraryCall() external view returns (uint256, uint256) {
        uint256 startingGas = gasleft();
        uint256 gasLeft = GasUsageTestLib.getGasLeft();
        return (startingGas, gasLeft);
    }
}

library GasUsageTestLib {
    function getGasLeft() external view returns (uint256) {
        return gasleft();
    }
}
