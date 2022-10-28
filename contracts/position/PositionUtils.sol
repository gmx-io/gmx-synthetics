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
    using Price for Price.Props;

    error LiquidatablePosition();
    error UnexpectedPositionState();

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

        if (position.sizeInUsd == sizeDeltaUsd) {
            sizeDeltaInTokens = position.sizeInTokens;
        } else {
            if (position.isLong) {
                sizeDeltaInTokens = Calc.roundUpDivision(position.sizeInTokens * sizeDeltaUsd, position.sizeInUsd);
            } else {
                sizeDeltaInTokens = position.sizeInTokens * sizeDeltaUsd / position.sizeInUsd;
            }
        }

        int256 positionPnlUsd = totalPositionPnl * sizeDeltaInTokens.toInt256() / position.sizeInTokens.toInt256();

        return (positionPnlUsd, sizeDeltaInTokens);
    }

    function getSizeDeltaInTokens(uint256 sizeInUsd, uint256 sizeInTokens, uint256 sizeDeltaUsd) internal pure returns (uint256) {
        return sizeInTokens * sizeDeltaUsd / sizeInUsd;
    }

    function getPositionKey(address account, address market, address collateralToken, bool isLong) internal pure returns (bytes32) {
        bytes32 key = keccak256(abi.encode(account, market, collateralToken, isLong));
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
        (int256 positionPnlUsd, ) = getPositionPnlUsd(
            position,
            position.sizeInUsd,
            prices.indexTokenPrice.pickPriceForPnl(position.isLong, false)
        );

        uint256 maxLeverage = dataStore.getUint(Keys.MAX_LEVERAGE);
        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(
            position.collateralToken,
            market,
            prices
        );
        uint256 collateralUsd = position.collateralAmount * collateralTokenPrice.min;

        int256 priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
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
        int256 remainingCollateralUsd = collateralUsd.toInt256() + positionPnlUsd + priceImpactUsd + fees.totalNetCostAmount;

        // the position is liquidatable if the remaining collateral is less than the required min collateral
        if (remainingCollateralUsd < minCollateralUsd || remainingCollateralUsd == 0) {
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
