// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MockLegacyRewardTrackerV1.sol";

// @title MockLegacyVesterV1
// @dev Mock of the V1 Vester state read by RewardRouterV3's transfer validations and
// written by VesterCapZeroer. getMaxVestableAmount mirrors the V1 shape: the sum of
// the positive cap terms less the cumulative reward deduction, saturating at zero.
// The fork test suite covers the real contract
contract MockLegacyVesterV1 {
    address public rewardTracker;

    mapping(address => bool) public isHandler;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public pairAmounts;
    mapping(address => uint256) public transferredAverageStakedAmounts;
    mapping(address => uint256) public transferredCumulativeRewards;
    mapping(address => uint256) public bonusRewards;
    mapping(address => uint256) public cumulativeRewardDeductions;

    constructor(address _rewardTracker) {
        rewardTracker = _rewardTracker;
    }

    function setBalance(address _account, uint256 _amount) external {
        balances[_account] = _amount;
    }

    function setPairAmount(address _account, uint256 _amount) external {
        pairAmounts[_account] = _amount;
    }

    function setTransferredAverageStakedAmounts(address _account, uint256 _amount) external {
        transferredAverageStakedAmounts[_account] = _amount;
    }

    function setTransferredCumulativeRewards(address _account, uint256 _amount) external {
        transferredCumulativeRewards[_account] = _amount;
    }

    function setBonusRewards(address _account, uint256 _amount) external {
        bonusRewards[_account] = _amount;
    }

    function setHandler(address _handler, bool _isActive) external {
        isHandler[_handler] = _isActive;
    }

    // the real V1 trackers let handlers transferFrom without an allowance; the mock
    // trackers are plain ERC20s, so tests grant the allowance explicitly instead
    function approveToken(address _token, address _spender, uint256 _amount) external {
        IERC20(_token).approve(_spender, _amount);
    }

    // handler-gated as on the real V1 Vester, with the same revert string
    function setCumulativeRewardDeductions(address _account, uint256 _amount) external {
        require(isHandler[msg.sender], "Vester: forbidden");
        cumulativeRewardDeductions[_account] = _amount;
    }

    function balanceOf(address _account) external view returns (uint256) {
        return balances[_account];
    }

    function getMaxVestableAmount(address _account) public view returns (uint256) {
        uint256 maxVestableAmount = transferredCumulativeRewards[_account] + bonusRewards[_account];
        if (rewardTracker != address(0)) {
            maxVestableAmount += MockLegacyRewardTrackerV1(rewardTracker).cumulativeRewards(_account);
        }
        uint256 deduction = cumulativeRewardDeductions[_account];
        return maxVestableAmount > deduction ? maxVestableAmount - deduction : 0;
    }
}
