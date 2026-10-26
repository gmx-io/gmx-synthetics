// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockRewardDistributorV1.sol";

contract MockRewardTrackerV1 {
    uint256 public constant PRECISION = 1e30;

    address public distributor;
    uint256 public totalSupply;

    uint256 public cumulativeRewardPerToken;
    mapping(address => uint256) public stakedAmounts;
    mapping(address => uint256) public claimableReward;
    mapping(address => uint256) public previousCumulatedRewardPerToken;

    constructor(address _distributor) {
        distributor = _distributor;
    }

    // sets the reward accrual denominator directly, without any staker accounts; stake() adds on top
    function setTotalSupply(uint256 supply) external {
        totalSupply = supply;
    }

    function rewardToken() public view returns (address) {
        return MockRewardDistributorV1(distributor).rewardToken();
    }

    function stake(uint256 _amount) external {
        _updateRewards(msg.sender);
        stakedAmounts[msg.sender] += _amount;
        totalSupply += _amount;
    }

    function unstake(uint256 _amount) external {
        _updateRewards(msg.sender);
        stakedAmounts[msg.sender] -= _amount;
        totalSupply -= _amount;
    }

    function updateRewards() external {
        _updateRewards(address(0));
    }

    function claim(address _receiver) external returns (uint256) {
        _updateRewards(msg.sender);

        uint256 tokenAmount = claimableReward[msg.sender];
        claimableReward[msg.sender] = 0;

        if (tokenAmount > 0) {
            IERC20(rewardToken()).transfer(_receiver, tokenAmount);
        }

        return tokenAmount;
    }

    function claimable(address _account) external view returns (uint256) {
        uint256 stakedAmount = stakedAmounts[_account];
        if (stakedAmount == 0) {
            return claimableReward[_account];
        }

        uint256 pendingRewards = MockRewardDistributorV1(distributor).pendingRewards() * PRECISION;
        uint256 nextCumulativeRewardPerToken = cumulativeRewardPerToken + pendingRewards / totalSupply;
        return
            claimableReward[_account] +
            (stakedAmount * (nextCumulativeRewardPerToken - previousCumulatedRewardPerToken[_account])) /
            PRECISION;
    }

    function _updateRewards(address _account) private {
        uint256 blockReward = MockRewardDistributorV1(distributor).distribute();

        uint256 supply = totalSupply;
        uint256 _cumulativeRewardPerToken = cumulativeRewardPerToken;
        if (supply > 0 && blockReward > 0) {
            _cumulativeRewardPerToken = _cumulativeRewardPerToken + (blockReward * PRECISION) / supply;
            cumulativeRewardPerToken = _cumulativeRewardPerToken;
        }

        if (_cumulativeRewardPerToken == 0) {
            return;
        }

        if (_account != address(0)) {
            uint256 stakedAmount = stakedAmounts[_account];
            uint256 accountReward = (stakedAmount *
                (_cumulativeRewardPerToken - previousCumulatedRewardPerToken[_account])) / PRECISION;
            claimableReward[_account] = claimableReward[_account] + accountReward;
            previousCumulatedRewardPerToken[_account] = _cumulativeRewardPerToken;
        }
    }
}
