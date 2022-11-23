// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../fee/FeeReceiver.sol";

import "../oracle/Oracle.sol";
import "../pricing/PositionPricingUtils.sol";

import "./Position.sol";
import "./PositionStore.sol";
import "./PositionUtils.sol";
import "../order/OrderBaseUtils.sol";

library DecreasePositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    struct DecreasePositionParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        PositionStore positionStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        IReferralStorage referralStorage;
        Market.Props market;
        Order.Props order;
        Position.Props position;
        bytes32 positionKey;
        uint256 adjustedSizeDeltaUsd;
    }

    struct ProcessCollateralValues {
        uint256 executionPrice;
        int256 remainingCollateralAmount;
        uint256 outputAmount;
        int256 positionPnlUsd;
        int256 pnlAmountForPool;
        uint256 sizeDeltaInTokens;
        int256 priceImpactUsd;
        int256 priceImpactAmount;
    }

    struct _DecreasePositionCache {
        uint256 initialCollateralAmount;
        uint256 nextPositionSizeInUsd;
        uint256 nextPositionBorrowingFactor;
        int256 poolDeltaAmount;
    }

    function decreasePosition(DecreasePositionParams memory params) external returns (uint256, uint256) {
        _DecreasePositionCache memory cache;

        Position.Props memory position = params.position;
        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPricesForPosition(
            params.market,
            params.oracle
        );

        if (OrderBaseUtils.isLiquidationOrder(params.order.orderType()) && !PositionUtils.isPositionLiquidatable(
            params.dataStore,
            params.referralStorage,
            position,
            params.market,
            prices
        )) {
            revert("DecreasePositionUtils: Invalid Liquidation");
        }

        MarketUtils.updateFundingAmountPerSize(
            params.dataStore,
            prices,
            params.market.marketToken,
            params.market.longToken,
            params.market.shortToken
        );

        MarketUtils.updateCumulativeBorrowingFactor(
            params.dataStore,
            params.market.marketToken,
            params.market.longToken,
            params.market.shortToken,
            prices,
            position.isLong
        );

        params.adjustedSizeDeltaUsd = params.order.sizeDeltaUsd();

        if (params.adjustedSizeDeltaUsd > position.sizeInUsd) {
            if (params.order.orderType() == Order.OrderType.LimitDecrease ||
                params.order.orderType() == Order.OrderType.StopLossDecrease) {
                params.adjustedSizeDeltaUsd = position.sizeInUsd;
            } else {
                revert("DecreasePositionUtils: Invalid order size");
            }
        }

        cache.initialCollateralAmount = position.collateralAmount;
        (
            ProcessCollateralValues memory values,
            PositionPricingUtils.PositionFees memory fees
        ) = processCollateral(
            params,
            prices,
            position,
            cache.initialCollateralAmount.toInt256()
        );

        if (values.remainingCollateralAmount < 0) {
            revert("Insufficient collateral");
        }

        cache.nextPositionSizeInUsd = position.sizeInUsd - params.adjustedSizeDeltaUsd;
        cache.nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(params.dataStore, params.market.marketToken, position.isLong);

        MarketUtils.updateTotalBorrowing(
            params.dataStore,
            params.market.marketToken,
            position.isLong,
            position.borrowingFactor,
            position.sizeInUsd,
            cache.nextPositionSizeInUsd,
            cache.nextPositionBorrowingFactor
        );

        position.sizeInUsd = cache.nextPositionSizeInUsd;
        position.sizeInTokens -= values.sizeDeltaInTokens;
        position.collateralAmount = values.remainingCollateralAmount.toUint256();
        position.decreasedAtBlock = Chain.currentBlockNumber();

        if (fees.longTokenFundingFeeAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.dataStore,
                params.eventEmitter,
                params.market.marketToken,
                params.market.longToken,
                position.account,
                fees.longTokenFundingFeeAmount.toUint256()
            );
        }

        if (fees.shortTokenFundingFeeAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.dataStore,
                params.eventEmitter,
                params.market.marketToken,
                params.market.shortToken,
                position.account,
                fees.shortTokenFundingFeeAmount.toUint256()
            );
        }

        if (position.sizeInUsd == 0 || position.sizeInTokens == 0) {
            // withdraw all collateral if the position will be closed
            values.outputAmount += position.collateralAmount;
            position.collateralAmount = 0;

            params.positionStore.remove(params.positionKey, params.order.account());
        } else {
            if (!fees.hasPendingLongTokenFundingFee) {
                position.longTokenFundingAmountPerSize = fees.latestLongTokenFundingAmountPerSize;
            }
            if (!fees.hasPendingShortTokenFundingFee) {
                position.shortTokenFundingAmountPerSize = fees.latestShortTokenFundingAmountPerSize;
            }
            position.borrowingFactor = cache.nextPositionBorrowingFactor;

            PositionUtils.validatePosition(
                params.dataStore,
                params.referralStorage,
                position,
                params.market,
                prices
            );

            params.positionStore.set(params.positionKey, params.order.account(), position);
        }

        MarketUtils.applyDeltaToCollateralSum(
            params.dataStore,
            params.eventEmitter,
            position.market,
            position.collateralToken,
            position.isLong,
            -(cache.initialCollateralAmount - position.collateralAmount).toInt256()
        );

        if (params.adjustedSizeDeltaUsd > 0) {
            MarketUtils.applyDeltaToOpenInterest(
                params.dataStore,
                params.eventEmitter,
                position.market,
                position.collateralToken,
                position.isLong,
                -params.adjustedSizeDeltaUsd.toInt256()
            );
            // since sizeDeltaInTokens is rounded down, when positions are closed for tokens with
            // a small number of decimals, the price of the market tokens may increase
            MarketUtils.applyDeltaToOpenInterestInTokens(
                params.dataStore,
                params.eventEmitter,
                position.market,
                position.collateralToken,
                position.isLong,
                values.sizeDeltaInTokens.toInt256()
            );
        }

        cache.poolDeltaAmount = fees.feesForPool.toInt256() - values.pnlAmountForPool;
        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            params.market.marketToken,
            params.order.initialCollateralToken(),
            cache.poolDeltaAmount
        );

        params.eventEmitter.emitPositionFeesCollected(false, fees);
        emitPositionDecrease(params, values);

        ReferralUtils.incrementAffiliateReward(
            params.dataStore,
            params.eventEmitter,
            fees.affiliate,
            position.account,
            position.collateralToken,
            fees.affiliateRewardAmount
        );

        if (fees.traderDiscountAmount > 0) {
            params.eventEmitter.emitTraderReferralDiscount(position.account, position.collateralToken, fees.traderDiscountAmount);
        }

        return (values.outputAmount, params.adjustedSizeDeltaUsd);
    }

    function emitPositionDecrease(
        DecreasePositionParams memory params,
        ProcessCollateralValues memory values
    ) internal {
        params.eventEmitter.emitPositionDecrease(
            params.positionKey,
            params.order.account(),
            params.order.market(),
            params.order.initialCollateralToken(),
            params.order.isLong(),
            values.executionPrice,
            params.adjustedSizeDeltaUsd,
            params.order.initialCollateralDeltaAmount().toInt256(),
            values.pnlAmountForPool,
            values.positionPnlUsd,
            values.remainingCollateralAmount,
            values.outputAmount
        );
    }

    function processCollateral(
        DecreasePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        Position.Props memory position,
        int256 remainingCollateralAmount
    ) internal returns (
        ProcessCollateralValues memory,
        PositionPricingUtils.PositionFees memory
    ) {
        ProcessCollateralValues memory values;
        values.remainingCollateralAmount = remainingCollateralAmount;

        values.remainingCollateralAmount -= params.order.initialCollateralDeltaAmount().toInt256();
        values.outputAmount = params.order.initialCollateralDeltaAmount();

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, prices);

        values.priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.dataStore,
                params.market.marketToken,
                params.market.longToken,
                params.market.shortToken,
                -params.adjustedSizeDeltaUsd.toInt256(),
                params.order.isLong()
            )
        );

        values.priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.dataStore,
            params.market.marketToken,
            prices.indexTokenPrice,
            values.priceImpactUsd
        );

        values.executionPrice = OrderBaseUtils.getExecutionPrice(
            params.oracle.getCustomPrice(params.market.indexToken),
            params.order.sizeDeltaUsd(),
            values.priceImpactUsd,
            params.order.acceptablePrice(),
            position.isLong,
            false
        );

        values.priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            params.order.sizeDeltaUsd(),
            values.executionPrice,
            prices.indexTokenPrice.max,
            position.isLong,
            false
        );

        // if there is a positive impact, the impact pool amount should be reduced
        // if there is a negative impact, the impact pool amount should be increased
        MarketUtils.applyDeltaToPositionImpactPool(
            params.dataStore,
            params.eventEmitter,
            params.market.marketToken,
            -values.priceImpactAmount
        );

        // the outputAmount does not factor in swap price impact
        // for example, if the market is ETH / USD and if a user uses USDC to long ETH
        // if the position is closed in profit or loss, USDC would be sent out from or added to the pool
        // without a price impact
        // this may unbalance the pool and the user could earn the positive price impact through a subsequent
        // action to rebalance the pool
        // price impact can be factored in if this is not desirable
        (values.positionPnlUsd, values.sizeDeltaInTokens) = PositionUtils.getPositionPnlUsd(
            params.position,
            params.adjustedSizeDeltaUsd,
            values.executionPrice
        );

        values.pnlAmountForPool = -values.positionPnlUsd / collateralTokenPrice.max.toInt256();

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            params.dataStore,
            params.referralStorage,
            position,
            collateralTokenPrice,
            params.market.longToken,
            params.market.shortToken,
            params.adjustedSizeDeltaUsd
        );

        // if pnlAmountForPool is negative it means that the user should that amount
        // should be added to the outputAmount
        if (values.pnlAmountForPool < 0) {
            // add realized pnl to outputAmount
            values.outputAmount += (-values.pnlAmountForPool).toUint256();
        } else {
            // deduct losses from the position's collateral
            values.remainingCollateralAmount -= values.pnlAmountForPool;
        }

        // if there is a positive outputAmount, use the outputAmount to pay for fees and price impact
        if (values.outputAmount > 0) {
            if (values.outputAmount > fees.totalNetCostAmount) {
                values.outputAmount -= fees.totalNetCostAmount;
                fees.totalNetCostAmount = 0;
            } else {
                values.outputAmount = 0;
                fees.totalNetCostAmount = fees.totalNetCostAmount - values.outputAmount;
            }
        }

        // deduct remaining fees from the position's collateral
        values.remainingCollateralAmount -= fees.totalNetCostAmount.toInt256();

        if (OrderBaseUtils.isLiquidationOrder(params.order.orderType()) && remainingCollateralAmount < 0) {
            if (fees.fundingFeeAmount > position.collateralAmount) {
                values.pnlAmountForPool = 0;
                // the case where this is insufficient collateral to pay funding fees
                // should be rare, and the difference should be small
                // in case it happens, the pool should be topped up with the required amount using
                // an insurance fund or similar mechanism
                params.eventEmitter.emitInsufficientFundingFeePayment(
                    fees.fundingFeeAmount,
                    position.collateralAmount
                );
            } else {
                values.pnlAmountForPool = (position.collateralAmount - fees.fundingFeeAmount).toInt256();
            }

            PositionPricingUtils.PositionFees memory _fees;

            ProcessCollateralValues memory _values = ProcessCollateralValues(
                values.executionPrice, // executionPrice
                0, // remainingCollateralAmount
                0, // outputAmount
                values.positionPnlUsd, // positionPnlUsd
                values.pnlAmountForPool, // pnlAmountForPool
                values.sizeDeltaInTokens, // sizeDeltaInTokens
                values.priceImpactUsd, // priceImpactUsd
                values.priceImpactAmount // priceImpactAmount
            );

            return (_values, _fees);
        }

        PricingUtils.transferFees(
            params.feeReceiver,
            params.market.marketToken,
            position.collateralToken,
            fees.feeReceiverAmount,
            FeeUtils.POSITION_FEE
        );

        return (values, fees);
    }
}
