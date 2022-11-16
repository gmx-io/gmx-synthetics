// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";

import "../data/DataStore.sol";
import "../events/EventEmitter.sol";
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
        Market.Props market;
        Order.Props order;
        Position.Props position;
        bytes32 positionKey;
        uint256 adjustedSizeDeltaUsd;
    }

    struct ProcessCollateralValues {
        uint256 executionPrice;
        int256 remainingCollateralAmount;
        int256 outputAmount;
        int256 positionPnlUsd;
        int256 positionPnlAmount;
        uint256 sizeDeltaInTokens;
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
            PositionPricingUtils.PositionFees memory fees,
            ProcessCollateralValues memory values
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
            values.outputAmount += position.collateralAmount.toInt256();
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

        cache.poolDeltaAmount = fees.feesForPool.toInt256() - values.positionPnlAmount;
        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            params.market.marketToken,
            params.order.initialCollateralToken(),
            cache.poolDeltaAmount
        );

        require(values.outputAmount >= 0, "DecreasePositionUtils: invalid outputAmount");

        params.eventEmitter.emitPositionFeesCollected(false, fees);
        emitPositionDecrease(params, values);

        return (values.outputAmount.toUint256(), params.adjustedSizeDeltaUsd);
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
            values.positionPnlAmount,
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

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, prices);

        int256 priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.dataStore,
                params.market.marketToken,
                params.market.longToken,
                params.market.shortToken,
                -params.adjustedSizeDeltaUsd.toInt256(),
                params.order.isLong()
            )
        );

        priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.dataStore,
            params.market.marketToken,
            prices.indexTokenPrice,
            priceImpactUsd
        );

        values.executionPrice = OrderBaseUtils.getExecutionPrice(
            params.oracle.getCustomPrice(params.market.indexToken),
            params.order.sizeDeltaUsd(),
            priceImpactUsd,
            params.order.acceptablePrice(),
            position.isLong,
            false
        );

        int256 priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
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
            -priceImpactAmount
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

        values.positionPnlAmount = values.positionPnlUsd / collateralTokenPrice.max.toInt256();

        if (OrderBaseUtils.isLiquidationOrder(params.order.orderType()) && remainingCollateralAmount + values.positionPnlAmount < 0) {
            PositionPricingUtils.PositionFees memory emptyFees;
            ProcessCollateralValues memory emptyValues = ProcessCollateralValues(
                values.executionPrice, // executionPrice
                0, // remainingCollateralAmount
                0, // outputAmount
                values.positionPnlUsd, // positionPnlUsd
                -position.collateralAmount.toInt256(), // positionPnlAmount
                values.sizeDeltaInTokens
            );
            return (emptyFees, emptyValues);
        }

        if (values.positionPnlAmount > 0) {
            // add realized pnl to outputAmount
            values.outputAmount += values.positionPnlAmount;
        } else {
            // deduct losses from the position's collateral
            remainingCollateralAmount += values.positionPnlAmount;
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
        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, prices);

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            params.dataStore,
            position,
            collateralTokenPrice,
            params.market.longToken,
            params.market.shortToken,
            params.adjustedSizeDeltaUsd
        );

        if (OrderBaseUtils.isLiquidationOrder(params.order.orderType())) {
            // return empty fees and do not apply price impact since there is
            // insufficient collateral
            if (remainingCollateralAmount + fees.totalNetCostAmount < 0) {
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

        return fees;
    }
}
