// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../market/MarketUtils.sol";

contract Reader {
    function getPoolAmount(DataStore dataStore, address market, address token) external view returns (uint256) {
        return MarketUtils.getPoolAmount(dataStore, market, token);
    }

    function getSwapImpactPoolAmount(DataStore dataStore, address market, address token) external view returns (uint256) {
        return MarketUtils.getSwapImpactPoolAmount(dataStore, market, token);
    }

    function getMarketTokenPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) external view returns (uint256) {
        return MarketUtils.getMarketTokenPrice(
            dataStore,
            market,
            longTokenPrice,
            shortTokenPrice,
            indexTokenPrice,
            maximize
        );
    }
}
