// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IRouterV1 {
    function swap(address[] memory _path, uint256 _amountIn, uint256 _minOut, address _receiver) external;
}
