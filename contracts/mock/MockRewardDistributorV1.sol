// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../v1/IRewardTrackerV1.sol";

contract MockRewardDistributorV1 {
    uint256 public tokensPerInterval;
    uint256 public lastDistributionTime;

    function updateLastDistributionTime() external {
        lastDistributionTime = block.timestamp;
    }

    function setTokensPerInterval(uint256 _amount) external {
        require(lastDistributionTime != 0, "RewardDistributor: invalid lastDistributionTime");
        tokensPerInterval = _amount;
    }
}
