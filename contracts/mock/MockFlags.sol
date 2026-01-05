// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

contract MockFlags {
    uint256 public constant AVALANCHE_FUJI_CHAIN_ID = 43113;
    uint256 public constant ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

    mapping(address => bool) private flags;

    function setFlag(address subject, bool flag) external {
        flags[subject] = flag;
    }

    function getFlag(address subject) external view returns (bool) {
        if (block.chainid == AVALANCHE_FUJI_CHAIN_ID || block.chainid == ARBITRUM_SEPOLIA_CHAIN_ID) {
            return true;
        }
        return flags[subject];
    }
}
