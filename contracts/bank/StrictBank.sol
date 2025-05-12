// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Bank.sol";

// @title StrictBank
// @dev a stricter version of Bank
//
// the Bank contract does not have functions to validate the amount of tokens
// transferred in
// the Bank contract will mainly assume that safeTransferFrom calls work correctly
// and that tokens were transferred into it if there was no revert
//
// the StrictBank contract keeps track of its internal token balance
// and uses recordTransferIn to compare its change in balance and return
// the amount of tokens received
contract StrictBank is Bank {
    using SafeERC20 for IERC20;

    // used to record token balances to evaluate amounts transferred in
    mapping (address => uint256) public tokenBalances;

    constructor(RoleStore _roleStore, DataStore _dataStore) Bank(_roleStore, _dataStore) {}

    // @dev records a token transfer into the contract
    // @param token the token to record the transfer for
    // @return the amount of tokens transferred in
    function recordTransferIn(address token) external onlyController returns (uint256) {
        return _recordTransferIn(token);
    }

    // @dev this can be used to update the tokenBalances in case of token burns
    // or similar balance changes
    // the prevBalance is not validated to be more than the nextBalance as this
    // could allow someone to block this call by transferring into the contract
    // @param token the token to record the burn for
    // @return the new balance
    function syncTokenBalance(address token) external onlyController returns (uint256) {
        uint256 nextBalance = IERC20(token).balanceOf(address(this));
        tokenBalances[token] = nextBalance;
        return nextBalance;
    }

    // @dev records a token transfer into the contract
    // @param token the token to record the transfer for
    // @return the amount of tokens transferred in
    function _recordTransferIn(address token) internal returns (uint256) {
        uint256 prevBalance = tokenBalances[token];
        uint256 nextBalance = IERC20(token).balanceOf(address(this));
        tokenBalances[token] = nextBalance;

        return nextBalance - prevBalance;
    }

    // @dev update the internal balance after tokens have been transferred out
    // this is called from the Bank contract
    // @param token the token that was transferred out
    function _afterTransferOut(address token) internal override {
        tokenBalances[token] = IERC20(token).balanceOf(address(this));
    }
}
