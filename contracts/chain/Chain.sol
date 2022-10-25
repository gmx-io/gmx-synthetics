// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./ArbSys.sol";

library Chain {
    uint256 constant public ARBITRUM_CHAIN_ID = 42161;
    uint256 constant public ARBITRUM_RINKEBY_CHAIN_ID = 421611;

    ArbSys constant public arbSys = ArbSys(address(100));

    function currentBlockNumber() internal view returns (uint256) {
        if (block.chainid == ARBITRUM_CHAIN_ID || block.chainid == ARBITRUM_RINKEBY_CHAIN_ID) {
            return arbSys.arbBlockNumber();
        }

        return block.number;
    }

    function getBlockHash(uint256 blockNumber) internal view returns (bytes32) {
        if (block.chainid == ARBITRUM_CHAIN_ID || block.chainid == ARBITRUM_RINKEBY_CHAIN_ID) {
            return arbSys.arbBlockHash(blockNumber);
        }

        return blockhash(blockNumber);
    }
}
