// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title ArbSys
// @dev Globally available variables for Arbitrum may have both an L1 and an L2
// value, the ArbSys interface is used to retrieve the L2 value
interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
    function arbBlockHash(uint256 blockNumber) external view returns (bytes32);
}

contract ChainReader {
    ArbSys public constant arbSys = ArbSys(address(100));

    bytes32 public latestBlockHash;

    function updateLatestBlockHash(uint256 blockNumber) external {
        bytes32 blockHash = getBlockHash(blockNumber);
        if (blockHash == bytes32(0)) {
            revert("blockHash is empty");
        }
        latestBlockHash = blockHash;
    }

    function getBlockHash(uint256 blockNumber) public view returns (bytes32) {
        return arbSys.arbBlockHash(blockNumber);
    }
}
