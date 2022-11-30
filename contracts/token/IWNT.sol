// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// Interface for Wrapped Native Tokens, e.g. WETH
interface IWNT {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
