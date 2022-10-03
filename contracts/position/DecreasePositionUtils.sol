// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";

import "../data/DataStore.sol";
import "../fee/FeeReceiver.sol";

import "../oracle/Oracle.sol";
import "../pricing/PositionPricingUtils.sol";

import "./Position.sol";
import "./PositionStore.sol";
import "./PositionUtils.sol";

library DecreasePositionUtils {
    using Position for Position.Props;
    using Order for Order.Props;
    using SafeCast for uint256;
    using SafeCast for int256;

    struct DecreasePositionParams {
        DataStore dataStore;
        PositionStore positionStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        Market.Props market;
        Order.Props order;
        Position.Props position;
        bytes32 positionKey;
        uint256 adjustedSizeDeltaUsd;
        bool forLiquidation;
    }

    struct ProcessCollateralValues {
        int256 remainingCollateralAmount;
        int256 outputAmount;
        int256 realizedPnlAmount;
        uint256 sizeDeltaInTokens;
    }

    function decreasePosition(DecreasePositionParams memory params) external returns (uint256, uint256) {
        Position.Props memory position = params.position;
        MarketUtils.MarketPrices memory prices = MarketUtils.getPricesForPosition(
            params.market,
            params.oracle
        );

        MarketUtils.updateCumulativeFundingFactors(params.dataStore, params.market.marketToken);
        MarketUtils.updateCumulativeBorrowingFactor(
            params.dataStore,
            params.market,
            prices,
            position.isLong
        );

        if (params.adjustedSizeDeltaUsd > position.sizeInUsd) {
            params.adjustedSizeDeltaUsd = position.sizeInUsd;
        }

        uint256 initialCollateralAmount = position.collateralAmount;
        (
            PositionPricingUtils.PositionFees memory fees,
            ProcessCollateralValues memory values
        ) = processCollateral(
            params,
            prices,
            position,
            initialCollateralAmount.toInt256()
        );

        if (values.remainingCollateralAmount < 0) {
            revert("Insufficient collateral");
        }

        uint256 nextPositionSizeInUsd = position.sizeInUsd - params.adjustedSizeDeltaUsd;
        uint256 nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(params.dataStore, params.market.marketToken, position.isLong);

        MarketUtils.updateTotalBorrowing(
            params.dataStore,
            params.market.marketToken,
            position.isLong,
            position.borrowingFactor,
            position.sizeInUsd,
            nextPositionSizeInUsd,
            nextPositionBorrowingFactor
        );

        position.sizeInUsd = nextPositionSizeInUsd;
        position.sizeInTokens -= values.sizeDeltaInTokens;
        position.collateralAmount = values.remainingCollateralAmount.toUint256();

        if (position.sizeInUsd == 0 || position.sizeInTokens == 0) {
            // withdraw all collateral if the position will be closed
            values.outputAmount += position.collateralAmount.toInt256();
            position.collateralAmount = 0;

            params.positionStore.remove(params.positionKey, params.order.account());
        } else {
            position.fundingFactor = MarketUtils.getCumulativeFundingFactor(params.dataStore, params.market.marketToken, position.isLong);
            position.borrowingFactor = nextPositionBorrowingFactor;

            PositionUtils.validatePosition(
                params.dataStore,
                position,
                params.market,
                prices
            );

            params.positionStore.set(params.positionKey, params.order.account(), position);
        }

        MarketUtils.decreaseCollateralSum(
            params.dataStore,
            params.order.market(),
            params.order.initialCollateralToken(),
            params.order.isLong(),
            initialCollateralAmount - position.collateralAmount
        );

        if (params.adjustedSizeDeltaUsd > 0) {
            MarketUtils.decreaseOpenInterest(params.dataStore, params.order.market(), params.order.isLong(), params.adjustedSizeDeltaUsd);
            // since sizeDeltaInTokens is rounded down, when positions are closed for tokens with
            // a small number of decimals, the price of the market tokens may increase
            MarketUtils.updateOpenInterestInTokens(
                params.dataStore,
                params.order.market(),
                params.order.isLong(),
                values.sizeDeltaInTokens.toInt256()
            );
        }

        int256 poolDeltaAmount = fees.feesForPool.toInt256() - values.realizedPnlAmount;
        if (poolDeltaAmount > 0) {
            MarketUtils.increasePoolAmount(params.dataStore, params.market.marketToken, params.order.initialCollateralToken(), poolDeltaAmount.toUint256());
        } else {
            MarketUtils.decreasePoolAmount(params.dataStore, params.market.marketToken, params.order.initialCollateralToken(), (-poolDeltaAmount).toUint256());
        }

        require(values.outputAmount >= 0, "DecreasePositionUtils: invalid outputAmount");

        return (values.outputAmount.toUint256(), params.adjustedSizeDeltaUsd);
    }

    function processCollateral(
        DecreasePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        Position.Props memory position,
        int256 remainingCollateralAmount
    ) internal returns (
        PositionPricingUtils.PositionFees memory,
        ProcessCollateralValues memory
    ) {
        ProcessCollateralValues memory values;

        int256 collateralDeltaAmount = params.order.initialCollateralDeltaAmount().toInt256();
        if (collateralDeltaAmount > position.collateralAmount.toInt256()) {
            collateralDeltaAmount = position.collateralAmount.toInt256();
        }

        remainingCollateralAmount -= collateralDeltaAmount;
        values.outputAmount = collateralDeltaAmount;

        uint256 collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, prices);
        // the outputAmount does not factor in price impact
        // for example, if the market is ETH / USD and if a user uses USDC to long ETH
        // if the position is closed in profit or loss, USDC would be sent out from or added to the pool
        // without a price impact
        // this may unbalance the pool and the user could earn the positive price impact through a subsequent
        // action to rebalance the pool
        // price impact can be factored in if this is not desirable
        (values.realizedPnlAmount, values.sizeDeltaInTokens) = PositionUtils.getPositionPnlAmount(
            params.position,
            params.adjustedSizeDeltaUsd,
            prices.indexTokenPrice,
            collateralTokenPrice
        );

        if (params.forLiquidation && remainingCollateralAmount + values.realizedPnlAmount < 0) {
            PositionPricingUtils.PositionFees memory emptyFees;
            ProcessCollateralValues memory emptyValues = ProcessCollateralValues(
                0, // remainingCollateralAmount
                0, // outputAmount
                -position.collateralAmount.toInt256(), // realizedPnlAmount
                values.sizeDeltaInTokens
            );
            return (emptyFees, emptyValues);
        }

        if (values.realizedPnlAmount > 0) {
            // add realized pnl to outputAmount
            values.outputAmount += values.realizedPnlAmount;
        } else {
            // deduct losses from the position's collateral
            remainingCollateralAmount += values.realizedPnlAmount;
        }

        PositionPricingUtils.PositionFees memory fees = processPositionCosts(params, prices, position, remainingCollateralAmount);

        // if there is a positive outputAmount, use the outputAmount to pay for fees and price impact
        if (values.outputAmount > 0 && fees.totalNetCostAmount < 0) {
            int256 offsetAmount = -fees.totalNetCostAmount;
            if (offsetAmount > values.outputAmount) {
                offsetAmount = values.outputAmount;
            }

            values.outputAmount -= offsetAmount;
            fees.totalNetCostAmount += offsetAmount;
        }

        // if a position is liquidated late, there may be insufficient
        // collateral to pay for the totalNetCostAmount
        if (fees.totalNetCostAmount > 0) {
            // add positive impact to the outputAmount
            values.outputAmount += fees.totalNetCostAmount;
        } else {
            // deduct fees and price impact from the position's collateral
            remainingCollateralAmount += fees.totalNetCostAmount;
        }

        values.remainingCollateralAmount = remainingCollateralAmount;

        return (fees, values);
    }

    function processPositionCosts(
        DecreasePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        Position.Props memory position,
        int256 remainingCollateralAmount
    ) internal returns (PositionPricingUtils.PositionFees memory) {
        uint256 collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, prices);

        int256 usdAdjustment = PositionPricingUtils.getPositionPricing(
            PositionPricingUtils.GetPositionPricingParams(
                params.dataStore,
                params.market.marketToken,
                params.market.longToken,
                params.market.shortToken,
                prices.longTokenPrice,
                prices.shortTokenPrice,
                -params.adjustedSizeDeltaUsd.toInt256(),
                params.order.isLong()
            )
        );

        if (usdAdjustment < params.order.acceptableUsdAdjustment()) {
            revert(Keys.UNACCEPTABLE_USD_ADJUSTMENT_ERROR);
        }

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            params.dataStore,
            position,
            collateralTokenPrice,
            params.adjustedSizeDeltaUsd,
            Keys.FEE_RECEIVER_POSITION_FACTOR
        );

        if (params.forLiquidation) {
            int256 adjustmentAmount = usdAdjustment / collateralTokenPrice.toInt256();
            int256 totalNetCostAmount = fees.totalNetCostAmount + adjustmentAmount;

            // return empty fees and do not apply price impact since there is
            // insufficient collateral
            if (remainingCollateralAmount + totalNetCostAmount < 0) {
                PositionPricingUtils.PositionFees memory emptyFees;
                return emptyFees;
            }
        }

        PricingUtils.transferFees(
            params.feeReceiver,
            params.market.marketToken,
            position.collateralToken,
            fees.feeReceiverAmount,
            FeeUtils.POSITION_FEE
        );

        if (usdAdjustment > 0) {
            // when there is a positive price impact factor, additional tokens from the swap impact pool
            // are withdrawn for the user
            // for example, if 50,000 USDC is withdrawn and there is a positive price impact
            // an additional 100 USDC may be sent to the user
            // the swap impact pool is decreased by the used amount
            uint256 positiveImpactAmount = MarketUtils.applyPositiveImpact(
                params.dataStore,
                params.market.marketToken,
                params.order.initialCollateralToken(),
                collateralTokenPrice,
                usdAdjustment
            );

            fees.totalNetCostAmount += positiveImpactAmount.toInt256();
        } else {
            // when there is a negative price impact factor,
            // either the output amount of collateral amount will be reduced
            // for example, if the position has 10 ETH as collateral and there is a negative price impact
            // only 9.995 ETH may be remaining for collateral
            // the difference of 0.005 ETH will be stored in the swap impact pool
            uint256 negativeImpactAmount = MarketUtils.applyNegativeImpact(
                params.dataStore,
                params.market.marketToken,
                params.order.initialCollateralToken(),
                collateralTokenPrice,
                usdAdjustment
            );

            fees.totalNetCostAmount -= negativeImpactAmount.toInt256();
        }

        return fees;
    }
}
