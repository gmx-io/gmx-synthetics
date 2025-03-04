// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IRewardTracker {
    function distributor() external view returns (address);
}
