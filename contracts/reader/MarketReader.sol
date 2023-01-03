// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../market/MarketUtils.sol";
import "../market/Market.sol";
import "../market/MarketStore.sol";

// @title MarketReader
// @dev Library for market read functions
contract MarketReader {

    struct MarketInfo {
        Market.Props market;
        uint256 borrowingFactorPerSecondForLongs;
        uint256 borrowingFactorPerSecondForShorts;
        MarketUtils.GetNextFundingAmountPerSizeResult funding;
    }

    function getMarkets(
        MarketStore marketStore,
        uint256 start,
        uint256 end
    ) external view returns (Market.Props[] memory) {
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

    function getMarketInfoList(
        DataStore dataStore,
        MarketStore marketStore,
        MarketUtils.MarketPrices[] memory marketPricesList,
        uint256 start,
        uint256 end
    ) external view returns (MarketInfo[] memory) {
        uint256 marketCount = marketStore.getMarketCount();
        if (start >= marketCount) {
            return new MarketInfo[](0);
        }
        if (end > marketCount) {
            end = marketCount;
        }
        address[] memory marketKeys = marketStore.getMarketKeys(start, end);
        MarketInfo[] memory marketInfoList = new MarketInfo[](marketKeys.length);
        for (uint256 i = 0; i < marketKeys.length; i++) {
            MarketUtils.MarketPrices memory prices = marketPricesList[i];
            address marketKey = marketKeys[i];
            marketInfoList[i] = getMarketInfo(dataStore, marketStore, prices, marketKey);
        }

        return marketInfoList;
    }

    function getMarketInfo(
        DataStore dataStore,
        MarketStore marketStore,
        MarketUtils.MarketPrices memory prices,
        address marketKey
    ) public view returns (MarketInfo memory) {
        Market.Props memory market = marketStore.get(marketKey);

        uint256 borrowingFactorPerSecondForLongs = MarketUtils.getBorrowingFactorPerSecond(
            dataStore,
            prices,
            market.marketToken,
            market.longToken,
            market.shortToken,
            true
        );

        uint256 borrowingFactorPerSecondForShorts = MarketUtils.getBorrowingFactorPerSecond(
            dataStore,
            prices,
            market.marketToken,
            market.longToken,
            market.shortToken,
            false
        );

        MarketUtils.GetNextFundingAmountPerSizeResult memory funding = MarketUtils.getNextFundingAmountPerSize(
            dataStore,
            prices,
            market.marketToken,
            market.longToken,
            market.shortToken
        );

        return MarketInfo(market, borrowingFactorPerSecondForLongs, borrowingFactorPerSecondForShorts, funding);
    }

    function getMarketTokenPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) external view returns (int256) {
        return
            MarketUtils.getMarketTokenPrice(
                dataStore,
                market,
                longTokenPrice,
                shortTokenPrice,
                indexTokenPrice,
                maximize
            );
    }

    function getNetPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) external view returns (int256) {
        return MarketUtils.getNetPnl(dataStore, market, longToken, shortToken, indexTokenPrice, maximize);
    }

    function getPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        return MarketUtils.getPnl(dataStore, market, longToken, shortToken, indexTokenPrice, isLong, maximize);
    }

    function getOpenInterestWithPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) external view returns (int256) {
        return
            MarketUtils.getOpenInterestWithPnl(
                dataStore,
                market,
                longToken,
                shortToken,
                indexTokenPrice,
                isLong,
                maximize
            );
    }

    function getPnlToPoolFactor(
        DataStore dataStore,
        MarketStore marketStore,
        address marketAddress,
        MarketUtils.MarketPrices memory prices,
        bool isLong,
        bool maximize
    ) external view returns (int256) {
        Market.Props memory market = marketStore.get(marketAddress);
        return MarketUtils.getPnlToPoolFactor(dataStore, market, prices, isLong, maximize);
    }
}
