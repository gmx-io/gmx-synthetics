// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// @title IPriceFeed
// @dev Interface for a price feed
interface IPriceFeed {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}
