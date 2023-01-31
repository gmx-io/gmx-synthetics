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
import "../order/OrderEventUtils.sol";

import "./DecreasePositionCollateralUtils.sol";

// @title DecreasePositionUtils
// @dev Library for functions to help with decreasing a position
library DecreasePositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    // @dev DecreasePositionResult struct for the results of decreasePosition
    // @param outputToken the output token
    // @param outputAmount the output amount
    // @param secondaryOutputToken the secondary output token
    // @param secondaryOutputAmount the secondary output amount
    struct DecreasePositionResult {
        address outputToken;
        uint256 outputAmount;
        address secondaryOutputToken;
        uint256 secondaryOutputAmount;
    }

    error InvalidDecreaseOrderSize(uint256 sizeDeltaUsd, uint256 positionSizeInUsd);
    error UnableToWithdrawCollateralDueToLeverage(int256 estimatedRemainingCollateralUsd);
    error InvalidDecreasePositionSwapType(Order.DecreasePositionSwapType decreasePositionSwapType);
    error PositionShouldNotBeLiquidated();

    // @dev decreases a position
    // The decreasePosition function decreases the size of an existing position
    // in a market. It takes a PositionUtils.UpdatePositionParams object as an input, which
    // includes information about the position to be decreased, the market in
    // which the position exists, and the order that is being used to decrease the position.
    //
    // The function first calculates the prices of the tokens in the market, and then
    // checks whether the position is liquidatable based on the current market prices.
    // If the order is a liquidation order and the position is not liquidatable, the function reverts.
    //
    // If there is not enough collateral in the position to complete the decrease,
    // the function reverts. Otherwise, the function updates the position's size and
    // collateral amount, and increments the claimable funding amount for
    // the market if necessary.
    //
    // Finally, the function returns a DecreasePositionResult object containing
    // information about the outcome of the decrease operation, including the amount
    // of collateral removed from the position and any fees that were paid.
    // @param params PositionUtils.UpdatePositionParams
    function decreasePosition(
        PositionUtils.UpdatePositionParams memory params
    ) external returns (DecreasePositionResult memory) {
        PositionUtils.DecreasePositionCache memory cache;

        cache.prices = MarketUtils.getMarketPricesForPosition(
            params.contracts.oracle,
            params.market
        );

        // cap the order size to the position size
        if (params.order.sizeDeltaUsd() > params.position.sizeInUsd()) {
            if (params.order.orderType() == Order.OrderType.LimitDecrease ||
                params.order.orderType() == Order.OrderType.StopLossDecrease) {

                OrderEventUtils.emitOrderSizeDeltaAutoUpdated(
                    params.contracts.eventEmitter,
                    params.orderKey,
                    params.order.sizeDeltaUsd(),
                    params.position.sizeInUsd()
                );

                params.order.setSizeDeltaUsd(params.position.sizeInUsd());
            } else {
                revert InvalidDecreaseOrderSize(params.order.sizeDeltaUsd(), params.position.sizeInUsd());
            }
        }

        if (params.order.sizeDeltaUsd() < params.position.sizeInUsd() && params.order.initialCollateralDeltaAmount() > 0) {
            // estimate pnl based on indexTokenPrice
            (cache.estimatedPositionPnlUsd, /* uint256 sizeDeltaInTokens */) = PositionUtils.getPositionPnlUsd(
                params.contracts.dataStore,
                params.market,
                cache.prices,
                params.position,
                cache.prices.indexTokenPrice.midPrice(),
                params.position.sizeInUsd()
            );

            cache.estimatedRealizedPnlUsd = cache.estimatedPositionPnlUsd * params.order.sizeDeltaUsd().toInt256() / params.position.sizeInUsd().toInt256();
            cache.estimatedRemainingPnlUsd = cache.estimatedPositionPnlUsd - cache.estimatedRealizedPnlUsd;

            PositionUtils.WillPositionCollateralBeSufficientValues memory positionValues = PositionUtils.WillPositionCollateralBeSufficientValues(
                params.position.sizeInUsd() - params.order.sizeDeltaUsd(), // positionSizeInUsd
                params.position.collateralAmount() - params.order.initialCollateralDeltaAmount(), // positionCollateralAmount
                cache.estimatedRemainingPnlUsd, // positionPnlUsd
                cache.estimatedRealizedPnlUsd,  // realizedPnlUsd
                -params.order.sizeDeltaUsd().toInt256() // openInterestDelta
            );

            (bool willBeSufficient, int256 estimatedRemainingCollateralUsd) = PositionUtils.willPositionCollateralBeSufficient(
                params.contracts.dataStore,
                params.market,
                cache.prices,
                params.position.collateralToken(),
                params.position.isLong(),
                positionValues
            );

            if (!willBeSufficient) {
                if (params.order.sizeDeltaUsd() == 0) {
                    revert UnableToWithdrawCollateralDueToLeverage(estimatedRemainingCollateralUsd);
                }

                OrderEventUtils.emitOrderCollateralDeltaAmountAutoUpdated(
                    params.contracts.eventEmitter,
                    params.orderKey,
                    params.order.initialCollateralDeltaAmount(),
                    0
                );

                params.order.setInitialCollateralDeltaAmount(0);
            }

            // if the remaining collateral will be below the min collateral usd value, then close the position
            if (estimatedRemainingCollateralUsd < params.contracts.dataStore.getUint(Keys.MIN_COLLATERAL_USD).toInt256()) {
                params.order.setSizeDeltaUsd(params.position.sizeInUsd());
            }
        }

        // if the position will be closed, set the initial collateral delta amount
        // to zero to help ensure that the order can be executed
        if (params.order.sizeDeltaUsd() == params.position.sizeInUsd() && params.order.initialCollateralDeltaAmount() > 0) {
            params.order.setInitialCollateralDeltaAmount(0);
        }

        cache.pnlToken = params.position.isLong() ? params.market.longToken : params.market.shortToken;
        cache.pnlTokenPrice = params.position.isLong() ? cache.prices.longTokenPrice : cache.prices.shortTokenPrice;

        if (params.order.decreasePositionSwapType() != Order.DecreasePositionSwapType.NoSwap &&
            cache.pnlToken == params.position.collateralToken()) {
            revert InvalidDecreasePositionSwapType(params.order.decreasePositionSwapType());
        }

        if (BaseOrderUtils.isLiquidationOrder(params.order.orderType()) && !PositionUtils.isPositionLiquidatable(
            params.contracts.dataStore,
            params.contracts.referralStorage,
            params.position,
            params.market,
            cache.prices,
            true
        )) {
            revert PositionShouldNotBeLiquidated();
        }

        PositionUtils.updateFundingAndBorrowingState(params, cache.prices);

        cache.initialCollateralAmount = params.position.collateralAmount();
        (
            PositionUtils.DecreasePositionCollateralValues memory values,
            PositionPricingUtils.PositionFees memory fees
        ) = DecreasePositionCollateralUtils.processCollateral(
            params,
            cache
        );

        cache.nextPositionSizeInUsd = params.position.sizeInUsd() - params.order.sizeDeltaUsd();
        cache.nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(params.contracts.dataStore, params.market.marketToken, params.position.isLong());

        PositionUtils.updateTotalBorrowing(
            params,
            cache.nextPositionSizeInUsd,
            cache.nextPositionBorrowingFactor
        );

        params.position.setSizeInUsd(cache.nextPositionSizeInUsd);
        params.position.setSizeInTokens(params.position.sizeInTokens() - values.sizeDeltaInTokens);
        params.position.setCollateralAmount(values.remainingCollateralAmount.toUint256());
        params.position.setDecreasedAtBlock(Chain.currentBlockNumber());

        PositionUtils.incrementClaimableFundingAmount(params, fees);

        if (params.position.sizeInUsd() == 0 || params.position.sizeInTokens() == 0) {
            // withdraw all collateral if the position will be closed
            values.output.outputAmount += params.position.collateralAmount();

            params.position.setSizeInUsd(0);
            params.position.setSizeInTokens(0);
            params.position.setCollateralAmount(0);

            PositionStoreUtils.remove(params.contracts.dataStore, params.positionKey, params.order.account());
        } else {
            if (!fees.funding.hasPendingLongTokenFundingFee) {
                params.position.setLongTokenFundingAmountPerSize(fees.funding.latestLongTokenFundingAmountPerSize);
            }
            if (!fees.funding.hasPendingShortTokenFundingFee) {
                params.position.setShortTokenFundingAmountPerSize(fees.funding.latestShortTokenFundingAmountPerSize);
            }
            params.position.setBorrowingFactor(cache.nextPositionBorrowingFactor);

            PositionUtils.validatePosition(
                params.contracts.dataStore,
                params.contracts.referralStorage,
                params.position,
                params.market,
                cache.prices,
                false
            );

            PositionStoreUtils.set(params.contracts.dataStore, params.positionKey, params.position);
        }

        MarketUtils.applyDeltaToCollateralSum(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.position.market(),
            params.position.collateralToken(),
            params.position.isLong(),
            -(cache.initialCollateralAmount - params.position.collateralAmount()).toInt256()
        );

        PositionUtils.updateOpenInterest(
            params,
            -params.order.sizeDeltaUsd().toInt256(),
            -values.sizeDeltaInTokens.toInt256()
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            values.pnlTokenForPool,
            values.pnlAmountForPool
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            params.position.collateralToken(),
            fees.feeAmountForPool.toInt256()
        );

        PositionUtils.handleReferral(params, fees);

        PositionPricingUtils.emitPositionFeesCollected(
            params.contracts.eventEmitter,
            params.market.marketToken,
            params.position.collateralToken(),
            false,
            fees
        );

        PositionEventUtils.emitPositionDecrease(
            params.contracts.eventEmitter,
            params.positionKey,
            params.position,
            params.order.sizeDeltaUsd(),
            cache.initialCollateralAmount - params.position.collateralAmount(),
            params.order.orderType(),
            values
        );

        values = DecreasePositionCollateralUtils.swapWithdrawnCollateralToPnlToken(params, values);

        return DecreasePositionResult(
            values.output.outputToken,
            values.output.outputAmount,
            values.output.secondaryOutputToken,
            values.output.secondaryOutputAmount
        );
    }
}
