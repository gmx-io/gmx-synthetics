// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../eth/IWETH.sol";
import "./Bank.sol";

contract StrictBank is Bank {
    using SafeERC20 for IERC20;

    // used to record token balances to evaluate amounts transferred in
    mapping (address => uint256) public tokenBalances;

    constructor(RoleStore _roleStore) Bank(_roleStore) {}

    function recordTransferIn(address token) external onlyController returns (uint256) {
        return _recordTransferIn(token);
    }

    function _recordTransferIn(address token) internal returns (uint256) {
        uint256 prevBalance = tokenBalances[token];
        uint256 nextBalance = IERC20(token).balanceOf(address(this));
        tokenBalances[token] = nextBalance;

        return nextBalance - prevBalance;
    }

    function _afterTransferOut(address token) internal override {
        tokenBalances[token] = IERC20(token).balanceOf(address(this));
    }
}
