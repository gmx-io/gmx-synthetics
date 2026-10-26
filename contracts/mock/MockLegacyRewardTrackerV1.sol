// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MintableToken.sol";

// @title MockLegacyRewardTrackerV1
// @dev Bookkeeping mock of the V1 RewardTracker chain API used by RewardRouterV3.
// Stake and unstake record deposit balances and mint / burn the tracker receipt
// without pulling deposit tokens, and claims mint the reward token. Claiming a
// non-zero amount updates averageStakedAmounts and cumulativeRewards, matching the
// V1 accrual behavior the router's receiver freshness checks depend on.
// Handler gating is not reproduced; the fork test suite covers the real contracts
contract MockLegacyRewardTrackerV1 is MintableToken {
    address public rewardToken;

    mapping(address => mapping(address => uint256)) public depositBalances;
    mapping(address => uint256) public stakedAmounts;
    mapping(address => uint256) public claimableAmounts;
    mapping(address => uint256) public averageStakedAmounts;
    mapping(address => uint256) public cumulativeRewards;

    constructor(
        string memory name_,
        string memory symbol_,
        address _rewardToken
    ) MintableToken(name_, symbol_, 18) {
        rewardToken = _rewardToken;
    }

    function setClaimable(address _account, uint256 _amount) external {
        claimableAmounts[_account] = _amount;
    }

    function setAverageStakedAmounts(address _account, uint256 _amount) external {
        averageStakedAmounts[_account] = _amount;
    }

    function setCumulativeRewards(address _account, uint256 _amount) external {
        cumulativeRewards[_account] = _amount;
    }

    function claimable(address _account) external view returns (uint256) {
        return claimableAmounts[_account];
    }

    function updateRewards() external {}

    function stakeForAccount(address, address _account, address _depositToken, uint256 _amount) external {
        depositBalances[_account][_depositToken] += _amount;
        stakedAmounts[_account] += _amount;
        _mint(_account, _amount);
    }

    function unstakeForAccount(address _account, address _depositToken, uint256 _amount, address) external {
        require(_amount > 0, "RewardTracker: invalid _amount");
        depositBalances[_account][_depositToken] -= _amount;
        stakedAmounts[_account] -= _amount;
        _burn(_account, _amount);
    }

    function claimForAccount(address _account, address _receiver) external returns (uint256) {
        uint256 amount = claimableAmounts[_account];
        if (amount == 0) { return 0; }

        claimableAmounts[_account] = 0;
        cumulativeRewards[_account] += amount;
        averageStakedAmounts[_account] = stakedAmounts[_account];
        MintableToken(rewardToken).mint(_receiver, amount);
        return amount;
    }
}
