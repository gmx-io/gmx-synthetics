// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IVester {
    function bonusRewards(address _account) external view returns (uint256);
    function setBonusRewards(address _account, uint256 _amount) external;
}