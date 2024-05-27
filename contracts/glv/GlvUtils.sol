// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/Glv.sol";
import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";

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
    function usdToMarketTokenAmount(
        uint256 usdValue,
        uint256 glvValue,
        uint256 supply
    ) internal pure returns (uint256) {
        // if the supply and glvValue is zero, use 1 USD as the token price
        if (supply == 0 && glvValue == 0) {
            return Precision.floatToWei(usdValue);
        }

        // if the supply is zero and the glvValue is more than zero,
        // then include the glvValue for the amount of tokens minted so that
        // the glv token price after mint would be 1 USD
        // TODO: taken from MarketUtils, is it correct for glv?
        if (supply == 0 && glvValue > 0) {
            return Precision.floatToWei(glvValue + usdValue);
        }

        // round glv tokens down
        return Precision.mulDiv(supply, usdValue, glvValue);
    }

    function validateMarket(DataStore dataStore, address glv, address market) internal view {
        if (!dataStore.containsAddress(Keys.glvSupportedMarketListKey(glv), market)) {
            revert Errors.GlvUnsupportedMarket(glv, market);
        }
    }

    function getMarketCount(DataStore dataStore, address glv) internal view returns (uint256) {
        return dataStore.getAddressCount(Keys.glvSupportedMarketListKey(glv));
    }
}
