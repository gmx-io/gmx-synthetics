// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../data/Keys.sol";
import "../feature/FeatureUtils.sol";
import "../pricing/ISwapPricingUtils.sol";
import "../role/RoleModule.sol";
import "./SwapUtils.sol";
import "./ISwapHandler.sol";

/**
 * @title SwapHandler
 * @dev A contract to help with swap functions
 */
contract SwapHandler is ISwapHandler, ReentrancyGuard, RoleModule {
    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    /**
     * @dev perform a swap based on the given params
     * @param params SwapUtils.SwapParams
     * @return (outputToken, outputAmount)
     */
    function swap(
        ISwapUtils.SwapParams memory params
    )
        external
        nonReentrant
        onlyController
        returns (address, uint256)
    {
        if (params.swapPricingType == ISwapPricingUtils.SwapPricingType.AtomicSwap) {
            FeatureUtils.validateFeature(params.dataStore, Keys.atomicSwapFeatureDisabledKey(address(this)));
        }

        return SwapUtils.swap(params);
    }
}
