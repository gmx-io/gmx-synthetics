// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../v1/IRewardTrackerV1.sol";

contract MockRewardDistributorV1 {
    address public rewardToken;
    address public rewardTracker;
    uint256 public tokensPerInterval;
    uint256 public lastDistributionTime;

    constructor(address _rewardToken) {
        rewardToken = _rewardToken;
    }

    function setRewardTracker(address _rewardTracker) external {
        rewardTracker = _rewardTracker;
    }

    function updateLastDistributionTime() external {
        lastDistributionTime = block.timestamp;
    }

    function setTokensPerInterval(uint256 _amount) external {
        require(lastDistributionTime != 0, "RewardDistributor: invalid lastDistributionTime");
        IRewardTracker(rewardTracker).updateRewards();
        tokensPerInterval = _amount;
    }

    function pendingRewards() public view returns (uint256) {
        if (block.timestamp == lastDistributionTime) {
            return 0;
        }

        uint256 timeDiff = block.timestamp - lastDistributionTime;
        return tokensPerInterval * timeDiff;
    }

    function distribute() external returns (uint256) {
        require(msg.sender == rewardTracker, "RewardDistributor: invalid msg.sender");

        uint256 amount = pendingRewards();
        if (amount == 0) {
            return 0;
        }

        // as in V1, the last distribution time is updated before the amount is capped to the balance
        lastDistributionTime = block.timestamp;

        uint256 balance = IERC20(rewardToken).balanceOf(address(this));
        if (amount > balance) {
            amount = balance;
        }

        IERC20(rewardToken).transfer(msg.sender, amount);
        return amount;
    }
}
