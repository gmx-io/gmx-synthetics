// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IRewardTracker {
    function distributor() external view returns (address);

    function updateRewards() external;

    function stakedAmounts(address _account) external view returns (uint256);

    function depositBalances(address _account, address _depositToken) external view returns (uint256);
    function averageStakedAmounts(address _account) external view returns (uint256);
    function cumulativeRewards(address _account) external view returns (uint256);
    function claimable(address _account) external view returns (uint256);

    function stakeForAccount(address _fundingAccount, address _account, address _depositToken, uint256 _amount) external;
    function unstakeForAccount(address _account, address _depositToken, uint256 _amount, address _receiver) external;
    function claimForAccount(address _account, address _receiver) external returns (uint256);
}
