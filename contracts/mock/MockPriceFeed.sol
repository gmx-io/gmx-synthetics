// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../oracle/IPriceFeed.sol";

contract MockPriceFeed is IPriceFeed {
    int256 public answer;

    function setAnswer(int256 _answer) external {
        answer = _answer;
    }

    function latestRoundData() external view returns (
        uint80,
        int256,
        uint256,
        uint256,
        uint80
    ) {
        return (
            uint80(0), // roundId
            answer, // answer
            0, // startedAt
            0, // updatedAt
            uint80(0) // answeredInRound
        );
    }
}
