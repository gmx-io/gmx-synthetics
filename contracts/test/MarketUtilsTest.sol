// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../market/MarketUtils.sol";

contract MarketUtilsTest {
    function getUsageFactor(
        DataStore dataStore,
        Market.Props memory market,
        bool isLong,
        uint256 reservedUsd,
        uint256 poolUsd
    ) public view returns (uint256) {
        return MarketUtils.getUsageFactor(dataStore, market, isLong, reservedUsd, poolUsd);
    }

    function getPoolUsdWithoutPnl(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        bool isLong,
        bool maximize
    ) public view returns (uint256) {
        return MarketUtils.getPoolUsdWithoutPnl(dataStore, market, prices, isLong, maximize);
    }

    function getReservedUsd(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        bool isLong
    ) public view returns (uint256) {
        return MarketUtils.getReservedUsd(dataStore, market, prices, isLong);
    }
}
