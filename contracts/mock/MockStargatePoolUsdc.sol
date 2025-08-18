// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./MockStargatePool.sol";

contract MockStargatePoolUsdc is MockStargatePool {
    constructor(address _usdc) MockStargatePool(_usdc) {}

    // Allow token address to be changed to support GM / GLV tokens
    function updateToken(address _token) external {
        require(_token != address(0), "Invalid token address");
        token = _token;
    }
}
