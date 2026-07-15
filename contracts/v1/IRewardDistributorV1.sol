// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IRewardDistributor {
    function lastDistributionTime() external view returns (uint256);
    function tokensPerInterval() external view returns (uint256);

    function updateLastDistributionTime() external;
    function setTokensPerInterval(uint256 _amount) external;
}
