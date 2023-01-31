// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "./SwapUtils.sol";

/**
 * @title SwapHandler
 * @dev A contract to help with swap functions
 */
contract SwapHandler is ReentrancyGuard, RoleModule {
    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    /**
     * @dev perform a swap based on the given params
     * @param params SwapUtils.SwapParams
     * @return (outputToken, outputAmount)
     */
    function swap(
        SwapUtils.SwapParams memory params
    )
        external
        nonReentrant
        onlyController
        returns (address, uint256)
    {
        return SwapUtils.swap(params);
    }
}
