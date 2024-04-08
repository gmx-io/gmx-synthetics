// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Strings.sol";

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

    function updateLatestBlockHash(uint256 blockNumber) public {
        bytes32 blockHash = getBlockHash(blockNumber);
        if (blockHash == bytes32(0)) {
            revert(
                string.concat(
                    "blockHash is empty. blockNumber: ",
                    Strings.toString(blockNumber),
                    ", latest block number: ",
                    Strings.toString(getBlockNumber())
                )
            );
        }
        latestBlockHash = blockHash;
    }

    function updateLatestBlockHashWithDelay() public {
        updateLatestBlockHash(getBlockNumber() - 10);
    }

    function getBlockHash(uint256 blockNumber) public view returns (bytes32) {
        return arbSys.arbBlockHash(blockNumber);
    }

    function getBlockNumber() public view returns (uint256) {
        return arbSys.arbBlockNumber();
    }

    function getBlockHashWithDelayAndLatestBlockNumber(
        uint256 blockNumberDiff
    ) external view returns (bytes32, uint256) {
        return (arbSys.arbBlockHash(getBlockNumber() - blockNumberDiff), getBlockNumber());
    }

    function getBlockHashAndLatestBlockNumber(uint256 blockNumber) external view returns (bytes32, uint256) {
        return (getBlockHash(blockNumber), getBlockNumber());
    }
}
