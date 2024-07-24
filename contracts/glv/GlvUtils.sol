// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/Glv.sol";
import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";
import "./GlvEventUtils.sol";

library GlvUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    struct GetValueCache {
        bytes32 marketListKey;
        uint256 marketCount;
    }

    // @dev get the USD value of the Glv
    // @param dataStore DataStore
    // @param oracle Oracle
    // @param glv Glv
    // @param maximize
    // @return the USD value of the Glv
    function getValue(
        DataStore dataStore,
        Oracle oracle,
        address glv,
        bool maximize
    ) internal view returns (uint256 glvValue) {
        GetValueCache memory cache;
        cache.marketListKey = Keys.glvSupportedMarketListKey(glv);
        cache.marketCount = dataStore.getAddressCount(cache.marketListKey);

        address[] memory marketAddresses = dataStore.getAddressValuesAt(cache.marketListKey, 0, cache.marketCount);
        for (uint256 i = 0; i < marketAddresses.length; i++) {
            address marketAddress = marketAddresses[i];
            Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);
            (int256 marketTokenPrice, ) = MarketUtils.getMarketTokenPrice(
                dataStore,
                market,
                oracle.getPrimaryPrice(market.indexToken),
                oracle.getPrimaryPrice(market.longToken),
                oracle.getPrimaryPrice(market.shortToken),
                Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
                maximize
            );

            if (marketTokenPrice < 0) {
                revert Errors.InvalidMarketTokenPrice(marketAddress, marketTokenPrice);
            }

            uint256 balance = IERC20(marketAddress).balanceOf(glv);

            glvValue += Precision.mulDiv(balance, marketTokenPrice.toUint256(), Precision.WEI_PRECISION);
        }
    }

    function getGlvTokenPrice(
        DataStore dataStore,
        Oracle oracle,
        address glv,
        bool maximize
    ) internal view returns (uint256) {
        uint256 glvValue = GlvUtils.getValue(dataStore, oracle, glv, maximize);
        uint256 glvSupply = ERC20(glv).totalSupply();

        // if the supply is zero then treat the market token price as 1 USD
        if (glvSupply == 0) {
            return Precision.FLOAT_PRECISION;
        }

        return glvValue / glvSupply;
    }

    function validateMarket(DataStore dataStore, address glv, address market, bool shouldBeEnabled) public view {
        if (!dataStore.containsAddress(Keys.glvSupportedMarketListKey(glv), market)) {
            revert Errors.GlvUnsupportedMarket(glv, market);
        }

        if (shouldBeEnabled) {
            if (dataStore.getBool(Keys.isGlvMarketDisabledKey(glv, market))) {
                revert Errors.GlvDisabledMarket(glv, market);
            }
        }
    }

    function validateGlv(DataStore dataStore, address glv) public view {
        if (!dataStore.containsAddress(Keys.GLV_LIST, glv)) {
            revert Errors.EmptyGlv(glv);
        }
    }

    function getMarketCount(DataStore dataStore, address glv) external view returns (uint256) {
        return dataStore.getAddressCount(Keys.glvSupportedMarketListKey(glv));
    }

    function applyDeltaToCumulativeDepositUsd(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address glv,
        address market,
        int256 deltaUsd
    ) external returns (uint256) {
        uint256 currentValue = getCumulativeDepositUsd(dataStore, glv, market);

        // GM price varies over time and negative cumulative deposited usd is possible
        if (deltaUsd < 0 && (-deltaUsd).toUint256() > currentValue) {
            deltaUsd = -currentValue.toInt256();
        }
        uint256 nextValue = Calc.sumReturnUint256(currentValue, deltaUsd);

        validateCumulativeDepositUsd(dataStore, glv, market, nextValue);

        GlvEventUtils.emitGlvCumulativeDepositUsdUpdated(eventEmitter, glv, market, deltaUsd, nextValue);

        return nextValue;
    }

    function validateCumulativeDepositUsd(
        DataStore dataStore,
        address glv,
        address market,
        uint256 cumulativeDepositUsd
    ) internal view {
        uint256 maxCumulativeDepositUsd = dataStore.getUint(Keys.glvMaxCumulativeDepositUsdKey(glv, market));
        if (maxCumulativeDepositUsd == 0) {
            return;
        }

        if (cumulativeDepositUsd > maxCumulativeDepositUsd) {
            revert Errors.GlvMaxCumulativeDepositUsdExceeded(cumulativeDepositUsd, maxCumulativeDepositUsd);
        }
    }

    function validateCumulativeDepositDeltaUsd(
        DataStore dataStore,
        address glv,
        address market,
        int256 deltaUsd
    ) internal view {
        uint256 currentValue = getCumulativeDepositUsd(dataStore, glv, market);

        // GM price varies over time and negeative cumulative deposited usd is possible
        if (deltaUsd < 0 && (-deltaUsd).toUint256() > currentValue) {
            deltaUsd = -currentValue.toInt256();
        }
        uint256 nextValue = Calc.sumReturnUint256(currentValue, deltaUsd);
        validateCumulativeDepositUsd(dataStore, glv, market, nextValue);
    }

    function getCumulativeDepositUsd(DataStore dataStore, address glv, address market) internal view returns (uint256) {
        bytes32 key = Keys.glvCumulativeDepositUsdKey(glv, market);
        return dataStore.getUint(key);
    }

    function validateMarketTokenBalanceUsd(
        DataStore dataStore,
        address glv,
        Market.Props memory market,
        uint256 marketTokenPrice
    ) internal view {
        uint256 maxMarketTokenBalanceUsd = getGlvMaxMarketTokenBalanceUsd(dataStore, glv, market.marketToken);
        if (maxMarketTokenBalanceUsd == 0) {
            return;
        }

        uint256 marketTokenBalanceUsd = ERC20(market.marketToken).balanceOf(glv) * marketTokenPrice;
        if (marketTokenBalanceUsd > maxMarketTokenBalanceUsd) {
            revert Errors.GlvMaxMarketTokenBalanceUsdExceeded(
                glv,
                market.marketToken,
                maxMarketTokenBalanceUsd,
                marketTokenBalanceUsd
            );
        }
    }

    function getGlvMaxMarketTokenBalanceUsd(
        DataStore dataStore,
        address glv,
        address market
    ) internal view returns (uint256) {
        return dataStore.getUint(Keys.glvMaxMarketTokenBalanceUsdKey(glv, market));
    }

    function addMarket(DataStore dataStore, EventEmitter eventEmitter, address glv, address marketAddress) external {
        validateGlv(dataStore, glv);

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, marketAddress);
        (address longToken, address shortToken) = getGlvTokens(dataStore, glv);
        if (market.longToken != longToken) {
            revert Errors.GlvInvalidLongToken(glv, market.longToken, longToken);
        }
        if (market.shortToken != shortToken) {
            revert Errors.GlvInvalidShortToken(glv, market.shortToken, shortToken);
        }

        bytes32 key = Keys.glvSupportedMarketListKey(glv);
        if (dataStore.containsAddress(key, marketAddress)) {
            revert Errors.GlvMarketAlreadyExists(glv, marketAddress);
        }
        dataStore.addAddress(key, marketAddress);

        GlvEventUtils.emitGlvMarketAdded(eventEmitter, glv, market.marketToken);
    }

    function getGlvTokens(DataStore dataStore, address glv) internal view returns (address, address) {
        address longToken = dataStore.getAddress(Keys.glvLongTokenKey(address(glv)));
        address shortToken = dataStore.getAddress(Keys.glvShortTokenKey(address(glv)));

        return (longToken, shortToken);
    }
}
