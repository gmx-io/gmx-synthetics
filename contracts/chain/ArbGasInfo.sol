// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title ArbGasInfo
interface ArbGasInfo {
    function getCurrentTxL1GasFees() external view returns (uint256);
}
