// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./MockStargatePool.sol";

contract MockStargatePoolNative is MockStargatePool {
    constructor() MockStargatePool(address(0)) {}
}
