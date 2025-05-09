// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./MockStargatePool.sol";

contract MockStargatePoolUsdc is MockStargatePool {
    constructor(address _usdc) MockStargatePool(_usdc) {}
}
