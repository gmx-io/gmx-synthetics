// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
    function arbBlockHash(uint256 blockNumber) external view returns (bytes32);
}
