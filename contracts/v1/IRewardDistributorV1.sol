// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IRewardDistributor {
    function updateLastDistributionTime() external;
    function setTokensPerInterval(uint256 _amount) external;
}
