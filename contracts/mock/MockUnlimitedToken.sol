// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
        return type(uint256).max;
    }

    function balanceOf(address account) public view returns (uint256) {
        uint256 balance = _balances[account];

        if (balance == 0) {
            return type(uint256).max;
        }

        return balance;
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        uint256 a = _allowances[owner][spender];

        if (a == 0) {
            return type(uint256).max;
        }

        return a;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _balances[msg.sender] = balanceOf(msg.sender) - amount;
        _balances[to] = _balances[to] + amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        _allowances[from][msg.sender] = allowance(from, msg.sender) - amount;
        _balances[from] = balanceOf(from) - amount;
        _balances[to] = _balances[to] + amount;
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }
}
