// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../utils/Precision.sol";
import "./Position.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "../pricing/PositionPricingUtils.sol";

// @title PositionUtils
// @dev Library for position functions
library PositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Position for Position.Props;
    using Price for Price.Props;

    // @dev _IsPositionLiquidatableCache struct used in isPositionLiquidatable
    // to avoid stack too deep errors
    // @param positionPnlUsd the position's pnl in USD
    // @param maxLeverage the max allowed leverage
    // @param collateralUsd the position's collateral in USD
    // @param priceImpactUsd the price impact of closing the position in USD
    // @param minCollateralUsd the minimum allowed collateral in USD
    // @param remainingCollateralUsd the remaining position collateral in USD
    struct _IsPositionLiquidatableCache {
        int256 positionPnlUsd;
        uint256 maxLeverage;
        uint256 collateralUsd;
        int256 priceImpactUsd;
        int256 minCollateralUsd;
        int256 remainingCollateralUsd;
    }

    error LiquidatablePosition();

    // @dev get the position pnl in USD
    //
    // for long positions, pnl is calculated as:
    // (position.sizeInTokens * indexTokenPrice) - position.sizeInUsd
    // if position.sizeInTokens is larger for long positions, the position will have
    // larger profits and smaller losses for the same changes in token price
    //
    // for short positions, pnl is calculated as:
    // position.sizeInUsd -  (position.sizeInTokens * indexTokenPrice)
    // if position.sizeInTokens is smaller for long positions, the position will have
    // larger profits and smaller losses for the same changes in token price
    //
    // @param position the position values
    // @param sizeDeltaUsd the change in position size
    // @param indexTokenPrice the price of the index token
    //
    // @return (positionPnlUsd, sizeDeltaInTokens)
    function getPositionPnlUsd(
        Position.Props memory position,
        uint256 sizeDeltaUsd,
        uint256 indexTokenPrice
    ) internal pure returns (int256, uint256) {
        // position.sizeInUsd is the cost of the tokens, positionValue is the current worth of the tokens
        int256 positionValue = (position.sizeInTokens() * indexTokenPrice).toInt256();
        int256 totalPositionPnl = position.isLong() ? positionValue - position.sizeInUsd().toInt256() : position.sizeInUsd().toInt256() - positionValue;

        uint256 sizeDeltaInTokens;

        if (position.sizeInUsd() == sizeDeltaUsd) {
            sizeDeltaInTokens = position.sizeInTokens();
        } else {
            if (position.isLong()) {
                sizeDeltaInTokens = Calc.roundUpDivision(position.sizeInTokens() * sizeDeltaUsd, position.sizeInUsd());
            } else {
                sizeDeltaInTokens = position.sizeInTokens() * sizeDeltaUsd / position.sizeInUsd();
            }
        }

        int256 positionPnlUsd = totalPositionPnl * sizeDeltaInTokens.toInt256() / position.sizeInTokens().toInt256();

        return (positionPnlUsd, sizeDeltaInTokens);
    }

    // @dev convert sizeDeltaUsd to sizeDeltaInTokens
    // @param sizeInUsd the position size in USD
    // @param sizeInTokens the position size in tokens
    // @param sizeDeltaUsd the position size change in USD
    // @return the size delta in tokens
    function getSizeDeltaInTokens(uint256 sizeInUsd, uint256 sizeInTokens, uint256 sizeDeltaUsd) internal pure returns (uint256) {
        return sizeInTokens * sizeDeltaUsd / sizeInUsd;
    }

    // @dev get the key for a position
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @return the position key
    function getPositionKey(address account, address market, address collateralToken, bool isLong) internal pure returns (bytes32) {
        bytes32 key = keccak256(abi.encode(account, market, collateralToken, isLong));
        return key;
    }

    // @dev validate that a position is not empty
    // @param position the position values
    function validateNonEmptyPosition(Position.Props memory position) internal pure {
        if (position.sizeInUsd() == 0 || position.sizeInTokens() == 0 || position.collateralAmount() == 0) {
            revert(Keys.EMPTY_POSITION_ERROR);
        }
    }

    // @dev check if a position is valid
    // @param dataStore DataStore
    // @param referralStorage IReferralStorage
    // @param position the position values
    // @param market the market values
    // @param prices the prices of the tokens in the market
    function validatePosition(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Position.Props memory position,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) internal view {
        if (position.sizeInUsd() == 0 || position.sizeInTokens() == 0) {
            revert("Position size is zero");
        }

        if (isPositionLiquidatable(
            dataStore,
            referralStorage,
            position,
            market,
            prices
        )) {
            revert LiquidatablePosition();
        }
    }

    // @dev check if a position is liquidatable
    // @param dataStore DataStore
    // @param referralStorage IReferralStorage
    // @param position the position values
    // @param market the market values
    // @param prices the prices of the tokens in the market
    function isPositionLiquidatable(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Position.Props memory position,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) internal view returns (bool) {
        _IsPositionLiquidatableCache memory cache;

        (cache.positionPnlUsd, ) = getPositionPnlUsd(
            position,
            position.sizeInUsd(),
            prices.indexTokenPrice.pickPriceForPnl(position.isLong(), false)
        );

        cache.maxLeverage = dataStore.getUint(Keys.MAX_LEVERAGE);
        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(
            position.collateralToken(),
            market,
            prices
        );

        cache.collateralUsd = position.collateralAmount() * collateralTokenPrice.min;

        cache.priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
                -position.sizeInUsd().toInt256(),
                position.isLong()
            )
        );

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            dataStore,
            referralStorage,
            position,
            collateralTokenPrice,
            market.longToken,
            market.shortToken,
            position.sizeInUsd()
        );

        cache.minCollateralUsd = dataStore.getUint(Keys.MIN_COLLATERAL_USD).toInt256();
        cache.remainingCollateralUsd = cache.collateralUsd.toInt256() + cache.positionPnlUsd + cache.priceImpactUsd - fees.totalNetCostUsd.toInt256();

        // the position is liquidatable if the remaining collateral is less than the required min collateral
        if (cache.remainingCollateralUsd < cache.minCollateralUsd || cache.remainingCollateralUsd == 0) {
            return true;
        }

        // validate if position.size / (remaining collateral) exceeds max leverage
        if (position.sizeInUsd() * Precision.FLOAT_PRECISION / cache.remainingCollateralUsd.toUint256() > cache.maxLeverage) {
            return true;
        }

        return false;
    }
}
