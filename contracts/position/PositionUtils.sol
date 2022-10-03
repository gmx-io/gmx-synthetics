// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../utils/Precision.sol";
import "./Position.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "../pricing/PositionPricingUtils.sol";

library PositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Position for Position.Props;

    error LiquidatablePosition();
    error UnexpectedPositionState();

    function getPositionPnlAmount(
        Position.Props memory position,
        uint256 sizeDeltaUsd,
        uint256 indexTokenPrice,
        uint256 collateralTokenPrice
    ) internal pure returns (int256, uint256) {
        (int256 realizedPnlUsd, uint256 sizeDeltaInTokens) = PositionUtils.getPositionPnlUsd(
            position,
            sizeDeltaUsd,
            indexTokenPrice
        );

        return (realizedPnlUsd / collateralTokenPrice.toInt256(), sizeDeltaInTokens);
    }

    // returns (positionPnlUsd, sizeDeltaInTokens)
    function getPositionPnlUsd(
        Position.Props memory position,
        uint256 sizeDeltaUsd,
        uint256 indexTokenPrice
    ) internal pure returns (int256, uint256) {
        // position.sizeInUsd is the cost of the tokens, positionValue is the current worth of the tokens
        int256 positionValue = (position.sizeInTokens * indexTokenPrice).toInt256();
        int256 totalPositionPnl = position.isLong ? positionValue - position.sizeInUsd.toInt256() : position.sizeInUsd.toInt256() - positionValue;

        uint256 sizeDeltaInTokens;

        // to avoid gaming for tokens with a small number of decimals
        // if profit will be realized, round sizeDeltaInTokens down
        // if loss will be realized, round sizeDeltaInTokens up
        if (totalPositionPnl > 0) {
            sizeDeltaInTokens = position.sizeInTokens * sizeDeltaUsd / position.sizeInUsd;
        } else {
            uint256 nextSizeInUsd = position.sizeInUsd - sizeDeltaUsd;
            uint256 nextSizeInTokens = position.sizeInTokens * nextSizeInUsd / position.sizeInUsd;
            sizeDeltaInTokens = position.sizeInTokens - nextSizeInTokens;
        }

        if (position.sizeInUsd == sizeDeltaUsd) {
            sizeDeltaInTokens = position.sizeInTokens;
        }

        int256 positionPnlUsd = totalPositionPnl * sizeDeltaInTokens.toInt256() / position.sizeInTokens.toInt256();

        return (positionPnlUsd, sizeDeltaInTokens);
    }

    function getSizeDeltaInTokens(uint256 sizeInUsd, uint256 sizeInTokens, uint256 sizeDeltaUsd) internal pure returns (uint256) {
        return sizeInTokens * sizeDeltaUsd / sizeInUsd;
    }

    function getPositionKey(address account, address market, address collateralToken, bool isLong) internal pure returns (bytes32) {
        bytes32 key = keccak256(abi.encodePacked(account, market, collateralToken, isLong));
        return key;
    }

    function validateNonEmptyPosition(Position.Props memory position) internal pure {
        if (position.sizeInUsd == 0 || position.sizeInTokens == 0 || position.collateralAmount == 0) {
            revert(Keys.EMPTY_POSITION_ERROR);
        }
    }

    function validatePosition(
        DataStore dataStore,
        Position.Props memory position,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) internal view {
        if (isPositionLiquidatable(
            dataStore,
            position,
            market,
            prices
        )) {
            revert LiquidatablePosition();
        }
    }

    // price impact is not factored into the liquidation calculation
    // if the user is able to close the position gradually, the impact
    // may not be as much as closing the position in one transaction
    function isPositionLiquidatable(
        DataStore dataStore,
        Position.Props memory position,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) internal view returns (bool) {
        (int256 positionPnlUsd, ) = PositionUtils.getPositionPnlUsd(
            position,
            position.sizeInUsd,
            prices.indexTokenPrice
        );

        uint256 maxLeverage = dataStore.getUint(Keys.MAX_LEVERAGE);
        uint256 collateralTokenPrice = MarketUtils.getCachedTokenPrice(
            position.collateralToken,
            market,
            prices
        );
        uint256 collateralUsd = position.collateralAmount * collateralTokenPrice;

        int256 usdAdjustment = PositionPricingUtils.getPositionPricing(
            PositionPricingUtils.GetPositionPricingParams(
                dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
                prices.longTokenPrice,
                prices.shortTokenPrice,
                -position.sizeInUsd.toInt256(),
                position.isLong
            )
        );

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            dataStore,
            position,
            collateralTokenPrice,
            position.sizeInUsd,
            Keys.FEE_RECEIVER_POSITION_FACTOR
        );

        int256 minCollateralUsd = dataStore.getUint(Keys.MIN_COLLATERAL_USD).toInt256();
        int256 remainingCollateralUsd = collateralUsd.toInt256() + positionPnlUsd + usdAdjustment + fees.totalNetCostAmount;

        // the position is liquidatable if the remaining collateral is less than the required min collateral
        if (remainingCollateralUsd < minCollateralUsd) {
            return true;
        }

        // validate if position.size / (remaining collateral) exceeds max leverage
        if (position.sizeInUsd * Precision.FLOAT_PRECISION / remainingCollateralUsd.toUint256() > maxLeverage) {
            return true;
        }

        return false;
    }

    function revertUnexpectedPositionState() internal pure {
        revert UnexpectedPositionState();
    }
}
