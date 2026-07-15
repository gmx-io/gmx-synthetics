// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// @title MockSequencerUptimeFeed
// @dev Mock sequencer uptime feed for testing
contract MockSequencerUptimeFeed {
    int256 public answer;
    uint256 public startedAt;

    // @dev set answer
    // @param _answer the answer to set to
    function setAnswer(int256 _answer) external {
        answer = _answer;
    }

    // @dev set startedAt
    // @param _startedAt the startedAt to set to
    function setStartedAt(uint256 _startedAt) external {
        startedAt = _startedAt;
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
            uint80(0),
            answer,
            startedAt,
            block.timestamp,
            uint80(0)
        );
    }
}
