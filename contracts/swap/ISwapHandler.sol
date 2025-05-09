// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./ISwapUtils.sol";

interface ISwapHandler {
    function swap(ISwapUtils.SwapParams memory params) external returns (address, uint256);
}
