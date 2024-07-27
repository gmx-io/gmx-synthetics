// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";
import "./GlvEventUtils.sol";
import "./GlvStoreUtils.sol";

library GlvUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    struct GetGlvValueCache {
        bytes32 marketListKey;
        uint256 marketCount;
        uint256 glvValue;
        Price.Props indexTokenPrice;
        Price.Props longTokenPrice;
        Price.Props shortTokenPrice;
        Market.Props market;
    }

    // @dev get the USD value of the Glv
    // @param dataStore DataStore
    // @param oracle Oracle
    // @param glv Glv
    // @param maximize
    // @return the USD value of the Glv
    function getGlvValue(
        DataStore dataStore,
        Oracle oracle,
        address glv,
        bool maximize
    ) internal view returns (uint256) {
        GetGlvValueCache memory cache;
        cache.marketListKey = Keys.glvSupportedMarketListKey(glv);
        cache.marketCount = dataStore.getAddressCount(cache.marketListKey);

        address[] memory marketAddresses = dataStore.getAddressValuesAt(cache.marketListKey, 0, cache.marketCount);
        for (uint256 i = 0; i < marketAddresses.length; i++) {
            address marketAddress = marketAddresses[i];
            Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);
            if (i == 0) {
                cache.longTokenPrice = oracle.getPrimaryPrice(market.longToken);
                cache.shortTokenPrice = oracle.getPrimaryPrice(market.shortToken);
            }
            (int256 marketTokenPrice, ) = MarketUtils.getMarketTokenPrice(
                dataStore,
                market,
                oracle.getPrimaryPrice(market.indexToken),
                cache.longTokenPrice,
                cache.shortTokenPrice,
                Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
                maximize
            );

            if (marketTokenPrice < 0) {
                revert Errors.InvalidMarketTokenPrice(marketAddress, marketTokenPrice);
            }

            uint256 balance = IERC20(marketAddress).balanceOf(glv);

            cache.glvValue += MarketUtils.marketTokenAmountToUsd(balance, marketTokenPrice);
        }

        return cache.glvValue;
    }

    function getGlvValue(
        DataStore dataStore,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address glv,
        bool maximize
    ) internal view returns (uint256) {
        GetGlvValueCache memory cache;
        cache.marketListKey = Keys.glvSupportedMarketListKey(glv);
        cache.marketCount = dataStore.getAddressCount(cache.marketListKey);

        address[] memory marketAddresses = dataStore.getAddressValuesAt(cache.marketListKey, 0, cache.marketCount);
        for (uint256 i = 0; i < marketAddresses.length; i++) {
            address marketAddress = marketAddresses[i];
            cache.indexTokenPrice = indexTokenPrices[i];
            cache.market = MarketStoreUtils.get(dataStore, marketAddress);
            (int256 marketTokenPrice, ) = MarketUtils.getMarketTokenPrice(
                dataStore,
                cache.market,
                cache.indexTokenPrice,
                longTokenPrice,
                shortTokenPrice,
                Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
                maximize
            );

            if (marketTokenPrice < 0) {
                revert Errors.InvalidMarketTokenPrice(marketAddress, marketTokenPrice);
            }

            uint256 balance = IERC20(marketAddress).balanceOf(glv);

            cache.glvValue += MarketUtils.marketTokenAmountToUsd(balance, marketTokenPrice);
        }

        return cache.glvValue;
    }

    function getGlvTokenPrice(
        DataStore dataStore,
        Oracle oracle,
        address glv,
        bool maximize
    ) internal view returns (uint256) {
        uint256 value = GlvUtils.getGlvValue(dataStore, oracle, glv, maximize);
        uint256 supply = ERC20(glv).totalSupply();

        // if the supply is zero then treat the market token price as 1 USD
        if (supply == 0) {
            return Precision.FLOAT_PRECISION;
        }

        return Precision.mulDiv(Precision.WEI_PRECISION, value, supply);
    }

    function usdToGlvTokenAmount(
        uint256 usdValue,
        uint256 glvTokenPrice
    ) internal pure returns (uint256) {
        return Precision.mulDiv(usdValue, Precision.WEI_PRECISION, glvTokenPrice);
    }

    function glvTokenAmountToUsd(
        uint256 glvTokenAmount,
        uint256 glvTokenPrice
    ) internal pure returns (uint256) {
        return Precision.mulDiv(glvTokenAmount, glvTokenPrice, Precision.WEI_PRECISION);
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

    function validateGlvMarketTokenBalance(
        DataStore dataStore,
        address glv,
        Market.Props memory market,
        int256 marketTokenPrice
    ) internal view {
        uint256 maxMarketTokenBalanceUsd = dataStore.getUint(
            Keys.glvMaxMarketTokenBalanceUsdKey(glv, market.marketToken)
        );
        uint256 maxMarketTokenBalanceAmount = dataStore.getUint(
            Keys.glvMaxMarketTokenBalanceAmountKey(glv, market.marketToken)
        );

        if (maxMarketTokenBalanceAmount == 0 && maxMarketTokenBalanceUsd == 0) {
            return;
        }

        uint256 marketTokenBalanceAmount = ERC20(market.marketToken).balanceOf(glv);
        if (maxMarketTokenBalanceAmount > 0 && marketTokenBalanceAmount > maxMarketTokenBalanceAmount) {
            revert Errors.GlvMaxMarketTokenBalanceAmountExceeded(
                glv,
                market.marketToken,
                maxMarketTokenBalanceAmount,
                marketTokenBalanceAmount
            );
        }

        if (maxMarketTokenBalanceUsd > 0) {
            uint256 marketTokenBalanceUsd = MarketUtils.marketTokenAmountToUsd(marketTokenBalanceAmount, marketTokenPrice);
            if (marketTokenBalanceUsd > maxMarketTokenBalanceUsd) {
                revert Errors.GlvMaxMarketTokenBalanceUsdExceeded(
                    glv,
                    market.marketToken,
                    maxMarketTokenBalanceUsd,
                    marketTokenBalanceUsd
                );
            }
        }
    }

    function addMarketToGlv(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address glvAddress,
        address marketAddress
    ) external {
        validateGlv(dataStore, glvAddress);

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, marketAddress);
        Glv.Props memory glv = GlvStoreUtils.get(dataStore, glvAddress);
        if (market.longToken != glv.longToken) {
            revert Errors.GlvInvalidLongToken(glvAddress, market.longToken, glv.longToken);
        }
        if (market.shortToken != glv.shortToken) {
            revert Errors.GlvInvalidShortToken(glvAddress, market.shortToken, glv.shortToken);
        }

        bytes32 key = Keys.glvSupportedMarketListKey(glvAddress);
        if (dataStore.containsAddress(key, marketAddress)) {
            revert Errors.GlvMarketAlreadyExists(glvAddress, marketAddress);
        }
        dataStore.addAddress(key, marketAddress);

        GlvEventUtils.emitGlvMarketAdded(eventEmitter, glvAddress, market.marketToken);
    }
}
