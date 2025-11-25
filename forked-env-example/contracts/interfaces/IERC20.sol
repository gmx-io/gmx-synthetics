// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * ERC20 Token Interface
 * @dev Minimal interface for reading ERC20 token balances
 */
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
