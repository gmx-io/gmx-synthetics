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

// @title IncreasePositionUtils
// @dev Libary for functions to help with increasing a position
library IncreasePositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    // @dev _IncreasePositionCache struct used in increasePosition to
    // avoid stack too deep errors
    // @param collateralDeltaAmount the change in collateral amount
    // @param priceImpactUsd the price impact of the position increase in USD
    // @param executionPrice the execution price
    // @param priceImpactAmount the price impact of the position increase in tokens
    // @param sizeDeltaInTokens the change in position size in tokens
    // @param nextPositionSizeInUsd the new position size in USD
    // @param nextPositionBorrowingFactor the new position borrowing factor
    struct _IncreasePositionCache {
        int256 collateralDeltaAmount;
        uint256 executionPrice;
        int256 priceImpactAmount;
        uint256 sizeDeltaInTokens;
        uint256 nextPositionSizeInUsd;
        uint256 nextPositionBorrowingFactor;
    }

    error InsufficientCollateralAmount();

    // @dev increase a position
    // The increasePosition function is used to increase the size of a position
    // in a market. This involves updating the position's collateral amount,
    // calculating the price impact of the size increase, and updating the position's
    // size and borrowing factor. This function also applies fees to the position
    // and updates the market's liquidity pool based on the new position size.
    // @param params PositionUtils.UpdatePositionParams
    function increasePosition(
        PositionUtils.UpdatePositionParams memory params,
        uint256 collateralIncrementAmount
    ) external {
        Position.Props memory position = params.position;

        // get the market prices for the given position
        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPricesForPosition(
            params.contracts.oracle,
            params.market
        );

        updateFundingAndBorrowingState(params, prices);

        // create a new cache for holding intermediate results
        _IncreasePositionCache memory cache;

        // process the collateral for the given position and order
        PositionPricingUtils.PositionFees memory fees;
        (cache.collateralDeltaAmount, fees) = processCollateral(
            params,
            prices,
            position,
            collateralIncrementAmount.toInt256()
        );

        // check if there is sufficient collateral for the position
        if (
            cache.collateralDeltaAmount < 0 &&
            position.collateralAmount() < SafeCast.toUint256(-cache.collateralDeltaAmount)
        ) {
            revert InsufficientCollateralAmount();
        }
        position.setCollateralAmount(Calc.sumReturnUint256(position.collateralAmount(), cache.collateralDeltaAmount));

        (cache.executionPrice, cache.priceImpactAmount) = getExecutionPrice(params, prices);

        // if there is a positive impact, the impact pool amount should be reduced
        // if there is a negative impact, the impact pool amount should be increased
        MarketUtils.applyDeltaToPositionImpactPool(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            -cache.priceImpactAmount
        );

        if (position.isLong()) {
            // round the number of tokens for long positions down
            cache.sizeDeltaInTokens = params.order.sizeDeltaUsd() / cache.executionPrice;
        } else {
            // round the number of tokens for short positions up
            cache.sizeDeltaInTokens = Calc.roundUpDivision(params.order.sizeDeltaUsd(), cache.executionPrice);
        }

        cache.nextPositionSizeInUsd = position.sizeInUsd() + params.order.sizeDeltaUsd();
        cache.nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(
            params.contracts.dataStore,
            params.market.marketToken,
            position.isLong()
        );

        updateTotalBorrowing(params, position, cache);

        position.setSizeInUsd(cache.nextPositionSizeInUsd);
        position.setSizeInTokens(position.sizeInTokens() + cache.sizeDeltaInTokens);
        if (!fees.funding.hasPendingLongTokenFundingFee) {
            position.setLongTokenFundingAmountPerSize(fees.funding.latestLongTokenFundingAmountPerSize);
        }
        if (!fees.funding.hasPendingShortTokenFundingFee) {
            position.setShortTokenFundingAmountPerSize(fees.funding.latestShortTokenFundingAmountPerSize);
        }

        incrementClaimableFundingAmount(params, fees);

        position.setBorrowingFactor(cache.nextPositionBorrowingFactor);
        position.setIncreasedAtBlock(Chain.currentBlockNumber());

        params.contracts.positionStore.set(params.positionKey, params.order.account(), position);

        updateOpenInterest(params, position, prices, cache);

        PositionUtils.validatePosition(
            params.contracts.dataStore,
            params.contracts.referralStorage,
            position,
            params.market,
            prices
        );

        handleReferral(params, position, fees);

        emitPositionIncrease(params, position, cache);
    }

    // @dev handle the collateral changes of the position
    // @param params PositionUtils.UpdatePositionParams
    // @param prices the prices of the tokens in the market
    // @param position the position to process collateral for
    // @param collateralDeltaAmount the change in the position's collateral
    function processCollateral(
        PositionUtils.UpdatePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        Position.Props memory position,
        int256 collateralDeltaAmount
    ) internal returns (int256, PositionPricingUtils.PositionFees memory) {
        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(
            position.collateralToken(),
            params.market,
            prices
        );

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            params.contracts.dataStore,
            params.contracts.referralStorage,
            position,
            collateralTokenPrice,
            params.market.longToken,
            params.market.shortToken,
            params.order.sizeDeltaUsd()
        );

        PricingUtils.transferFees(
            params.contracts.feeReceiver,
            params.market.marketToken,
            position.collateralToken(),
            fees.feeReceiverAmount,
            FeeUtils.POSITION_FEE
        );

        collateralDeltaAmount -= fees.totalNetCostAmount.toInt256();

        MarketUtils.applyDeltaToCollateralSum(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.order.market(),
            position.collateralToken(),
            params.order.isLong(),
            collateralDeltaAmount
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            position.collateralToken(),
            fees.feesForPool.toInt256()
        );

        params.contracts.eventEmitter.emitPositionFeesCollected(true, fees);

        return (collateralDeltaAmount, fees);
    }

    function updateFundingAndBorrowingState(
        PositionUtils.UpdatePositionParams memory params,
        MarketUtils.MarketPrices memory prices
    ) internal {
        // update the funding amount per size for the market
        MarketUtils.updateFundingAmountPerSize(
            params.contracts.dataStore,
            prices,
            params.market.marketToken,
            params.market.longToken,
            params.market.shortToken
        );

        // update the cumulative borrowing factor for the market
        MarketUtils.updateCumulativeBorrowingFactor(
            params.contracts.dataStore,
            prices,
            params.market.marketToken,
            params.market.longToken,
            params.market.shortToken,
            params.order.isLong()
        );
    }

    function getExecutionPrice(
        PositionUtils.UpdatePositionParams memory params,
        MarketUtils.MarketPrices memory prices
    ) internal view returns (uint256, int256) {
        int256 priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.contracts.dataStore,
                params.market.marketToken,
                params.market.longToken,
                params.market.shortToken,
                params.order.sizeDeltaUsd().toInt256(),
                params.order.isLong()
            )
        );

        // cap price impact usd based on the amount available in the position impact pool
        priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.contracts.dataStore,
            params.market.marketToken,
            prices.indexTokenPrice,
            priceImpactUsd
        );

        uint256 executionPrice = OrderBaseUtils.getExecutionPrice(
            params.contracts.oracle.getCustomPrice(params.market.indexToken),
            params.order.sizeDeltaUsd(),
            priceImpactUsd,
            params.order.acceptablePrice(),
            params.order.isLong(),
            true
        );

        int256 priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            params.order.sizeDeltaUsd(),
            executionPrice,
            prices.indexTokenPrice.max,
            params.order.isLong(),
            true
        );

        return (executionPrice, priceImpactAmount);
    }

    function updateTotalBorrowing(
        PositionUtils.UpdatePositionParams memory params,
        Position.Props memory position,
        _IncreasePositionCache memory cache
    ) internal {
        MarketUtils.updateTotalBorrowing(
            params.contracts.dataStore,
            params.market.marketToken,
            position.isLong(),
            position.borrowingFactor(),
            position.sizeInUsd(),
            cache.nextPositionSizeInUsd,
            cache.nextPositionBorrowingFactor
        );
    }

    function incrementClaimableFundingAmount(
        PositionUtils.UpdatePositionParams memory params,
        PositionPricingUtils.PositionFees memory fees
    ) internal {
        // if the position has negative funding fees, distribute it to allow it to be claimable
        if (fees.funding.claimableLongTokenAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.market.longToken,
                params.order.receiver(),
                fees.funding.claimableLongTokenAmount
            );
        }

        if (fees.funding.claimableShortTokenAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.market.shortToken,
                params.order.receiver(),
                fees.funding.claimableShortTokenAmount
            );
        }
    }

    function updateOpenInterest(
        PositionUtils.UpdatePositionParams memory params,
        Position.Props memory position,
        MarketUtils.MarketPrices memory prices,
        _IncreasePositionCache memory cache
    ) internal {
        if (params.order.sizeDeltaUsd() > 0) {
            MarketUtils.applyDeltaToOpenInterest(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                position.market(),
                position.collateralToken(),
                position.isLong(),
                params.order.sizeDeltaUsd().toInt256()
            );

            MarketUtils.applyDeltaToOpenInterestInTokens(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                position.market(),
                position.collateralToken(),
                position.isLong(),
                cache.sizeDeltaInTokens.toInt256()
            );

            MarketUtils.validateReserve(
                params.contracts.dataStore,
                params.market,
                prices,
                params.order.isLong()
            );
        }
    }

    function handleReferral(
        PositionUtils.UpdatePositionParams memory params,
        Position.Props memory position,
        PositionPricingUtils.PositionFees memory fees
    ) internal {
        ReferralUtils.incrementAffiliateReward(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            position.market(),
            position.collateralToken(),
            fees.referral.affiliate,
            position.account(),
            fees.referral.affiliateRewardAmount
        );

        if (fees.referral.traderDiscountAmount > 0) {
            params.contracts.eventEmitter.emitTraderReferralDiscountApplied(
                position.market(),
                position.collateralToken(),
                position.account(),
                fees.referral.traderDiscountAmount
            );
        }
    }

    function emitPositionIncrease(
        PositionUtils.UpdatePositionParams memory params,
        Position.Props memory position,
        _IncreasePositionCache memory cache
    ) internal {
        params.contracts.eventEmitter.emitPositionIncrease(
            params.positionKey,
            position.account(),
            position.market(),
            position.collateralToken(),
            position.isLong(),
            cache.executionPrice,
            params.order.sizeDeltaUsd(),
            cache.sizeDeltaInTokens,
            cache.collateralDeltaAmount,
            position.collateralAmount().toInt256(),
            params.order.orderType()
        );
    }
}
