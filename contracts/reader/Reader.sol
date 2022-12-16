// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../market/MarketUtils.sol";
import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../position/Position.sol";
import "../position/PositionUtils.sol";

// @title Reader
// @dev Library for read functions
contract Reader {
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
            Market.Props memory market = MarketUtils.getMarket(marketStore, marketKey);
            markets[i] = market;
        }

        return markets;
    }

    function getAccountPositions(PositionStore positionStore, address account, uint256 start, uint256 end) external view returns (Position.Props[] memory) {
        uint256 positionCount = positionStore.getPositionCount();
        if (start >= positionCount) {
            return new Position.Props[](0);
        }
        if (end > positionCount) {
            end = positionCount;
        }
        bytes32[] memory positionKeys = positionStore.getAccountPositionKeys(account, start, end);
        Position.Props[] memory positions = new Position.Props[](positionKeys.length);
        for (uint256 i = 0; i < positionKeys.length; i++) {
            bytes32 positionKey = positionKeys[i];
            Position.Props memory position = positionStore.get(positionKey);
            positions[i] = position;
        }

        return positions;
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

    function getNetPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) external view returns (int256) {
        return MarketUtils.getNetPnl(
            dataStore,
            market,
            longToken,
            shortToken,
            indexTokenPrice,
            maximize
        );
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
        return MarketUtils.getPnl(
            dataStore,
            market,
            longToken,
            shortToken,
            indexTokenPrice,
            isLong,
            maximize
        );
    }

    function getOpenInterestWithPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) external view returns (uint256) {
        return MarketUtils.getOpenInterestWithPnl(
            dataStore,
            market,
            longToken,
            shortToken,
            indexTokenPrice,
            isLong,
            maximize
        );
    }
}
