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
        address initialMarket,
        SwapUtils.SwapParams memory params
    )
        external
        nonReentrant
        onlyController
        returns (address, uint256)
    {
        if (params.swapPathMarkets.length == 0) {
            revert("Empty swapPathMarkets");
        }

        if (initialMarket != params.swapPathMarkets[0].marketToken) {
            MarketToken(payable(initialMarket)).transferOut(
                params.tokenIn,
                params.swapPathMarkets[0].marketToken,
                params.amountIn,
                params.shouldUnwrapNativeToken
            );
        }

        return SwapUtils.swap(params);
    }
}
