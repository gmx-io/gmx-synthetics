// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";
import "./GlvToken.sol";
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
    ) public view returns (uint256) {
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
            cache.glvValue += _getGlvMarketValue(
                dataStore,
                glv,
                marketAddress,
                oracle.getPrimaryPrice(market.indexToken),
                cache.longTokenPrice,
                cache.shortTokenPrice,
                maximize
            );
        }

        return cache.glvValue;
    }

    function getGlvValue(
        DataStore dataStore,
        address[] memory marketAddresses,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address glv,
        bool maximize
    ) public view returns (uint256) {
        GetGlvValueCache memory cache;

        for (uint256 i = 0; i < marketAddresses.length; i++) {
            address marketAddress = marketAddresses[i];
            cache.indexTokenPrice = indexTokenPrices[i];

            cache.glvValue += _getGlvMarketValue(
                dataStore,
                glv,
                marketAddress,
                cache.indexTokenPrice,
                longTokenPrice,
                shortTokenPrice,
                maximize
            );
        }

        return cache.glvValue;
    }

    function _getGlvMarketValue(
        DataStore dataStore,
        address glv,
        address marketAddress,
        Price.Props memory indexTokenPrice,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        bool maximize
    ) internal view returns (uint256) {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);

        uint256 marketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(marketAddress)));
        uint256 balance = GlvToken(payable(glv)).tokenBalances(marketAddress);

        if (balance == 0) {
            return 0;
        }

        MarketPoolValueInfo.Props memory marketPoolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            indexTokenPrice,
            longTokenPrice,
            shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            maximize
        );

        if (marketPoolValueInfo.poolValue < 0) {
            revert Errors.GlvNegativeMarketPoolValue(glv, marketAddress);
        }

        return
            MarketUtils.marketTokenAmountToUsd(balance, marketPoolValueInfo.poolValue.toUint256(), marketTokenSupply);
    }

    function getGlvTokenPrice(
        DataStore dataStore,
        Oracle oracle,
        address glv,
        bool maximize
    ) internal view returns (uint256, uint256, uint256) {
        uint256 value = getGlvValue(dataStore, oracle, glv, maximize);
        uint256 supply = ERC20(glv).totalSupply();

        return _getGlvTokenPrice(value, supply);
    }

    function getGlvTokenPrice(
        DataStore dataStore,
        address[] memory marketAddresses,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address glv,
        bool maximize
    ) internal view returns (uint256, uint256, uint256) {
        uint256 value = getGlvValue(
            dataStore,
            marketAddresses,
            indexTokenPrices,
            longTokenPrice,
            shortTokenPrice,
            glv,
            maximize
        );
        uint256 supply = ERC20(glv).totalSupply();

        return _getGlvTokenPrice(value, supply);
    }

    function _getGlvTokenPrice(uint256 value, uint256 supply) internal pure returns (uint256, uint256, uint256) {
        // if the supply is zero then treat the market token price as 1 USD
        if (supply == 0) {
            return (Precision.FLOAT_PRECISION, value, supply);
        }
        if (value == 0) {
            return (0, value, supply);
        }
        return (Precision.mulDiv(Precision.WEI_PRECISION, value, supply), value, supply);
    }

    function usdToGlvTokenAmount(
        uint256 usdValue,
        uint256 glvValue,
        uint256 glvSupply
    ) internal pure returns (uint256) {
        // if the supply and glvValue is zero, use 1 USD as the token price
        if (glvSupply == 0 && glvValue == 0) {
            return Precision.floatToWei(usdValue);
        }

        // if the supply is zero and the glvValue is more than zero,
        // then include the glvValue for the amount of tokens minted so that
        // the market token price after mint would be 1 USD
        if (glvSupply == 0 && glvValue > 0) {
            return Precision.floatToWei(glvValue + usdValue);
        }

        // round market tokens down
        return Precision.mulDiv(glvSupply, usdValue, glvValue);
    }

    function glvTokenAmountToUsd(
        uint256 glvTokenAmount,
        uint256 glvValue,
        uint256 glvSupply
    ) internal pure returns (uint256) {
        if (glvSupply == 0) {
            revert Errors.EmptyGlvTokenSupply();
        }

        return Precision.mulDiv(glvValue, glvTokenAmount, glvSupply);
    }

    function validateGlvMarket(DataStore dataStore, address glv, address market, bool shouldBeEnabled) public view {
        if (!dataStore.containsAddress(Keys.glvSupportedMarketListKey(glv), market)) {
            revert Errors.GlvUnsupportedMarket(glv, market);
        }

        if (shouldBeEnabled && dataStore.getBool(Keys.isGlvMarketDisabledKey(glv, market))) {
            revert Errors.GlvDisabledMarket(glv, market);
        }
    }

    function validateGlv(DataStore dataStore, address glv) public view {
        if (!dataStore.containsAddress(Keys.GLV_LIST, glv)) {
            revert Errors.EmptyGlv(glv);
        }
    }

    function getGlvMarketCount(DataStore dataStore, address glv) external view returns (uint256) {
        return dataStore.getAddressCount(Keys.glvSupportedMarketListKey(glv));
    }

    function validateGlvMarketTokenBalance(
        DataStore dataStore,
        address glv,
        Market.Props memory market,
        uint256 marketPoolValue,
        uint256 marketTokenSupply
    ) external view {
        uint256 maxMarketTokenBalanceUsd = dataStore.getUint(
            Keys.glvMaxMarketTokenBalanceUsdKey(glv, market.marketToken)
        );
        uint256 maxMarketTokenBalanceAmount = dataStore.getUint(
            Keys.glvMaxMarketTokenBalanceAmountKey(glv, market.marketToken)
        );

        if (maxMarketTokenBalanceAmount == 0 && maxMarketTokenBalanceUsd == 0) {
            return;
        }

        uint256 marketTokenBalanceAmount = GlvToken(payable(glv)).tokenBalances(market.marketToken);
        if (maxMarketTokenBalanceAmount > 0 && marketTokenBalanceAmount > maxMarketTokenBalanceAmount) {
            revert Errors.GlvMaxMarketTokenBalanceAmountExceeded(
                glv,
                market.marketToken,
                maxMarketTokenBalanceAmount,
                marketTokenBalanceAmount
            );
        }

        if (maxMarketTokenBalanceUsd > 0) {
            uint256 marketTokenBalanceUsd = MarketUtils.marketTokenAmountToUsd(
                marketTokenBalanceAmount,
                marketPoolValue,
                marketTokenSupply
            );
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

        validateGlvMarketCount(dataStore, glvAddress);

        GlvEventUtils.emitGlvMarketAdded(eventEmitter, glvAddress, market.marketToken);
    }

    function validateGlvMarketCount(DataStore dataStore, address glvAddress) internal view {
        uint256 glvMaxMarketCount = dataStore.getUint(Keys.GLV_MAX_MARKET_COUNT);
        if (glvMaxMarketCount > 0) {
            bytes32 key = Keys.glvSupportedMarketListKey(glvAddress);
            uint256 glvMarketCount = dataStore.getAddressCount(key);
            if (glvMarketCount > glvMaxMarketCount) {
                revert Errors.GlvMaxMarketCountExceeded(glvAddress, glvMaxMarketCount);
            }
        }
    }

    function removeMarketFromGlv(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address glvAddress,
        address marketAddress
    ) external {
        validateGlv(dataStore, glvAddress);
        validateGlvMarket(dataStore, glvAddress, marketAddress, false);

        if (!dataStore.getBool(Keys.isGlvMarketDisabledKey(glvAddress, marketAddress))) {
            revert Errors.GlvEnabledMarket(glvAddress, marketAddress);
        }

        uint256 balance = GlvToken(payable(glvAddress)).tokenBalances(marketAddress);
        if (balance != 0) {
            revert Errors.GlvNonZeroMarketBalance(glvAddress, marketAddress);
        }

        bytes32 key = Keys.glvSupportedMarketListKey(glvAddress);
        dataStore.removeAddress(key, marketAddress);

        GlvEventUtils.emitGlvMarketRemoved(eventEmitter, glvAddress, marketAddress);
    }
}
