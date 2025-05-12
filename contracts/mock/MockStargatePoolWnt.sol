// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./MockStargatePool.sol";

contract MockStargatePoolWnt is MockStargatePool {
    constructor(address _wnt) MockStargatePool(_wnt) {}
}
