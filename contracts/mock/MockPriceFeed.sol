// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../oracle/IPriceFeed.sol";

// @title MockPriceFeed
// @dev Mock price feed for testing and testnets
contract MockPriceFeed is IPriceFeed {
    int256 public answer;

    // @dev set answer
    // @param _answer the answer to set to
    function setAnswer(int256 _answer) external {
        answer = _answer;
    }

    function latestAnswer() external view returns (int256) {
        return answer;
    }

    // @dev get the latest data
    // @return (roundId, answer, startedAt, updatedAt, answeredInRound)
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
