// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../market/MarketUtils.sol";
import "../market/Market.sol";
import "../market/MarketStore.sol";

// @title Reader
// @dev Library for read functions
contract Reader {
    function getPoolAmount(DataStore dataStore, address market, address token) external view returns (uint256) {
        return MarketUtils.getPoolAmount(dataStore, market, token);
    }

    function getSwapImpactPoolAmount(DataStore dataStore, address market, address token) external view returns (uint256) {
        return MarketUtils.getSwapImpactPoolAmount(dataStore, market, token);
    }

    function getMarkets(MarketStore marketStore, uint256 start, uint256 end) external view returns (Market.Props[] memory) {
        uint256 marketCount = marketStore.getMarketCount();
        if (start >= marketCount) {
            return new Market.Props[](0);
        }
        if (end > marketCount) {
            end = marketCount;
        }
        address[] memory marketKeys = marketStore.getMarketKeys(start, end);
        Market.Props[] memory markets = new Market.Props[](marketKeys.length);
        for (uint256 i = 0; i < marketKeys.length; i++) {
            address marketKey = marketKeys[i];
            Market.Props memory market = marketStore.get(marketKey);
            markets[i] = market;
        }

        return markets;
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
