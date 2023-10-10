// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../chain/ArbSys.sol";

contract MockArbSys is ArbSys {
    function arbBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function arbBlockHash(uint256 blockNumber) external view returns (bytes32) {
        return blockhash(blockNumber);
    }
}
