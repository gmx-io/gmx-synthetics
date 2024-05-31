// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/Glv.sol";
import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";
import "../shift/ShiftUtils.sol";
import "../exchange/IShiftHandler.sol";
import "../market/MarketPoolValueInfo.sol";

library GlvUtils {
    using SafeCast for int256;

    // @dev get the USD value of the Glv
    // @param dataStore DataStore
    // @param oracle Oracle
    // @param glv Glv
    // @return the USD value of the Glv
    function getValue(DataStore dataStore, Oracle oracle, Glv glv) public view returns (uint256 glvValue) {
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
                true // maximize
            );

            if (marketTokenPrice < 0) {
                revert Errors.InvalidMarketTokenPrice(marketAddress, marketTokenPrice);
            }

            uint256 balance = IERC20(marketAddress).balanceOf(address(glv));

            glvValue += balance * marketTokenPrice.toUint256();
        }
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

    function validateMarket(DataStore dataStore, address glv, address market, bool shouldBeEnabled) internal view {
        if (!dataStore.containsAddress(Keys.glvSupportedMarketListKey(glv), market)) {
            revert Errors.GlvUnsupportedMarket(glv, market);
        }

        if (shouldBeEnabled) {
            if (dataStore.getBool(Keys.isGlvMarketDisabledKey(glv, market))) {
                revert Errors.GlvDisabledMarket(glv, market);
            }
        }
    }

    function validateGlv(DataStore dataStore, address glv) internal view {
        if (!dataStore.containsAddress(Keys.GLV_LIST, glv)) {
            revert Errors.EmptyGlv(glv);
        }
    }

    function getMarketCount(DataStore dataStore, address glv) internal view returns (uint256) {
        return dataStore.getAddressCount(Keys.glvSupportedMarketListKey(glv));
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
    ) internal {
        validateGlv(dataStore, glv);

        validateMarket(dataStore, glv, params.fromMarket, false);
        validateMarket(dataStore, glv, params.toMarket, true);

        if (params.receiver != address(glv)) {
            revert Errors.GlvInvalidReceiver(address(glv), params.receiver);
        }
        if (params.callbackContract != address(this)) {
            revert Errors.GlvInvalidCallbackContract(address(glv), params.callbackContract);
        }

        Market.Props memory fromMarket = MarketStoreUtils.get(dataStore, params.fromMarket);
        uint256 marketTokenBalance = ERC20(fromMarket.marketToken).balanceOf(glv);
        if (marketTokenBalance < marketTokenAmount) {
            revert Errors.GlvInsufficientMarketTokenBalance(
                glv,
                fromMarket.marketToken,
                marketTokenBalance,
                marketTokenAmount
            );
        }

        validatePendingShift(dataStore, glv);

        Market.Props memory toMarket = MarketStoreUtils.get(dataStore, params.fromMarket);
        validateMaxMarketTokenBalance(dataStore, oracle, glv, toMarket, marketTokenAmount);

        TokenUtils.transfer(dataStore, fromMarket.marketToken, address(shiftVault), marketTokenAmount);
        bytes32 shiftKey = shiftHandler.createShift(account, params);

        setPendingShift(dataStore, glv, shiftKey);
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

    function clearPendingShift(DataStore dataStore, bytes32 shiftKey) internal {
        address glv = dataStore.getAddress(Keys.glvPendingShiftBackrefKey(shiftKey));
        if (glv == address(0)) {
            revert Errors.GlvShiftNotFound(shiftKey);
        }
        dataStore.removeAddress(Keys.glvPendingShiftBackrefKey(shiftKey));
        dataStore.removeBytes32(Keys.glvPendingShiftKey(glv));
    }

    function validateMaxMarketTokenBalance(
        DataStore dataStore,
        Oracle oracle,
        address glv,
        Market.Props memory market,
        uint256 marketTokenAmount
    ) internal view {
        uint256 maxMarketTokenBalanceUsd = getGlvMaxMarketTokenBalanceUsd(dataStore, glv, market.marketToken);
        if (maxMarketTokenBalanceUsd == 0) {
            return;
        }

        MarketPoolValueInfo.Props memory fromMarketPoolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true // maximize
        );

        uint256 marketTokenSupply = ERC20(market.marketToken).totalSupply();
        uint256 marketTokenUsd = MarketUtils.marketTokenAmountToUsd(
            marketTokenAmount,
            fromMarketPoolValueInfo.poolValue.toUint256(),
            marketTokenSupply
        );
        uint256 marketTokenBalanceUsd = MarketUtils.marketTokenAmountToUsd(
            ERC20(market.marketToken).balanceOf(glv),
            fromMarketPoolValueInfo.poolValue.toUint256(),
            marketTokenSupply
        );
        uint256 nextMarketTokenBalanceUsd = marketTokenBalanceUsd + marketTokenUsd;
        if (nextMarketTokenBalanceUsd > maxMarketTokenBalanceUsd) {
            revert Errors.GlvMaxMarketTokenBalanceExceeded(
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

    function addMarket(DataStore dataStore, address glv, address market) internal {
        GlvUtils.validateGlv(dataStore, glv);
        MarketUtils.validateEnabledMarket(dataStore, market);

        bytes32 key = Keys.glvSupportedMarketListKey(glv);
        if (dataStore.containsAddress(key, market)) {
            revert Errors.GlvMarketAlreadyExists(glv, market);
        }
        dataStore.addAddress(key, market);
    }

    function disableMarket(DataStore dataStore, address glv, address market) internal {
        GlvUtils.validateGlv(dataStore, glv);
        bytes32 key = Keys.glvSupportedMarketListKey(glv);
        if (!dataStore.containsAddress(key, market)) {
            revert Errors.GlvUnsupportedMarket(glv, market);
        }

        dataStore.setBool(Keys.isGlvMarketDisabledKey(glv, market), true);
    }
}
