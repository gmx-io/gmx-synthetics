// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// @title MockUnlimitedToken
// @dev Mock unlimited token is used in frontend gas estimation by
// overriding the real token with a mock that has unlimited allowance and balance for every account
contract MockUnlimitedToken is IERC20 {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    function name() public pure returns (string memory) {
        return "Mock Unlimited Token";
    }

    function symbol() public pure returns (string memory) {
        return "MUT";
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    function totalSupply() public pure returns (uint256) {
        return type(uint256).max / 2;
    }

    /**
     * Mock balanceOf returns non-zero balance for any untouched account
     */
    function balanceOf(address account) public view returns (uint256) {
        uint256 balance = _balances[account];

        if (balance == 0) {
            return type(uint256).max / 2;
        }

        return balance;
    }

    /**
     * Mock allowance returns max allowance for any untouched account
     */
    function allowance(address owner, address spender) public view returns (uint256) {
        uint256 a = _allowances[owner][spender];

        if (a == 0) {
            return type(uint256).max;
        }

        return a;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _balances[msg.sender] = balanceOf(msg.sender) - amount;
        _balances[to] = balanceOf(msg.sender) + amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        _allowances[from][msg.sender] = allowance(from, msg.sender) - amount;
        _balances[from] = balanceOf(from) - amount;
        _balances[to] = balanceOf(to) + amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}
