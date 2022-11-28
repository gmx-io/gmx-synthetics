// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "./SwapUtils.sol";

contract SwapHandler is ReentrancyGuard, RoleModule {
    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function swap(SwapUtils.SwapParams memory params)
        external
        nonReentrant
        onlyController
        returns (address, uint256)
    {
        return SwapUtils.swap(params);
    }
}
