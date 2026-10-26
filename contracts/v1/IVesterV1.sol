// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IVester {
    function bonusRewards(address _account) external view returns (uint256);
    function setBonusRewards(address _account, uint256 _amount) external;

    function rewardTracker() external view returns (address);
    function balanceOf(address _account) external view returns (uint256);
    function pairAmounts(address _account) external view returns (uint256);
    function transferredAverageStakedAmounts(address _account) external view returns (uint256);
    function transferredCumulativeRewards(address _account) external view returns (uint256);
    function cumulativeRewardDeductions(address _account) external view returns (uint256);
    function getMaxVestableAmount(address _account) external view returns (uint256);
    function setCumulativeRewardDeductions(address _account, uint256 _amount) external;
}
