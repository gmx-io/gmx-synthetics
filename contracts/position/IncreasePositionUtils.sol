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

    // @dev IncreasePositionParams struct used in increasePosition to avoid
    // stack too deep errors
    //
    // @param market the values of the trading market
    // @param order the decrease position order
    // @param position the order's position
    // @param positionKey the key of the order's position
    // @param collateral the collateralToken of the position
    // @param collateralDeltaAmount the amount of collateralToken deposited
    struct IncreasePositionParams {
        IncreasePositionParamsContracts contracts;
        Market.Props market;
        Order.Props order;
        Position.Props position;
        bytes32 positionKey;
        address collateralToken;
        uint256 collateralDeltaAmount;
    }

    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param positionStore PositionStore
    // @param oracle Oracle
    // @param feeReceiver FeeReceiver
    // @param referralStorage IReferralStorage
    struct IncreasePositionParamsContracts {
        DataStore dataStore;
        EventEmitter eventEmitter;
        PositionStore positionStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        IReferralStorage referralStorage;
    }

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
        int256 priceImpactUsd;
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
    // @param params IncreasePositionParams
    function increasePosition(IncreasePositionParams memory params) external {
        Position.Props memory position = params.position;
        position.setAccount(params.order.account());
        position.setMarket(params.order.market());
        position.setCollateralToken(params.collateralToken);
        position.setIsLong(params.order.isLong());

        // get the market prices for the given position
        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPricesForPosition(
            params.market,
            params.contracts.oracle
        );

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
            position.isLong()
        );

        // create a new cache for holding intermediate results
        _IncreasePositionCache memory cache;

        // process the collateral for the given position and order
        PositionPricingUtils.PositionFees memory fees;
        (cache.collateralDeltaAmount, fees) = processCollateral(
            params,
            prices,
            position,
            params.collateralDeltaAmount.toInt256()
        );

        // check if there is sufficient collateral for the position
        if (cache.collateralDeltaAmount < 0 && position.collateralAmount() < SafeCast.toUint256(-cache.collateralDeltaAmount)) {
            revert InsufficientCollateralAmount();
        }
        position.setCollateralAmount(Calc.sum(position.collateralAmount(), cache.collateralDeltaAmount));

        cache.priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
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
        cache.priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.contracts.dataStore,
            params.market.marketToken,
            prices.indexTokenPrice,
            cache.priceImpactUsd
        );

        cache.executionPrice = OrderBaseUtils.getExecutionPrice(
            params.contracts.oracle.getCustomPrice(params.market.indexToken),
            params.order.sizeDeltaUsd(),
            cache.priceImpactUsd,
            params.order.acceptablePrice(),
            position.isLong(),
            true
        );

        cache.priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            params.order.sizeDeltaUsd(),
            cache.executionPrice,
            prices.indexTokenPrice.max,
            position.isLong(),
            true
        );

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
        cache.nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(params.contracts.dataStore, params.market.marketToken, position.isLong());

        MarketUtils.updateTotalBorrowing(
            params.contracts.dataStore,
            params.market.marketToken,
            position.isLong(),
            position.borrowingFactor(),
            position.sizeInUsd(),
            cache.nextPositionSizeInUsd,
            cache.nextPositionBorrowingFactor
        );

        position.setSizeInUsd(cache.nextPositionSizeInUsd);
        position.setSizeInTokens(position.sizeInTokens() + cache.sizeDeltaInTokens);
        if (!fees.funding.hasPendingLongTokenFundingFee) {
            position.setLongTokenFundingAmountPerSize(fees.funding.latestLongTokenFundingAmountPerSize);
        }
        if (!fees.funding.hasPendingShortTokenFundingFee) {
            position.setShortTokenFundingAmountPerSize(fees.funding.latestShortTokenFundingAmountPerSize);
        }

        if (fees.funding.longTokenFundingFeeAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.market.longToken,
                position.account(),
                fees.funding.longTokenFundingFeeAmount.toUint256()
            );
        }

        if (fees.funding.shortTokenFundingFeeAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.market.shortToken,
                position.account(),
                fees.funding.shortTokenFundingFeeAmount.toUint256()
            );
        }

        position.setBorrowingFactor(cache.nextPositionBorrowingFactor);
        position.setIncreasedAtBlock(Chain.currentBlockNumber());

        params.contracts.positionStore.set(params.positionKey, params.order.account(), position);

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
            MarketUtils.validateReserve(params.contracts.dataStore, params.market, prices, params.order.isLong());
        }

        PositionUtils.validatePosition(
            params.contracts.dataStore,
            params.contracts.referralStorage,
            position,
            params.market,
            prices
        );

        params.contracts.eventEmitter.emitPositionIncrease(
            params.positionKey,
            position.account(),
            position.market(),
            position.collateralToken(),
            position.isLong(),
            cache.executionPrice,
            params.order.sizeDeltaUsd(),
            cache.sizeDeltaInTokens,
            cache.collateralDeltaAmount
        );

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

    // @dev handle the collateral changes of the position
    // @param params IncreasePositionParams
    // @param prices the prices of the tokens in the market
    // @param position the position to process collateral for
    // @param collateralDeltaAmount the change in the position's collateral
    function processCollateral(
        IncreasePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        Position.Props memory position,
        int256 collateralDeltaAmount
    ) internal returns (int256, PositionPricingUtils.PositionFees memory) {
        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.collateralToken, params.market, prices);

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
            params.collateralToken,
            params.order.isLong(),
            collateralDeltaAmount
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            params.collateralToken,
            fees.feesForPool.toInt256()
        );

        params.contracts.eventEmitter.emitPositionFeesCollected(true, fees);

        return (collateralDeltaAmount, fees);
    }
}
