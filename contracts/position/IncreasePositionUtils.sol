// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "../oracle/Oracle.sol";
import "../pricing/PositionPricingUtils.sol";

import "./Position.sol";
import "./PositionStoreUtils.sol";
import "./PositionUtils.sol";
import "./PositionEventUtils.sol";
import "../order/BaseOrderUtils.sol";

// @title IncreasePositionUtils
// @dev Library for functions to help with increasing a position
library IncreasePositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    // @dev IncreasePositionCache struct used in increasePosition to
    // avoid stack too deep errors
    // @param collateralDeltaAmount the change in collateral amount
    // @param executionPrice the execution price
    // @param priceImpactAmount the price impact of the position increase in tokens
    // @param sizeDeltaInTokens the change in position size in tokens
    // @param nextPositionSizeInUsd the new position size in USD
    // @param nextPositionBorrowingFactor the new position borrowing factor
    struct IncreasePositionCache {
        int256 collateralDeltaAmount;
        uint256 executionPrice;
        int256 priceImpactAmount;
        uint256 sizeDeltaInTokens;
        uint256 nextPositionSizeInUsd;
        uint256 nextPositionBorrowingFactor;
    }

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
        // get the market prices for the given position
        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(
            params.contracts.oracle,
            params.market
        );

        PositionUtils.updateFundingAndBorrowingState(params, prices);

        // create a new cache for holding intermediate results
        IncreasePositionCache memory cache;

        if (params.position.sizeInUsd() == 0) {
            params.position.setLongTokenFundingAmountPerSize(
                MarketUtils.getFundingAmountPerSize(params.contracts.dataStore, params.market.marketToken, params.market.longToken, params.position.isLong())
            );
            params.position.setShortTokenFundingAmountPerSize(
                MarketUtils.getFundingAmountPerSize(params.contracts.dataStore, params.market.marketToken, params.market.shortToken, params.position.isLong())
            );
        }

        // process the collateral for the given position and order
        PositionPricingUtils.PositionFees memory fees;
        (cache.collateralDeltaAmount, fees) = processCollateral(
            params,
            prices,
            collateralIncrementAmount.toInt256()
        );

        // check if there is sufficient collateral for the position
        if (
            cache.collateralDeltaAmount < 0 &&
            params.position.collateralAmount() < SafeCast.toUint256(-cache.collateralDeltaAmount)
        ) {
            revert Errors.InsufficientCollateralAmount(params.position.collateralAmount(), cache.collateralDeltaAmount);
        }
        params.position.setCollateralAmount(Calc.sumReturnUint256(params.position.collateralAmount(), cache.collateralDeltaAmount));

        (cache.executionPrice, cache.priceImpactAmount) = getExecutionPrice(params, prices);

        // if there is a positive impact, the impact pool amount should be reduced
        // if there is a negative impact, the impact pool amount should be increased
        MarketUtils.applyDeltaToPositionImpactPool(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            -cache.priceImpactAmount
        );

        if (params.position.isLong()) {
            // round the number of tokens for long positions down
            cache.sizeDeltaInTokens = params.order.sizeDeltaUsd() / cache.executionPrice;
        } else {
            // round the number of tokens for short positions up
            cache.sizeDeltaInTokens = Calc.roundUpDivision(params.order.sizeDeltaUsd(), cache.executionPrice);
        }

        cache.nextPositionSizeInUsd = params.position.sizeInUsd() + params.order.sizeDeltaUsd();
        cache.nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(
            params.contracts.dataStore,
            params.market.marketToken,
            params.position.isLong()
        );

        PositionUtils.updateTotalBorrowing(
            params,
            cache.nextPositionSizeInUsd,
            cache.nextPositionBorrowingFactor
        );

        params.position.setSizeInUsd(cache.nextPositionSizeInUsd);
        params.position.setSizeInTokens(params.position.sizeInTokens() + cache.sizeDeltaInTokens);
        params.position.setLongTokenFundingAmountPerSize(fees.funding.latestLongTokenFundingAmountPerSize);
        params.position.setShortTokenFundingAmountPerSize(fees.funding.latestShortTokenFundingAmountPerSize);

        PositionUtils.incrementClaimableFundingAmount(params, fees);

        params.position.setBorrowingFactor(cache.nextPositionBorrowingFactor);
        params.position.setIncreasedAtBlock(Chain.currentBlockNumber());

        PositionStoreUtils.set(params.contracts.dataStore, params.positionKey, params.position);

        PositionUtils.updateOpenInterest(
            params,
            params.order.sizeDeltaUsd().toInt256(),
            cache.sizeDeltaInTokens.toInt256()
        );

        MarketUtils.validateReserve(
            params.contracts.dataStore,
            params.market,
            prices,
            params.order.isLong()
        );

        if (params.order.sizeDeltaUsd() > 0) {
            PositionUtils.WillPositionCollateralBeSufficientValues memory positionValues = PositionUtils.WillPositionCollateralBeSufficientValues(
                params.position.sizeInUsd(), // positionSizeInUsd
                params.position.collateralAmount(), // positionCollateralAmount
                0,  // realizedPnlUsd
                0 // openInterestDelta
            );

            (bool willBeSufficient, int256 remainingCollateralUsd) = PositionUtils.willPositionCollateralBeSufficient(
                params.contracts.dataStore,
                params.market,
                prices,
                params.position.collateralToken(),
                params.position.isLong(),
                positionValues
            );

            if (!willBeSufficient) {
                revert Errors.InsufficientCollateralUsd(remainingCollateralUsd);
            }
        }

        PositionUtils.handleReferral(params, fees);

        // validatePosition should be called after open interest and all other market variables
        // have been updated
        PositionUtils.validatePosition(
            params.contracts.dataStore,
            params.contracts.referralStorage,
            params.position,
            params.market,
            prices,
            true, // shouldValidateMinPositionSize
            true // shouldValidateMinCollateralUsd
        );

        PositionEventUtils.emitPositionFeesCollected(
            params.contracts.eventEmitter,
            params.orderKey,
            params.market.marketToken,
            params.position.collateralToken(),
            params.order.sizeDeltaUsd(),
            true,
            fees
        );

        PositionEventUtils.PositionIncreaseParams memory eventParams;
        eventParams.eventEmitter = params.contracts.eventEmitter;
        eventParams.orderKey = params.orderKey;
        eventParams.positionKey = params.positionKey;
        eventParams.position = params.position;
        eventParams.executionPrice = cache.executionPrice;
        eventParams.sizeDeltaUsd = params.order.sizeDeltaUsd();
        eventParams.sizeDeltaInTokens = cache.sizeDeltaInTokens;
        eventParams.collateralDeltaAmount = cache.collateralDeltaAmount;
        eventParams.priceImpactAmount = cache.priceImpactAmount;
        eventParams.orderType = params.order.orderType();

        PositionEventUtils.emitPositionIncrease(eventParams);
    }

    // @dev handle the collateral changes of the position
    // @param params PositionUtils.UpdatePositionParams
    // @param prices the prices of the tokens in the market
    // @param position the position to process collateral for
    // @param collateralDeltaAmount the change in the position's collateral
    function processCollateral(
        PositionUtils.UpdatePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        int256 collateralDeltaAmount
    ) internal returns (int256, PositionPricingUtils.PositionFees memory) {
        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(
            params.position.collateralToken(),
            params.market,
            prices
        );

        PositionPricingUtils.GetPositionFeesParams memory getPositionFeesParams = PositionPricingUtils.GetPositionFeesParams(
            params.contracts.dataStore,
            params.contracts.referralStorage,
            params.position,
            collateralTokenPrice,
            params.market.longToken,
            params.market.shortToken,
            params.order.sizeDeltaUsd(),
            params.order.uiFeeReceiver()
        );

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(getPositionFeesParams);

        FeeUtils.incrementClaimableFeeAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            params.position.collateralToken(),
            fees.feeReceiverAmount,
            Keys.POSITION_FEE_TYPE
        );

        FeeUtils.incrementClaimableUiFeeAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.order.uiFeeReceiver(),
            params.market.marketToken,
            params.position.collateralToken(),
            fees.ui.uiFeeAmount,
            Keys.UI_POSITION_FEE_TYPE
        );

        collateralDeltaAmount -= fees.collateralCostAmount.toInt256();

        MarketUtils.applyDeltaToCollateralSum(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.order.market(),
            params.position.collateralToken(),
            params.order.isLong(),
            collateralDeltaAmount
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            params.position.collateralToken(),
            fees.feeAmountForPool.toInt256()
        );

        return (collateralDeltaAmount, fees);
    }

    function getExecutionPrice(
        PositionUtils.UpdatePositionParams memory params,
        MarketUtils.MarketPrices memory prices
    ) internal view returns (uint256, int256) {
        int256 priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.contracts.dataStore,
                params.market,
                params.order.sizeDeltaUsd().toInt256(),
                params.order.isLong()
            )
        );

        // cap price impact usd based on the amount available in the position impact pool
        priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.contracts.dataStore,
            params.market.marketToken,
            prices.indexTokenPrice,
            priceImpactUsd,
            params.order.sizeDeltaUsd()
        );

        uint256 executionPrice = BaseOrderUtils.getExecutionPrice(
            params.contracts.oracle.getPrimaryPrice(params.market.indexToken),
            params.order.sizeDeltaUsd(),
            priceImpactUsd,
            params.order.acceptablePrice(),
            params.order.isLong(),
            true
        );

        int256 priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            priceImpactUsd,
            prices.indexTokenPrice,
            params.order.isLong(),
            true // isIncrease
        );

        return (executionPrice, priceImpactAmount);
    }
}
