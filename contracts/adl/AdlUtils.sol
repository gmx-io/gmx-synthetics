// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../events/EventEmitter.sol";

library AdlUtils {
    using SafeCast for int256;
    using Array for uint256[];
    using Market for Market.Props;

    function updateAdlState(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MarketStore marketStore,
        Oracle oracle,
        address market,
        bool isLong,
        uint256[] memory oracleBlockNumbers
    ) internal {
        uint256 latestAdlBlock = getLatestAdlBlock(dataStore, market, isLong);

        if (!oracleBlockNumbers.areGreaterThan(latestAdlBlock)) {
            revert("OrderHandler: Invalid oracle block number");
        }

        uint256 oracleBlockNumber = oracleBlockNumbers[0];
        if (!oracleBlockNumbers.areEqualTo(oracleBlockNumber)) {
            revert("OrderHandler: Oracle block numbers must be equivalent");
        }

        Market.Props memory _market = marketStore.get(market);
        MarketUtils.MarketPrices memory prices = MarketUtils.MarketPrices(
            oracle.getPrimaryPrice(_market.indexToken),
            oracle.getPrimaryPrice(_market.longToken),
            oracle.getPrimaryPrice(_market.shortToken)
        );

        int256 pnlToPoolFactor = MarketUtils.getPnlToPoolFactor(dataStore, _market, prices, isLong, true);
        uint256 maxPnlFactor = MarketUtils.getMaxPnlFactor(dataStore, market, isLong);

        bool shouldEnableAdl = pnlToPoolFactor > 0 && pnlToPoolFactor.toUint256() > maxPnlFactor;

        setIsAdlEnabled(dataStore, market, isLong, shouldEnableAdl);
        setLatestAdlBlock(dataStore, market, isLong, oracleBlockNumber);

        eventEmitter.emitAdlStateUpdated(pnlToPoolFactor, maxPnlFactor, shouldEnableAdl, oracleBlockNumber);
    }

    function getLatestAdlBlock(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.latestAdlBlockKey(market, isLong));
    }

    function setLatestAdlBlock(DataStore dataStore, address market, bool isLong, uint256 value) internal returns (uint256) {
        return dataStore.setUint(Keys.latestAdlBlockKey(market, isLong), value);
    }

    function getIsAdlEnabled(DataStore dataStore, address market, bool isLong) internal view returns (bool) {
        return dataStore.getBool(Keys.isAdlEnabledKey(market, isLong));
    }

    function setIsAdlEnabled(DataStore dataStore, address market, bool isLong, bool value) internal returns (bool) {
        return dataStore.setBool(Keys.isAdlEnabledKey(market, isLong), value);
    }
}
