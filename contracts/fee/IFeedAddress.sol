// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IFeedAddress {
    function decimals() external view returns (uint256);
    function latestAnswer() external view returns (uint256);
}