// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/Glv.sol";
import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";
import "../shift/ShiftUtils.sol";
import "../shift/ShiftVault.sol";
import "../exchange/IShiftHandler.sol";
import "./GlvEventUtils.sol";

library GlvUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    struct CreateShiftCache {
        Market.Props fromMarket;
        Market.Props toMarket;
        int256 toMarketTokenPrice;
        uint256 fromMarketTokenBalance;
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
        Glv glv,
        bool maximize
    ) internal view returns (uint256 glvValue) {
        address[] memory markets = new address[](2);
        for (uint256 i = 0; i < markets.length; i++) {
            address marketAddress = markets[i];
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

            uint256 balance = IERC20(marketAddress).balanceOf(address(glv));

            glvValue += balance * marketTokenPrice.toUint256();
        }
    }

    // @dev convert a number of glv tokens to its USD value
    // @param glvTokenAmount the input number of glv tokens
    // @param poolValue the value of the pool
    // @param supply the supply of glv tokens
    // @return the USD value of the glv tokens
    function glvTokenAmountToUsd(
        uint256 glvTokenAmount,
        uint256 poolValue,
        uint256 supply
    ) internal pure returns (uint256) {
        if (supply == 0) {
            revert Errors.EmptyMarketTokenSupply();
        }

        return Precision.mulDiv(poolValue, glvTokenAmount, supply);
    }

    // @dev convert a USD value to number of glv tokens
    // @param usdValue the input USD value
    // @param glvValue the value of the pool
    // @param supply the supply of glv tokens
    // @return the number of glv tokens
    function usdToGlvTokenAmount(uint256 usdValue, uint256 glvValue, uint256 supply) internal pure returns (uint256) {
        // if the supply and glvValue is zero, use 1 USD as the token price
        if (supply == 0 && glvValue == 0) {
            return Precision.floatToWei(usdValue);
        }

        // if the supply is zero and the glvValue is more than zero,
        // then include the glvValue for the amount of tokens minted so that
        // the glv token price after mint would be 1 USD
        // TODO: copy-pasted from MarketUtils, is it correct for glv?
        if (supply == 0 && glvValue > 0) {
            return Precision.floatToWei(glvValue + usdValue);
        }

        // round glv tokens down
        return Precision.mulDiv(supply, usdValue, glvValue);
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

        // GM price varies over time and negeative cumulative deposited usd is possible
        if (deltaUsd < 0 && (-deltaUsd).toUint256() > currentValue) {
            deltaUsd = -currentValue.toInt256();
        }
        uint256 nextValue = Calc.sumReturnUint256(currentValue, deltaUsd);

        validateCumulativeDepositUsd(dataStore, glv, market, nextValue);

        GlvEventUtils.emitCumulativeDepositUsdUpdated(eventEmitter, glv, market, deltaUsd, nextValue);

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

    function createShift(
        DataStore dataStore,
        Oracle oracle,
        IShiftHandler shiftHandler,
        ShiftVault shiftVault,
        address account,
        address glv,
        uint256 marketTokenAmount,
        ShiftUtils.CreateShiftParams memory params
    ) external returns (bytes32) {
        validateGlv(dataStore, glv);

        validateMarket(dataStore, glv, params.fromMarket, false);
        validateMarket(dataStore, glv, params.toMarket, true);

        if (params.receiver != address(glv)) {
            revert Errors.GlvInvalidReceiver(address(glv), params.receiver);
        }
        if (params.callbackContract != address(this)) {
            revert Errors.GlvInvalidCallbackContract(address(glv), params.callbackContract);
        }

        CreateShiftCache memory cache;

        cache.fromMarket = MarketStoreUtils.get(dataStore, params.fromMarket);
        cache.fromMarketTokenBalance = ERC20(cache.fromMarket.marketToken).balanceOf(glv);
        if (cache.fromMarketTokenBalance < marketTokenAmount) {
            revert Errors.GlvInsufficientMarketTokenBalance(
                glv,
                cache.fromMarket.marketToken,
                cache.fromMarketTokenBalance,
                marketTokenAmount
            );
        }

        validatePendingShift(dataStore, glv);

        cache.toMarket = MarketStoreUtils.get(dataStore, params.toMarket);

        (cache.toMarketTokenPrice,) = MarketUtils.getMarketTokenPrice(
            dataStore,
            cache.toMarket,
            oracle.getPrimaryPrice(cache.toMarket.indexToken),
            oracle.getPrimaryPrice(cache.toMarket.longToken),
            oracle.getPrimaryPrice(cache.toMarket.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true // maximize
        );

        validateMaxMarketTokenBalanceUsd(dataStore, glv, cache.toMarket, marketTokenAmount, cache.toMarketTokenPrice.toUint256());

        uint256 marketTokenUsd = marketTokenAmount * cache.toMarketTokenPrice.toUint256();
        validateCumulativeDepositDeltaUsd(dataStore, glv, params.toMarket, marketTokenUsd.toInt256());
        validateCumulativeDepositDeltaUsd(dataStore, glv, params.fromMarket, -marketTokenUsd.toInt256());

        TokenUtils.transfer(dataStore, cache.fromMarket.marketToken, address(shiftVault), marketTokenAmount);
        bytes32 shiftKey = shiftHandler.createShift(account, params);

        setPendingShift(dataStore, glv, shiftKey);

        return shiftKey;
    }

    function validatePendingShift(DataStore dataStore, address glv) internal view {
        bytes32 shiftKey = dataStore.getBytes32(Keys.glvPendingShiftKey(glv));
        if (shiftKey != bytes32(0)) {
            revert Errors.GlvHasPendingShift(glv);
        }
    }

    function setPendingShift(DataStore dataStore, address glv, bytes32 shiftKey) internal {
        dataStore.setBytes32(Keys.glvPendingShiftKey(glv), shiftKey);
        dataStore.setAddress(Keys.glvPendingShiftBackrefKey(shiftKey), glv);
    }

    function clearPendingShift(DataStore dataStore, bytes32 shiftKey) external {
        address glv = dataStore.getAddress(Keys.glvPendingShiftBackrefKey(shiftKey));
        if (glv == address(0)) {
            revert Errors.GlvShiftNotFound(shiftKey);
        }
        dataStore.removeAddress(Keys.glvPendingShiftBackrefKey(shiftKey));
        dataStore.removeBytes32(Keys.glvPendingShiftKey(glv));
    }

    function validateMaxMarketTokenBalanceUsd(
        DataStore dataStore,
        address glv,
        Market.Props memory market,
        uint256 marketTokenPrice,
        uint256 marketTokenAmount
    ) internal view {
        uint256 maxMarketTokenBalanceUsd = getGlvMaxMarketTokenBalanceUsd(dataStore, glv, market.marketToken);
        if (maxMarketTokenBalanceUsd == 0) {
            return;
        }

        uint256 marketTokenUsd = marketTokenAmount * marketTokenPrice;
        uint256 marketTokenBalanceUsd = ERC20(market.marketToken).balanceOf(glv) * marketTokenPrice;
        uint256 nextMarketTokenBalanceUsd = marketTokenBalanceUsd + marketTokenUsd;
        if (nextMarketTokenBalanceUsd > maxMarketTokenBalanceUsd) {
            revert Errors.GlvMaxMarketTokenBalanceUsdExceeded(
                glv,
                market.marketToken,
                maxMarketTokenBalanceUsd,
                nextMarketTokenBalanceUsd
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

    function addMarket(DataStore dataStore, address glv, address market) external {
        validateGlv(dataStore, glv);
        MarketUtils.validateEnabledMarket(dataStore, market);

        bytes32 key = Keys.glvSupportedMarketListKey(glv);
        if (dataStore.containsAddress(key, market)) {
            revert Errors.GlvMarketAlreadyExists(glv, market);
        }
        dataStore.addAddress(key, market);
    }
}
