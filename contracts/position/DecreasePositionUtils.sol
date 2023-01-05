// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../fee/FeeReceiver.sol";

import "../oracle/Oracle.sol";
import "../pricing/PositionPricingUtils.sol";

import "./Position.sol";
import "./PositionStoreUtils.sol";
import "./PositionUtils.sol";
import "../order/BaseOrderUtils.sol";

import "./DecreasePositionCollateralUtils.sol";

// @title DecreasePositionUtils
// @dev Libary for functions to help with decreasing a position
library DecreasePositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    // @dev DecreasePositionResult struct for the results of decreasePosition
    // @param adjustedSizeDeltaUsd the adjusted sizeDeltaUsd
    // @param outputToken the output token
    // @param outputAmount the output amount
    // @param pnlToken the token that the pnl for the user is in, for long positions
    // this is the market.longToken, for short positions this is the market.shortToken
    // @param pnlAmountForUser the pnl for the user in token amount
    struct DecreasePositionResult {
        uint256 adjustedSizeDeltaUsd;
        address outputToken;
        uint256 outputAmount;
        address pnlToken;
        uint256 pnlAmountForUser;
    }

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
        DecreasePositionCollateralUtils.DecreasePositionCache memory cache;

        cache.prices = MarketUtils.getMarketPricesForPosition(
            params.contracts.oracle,
            params.market
        );

        cache.pnlToken = params.position.isLong() ? params.market.longToken : params.market.shortToken;
        cache.pnlTokenPrice = params.position.isLong() ? cache.prices.longTokenPrice : cache.prices.shortTokenPrice;

        if (BaseOrderUtils.isLiquidationOrder(params.order.orderType()) && !PositionUtils.isPositionLiquidatable(
            params.contracts.dataStore,
            params.contracts.referralStorage,
            params.position,
            params.market,
            cache.prices
        )) {
            revert("DecreasePositionUtils: Invalid Liquidation");
        }

        PositionUtils.updateFundingAndBorrowingState(params, cache.prices);

        cache.adjustedSizeDeltaUsd = params.order.sizeDeltaUsd();

        if (cache.adjustedSizeDeltaUsd > params.position.sizeInUsd()) {
            if (params.order.orderType() == Order.OrderType.LimitDecrease ||
                params.order.orderType() == Order.OrderType.StopLossDecrease) {
                cache.adjustedSizeDeltaUsd = params.position.sizeInUsd();
            } else {
                revert("DecreasePositionUtils: Invalid order size");
            }
        }

        cache.initialCollateralAmount = params.position.collateralAmount();
        (
            DecreasePositionCollateralUtils.ProcessCollateralValues memory values,
            PositionPricingUtils.PositionFees memory fees
        ) = DecreasePositionCollateralUtils.processCollateral(
            params,
            cache
        );

        cache.nextPositionSizeInUsd = params.position.sizeInUsd() - cache.adjustedSizeDeltaUsd;
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
            values.outputAmount += params.position.collateralAmount();
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
                cache.prices
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
            -cache.adjustedSizeDeltaUsd.toInt256(),
            values.sizeDeltaInTokens.toInt256()
        );

        cache.poolDeltaAmount = fees.feesForPool.toInt256() + values.pnlAmountForPool;
        MarketUtils.applyDeltaToPoolAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            params.order.initialCollateralToken(),
            cache.poolDeltaAmount
        );

        PositionUtils.handleReferral(params, fees);

        params.contracts.eventEmitter.emitPositionFeesCollected(false, fees);
        emitPositionDecrease(params, values, cache);

        cache.outputToken = params.position.collateralToken();

        values = DecreasePositionCollateralUtils.swapWithdrawnCollateralToPnlToken(params, values, cache.pnlToken);

        // if outputAmount is zero, transfer the values from pnlAmountForUser to outputAmount
        if (values.outputAmount == 0 && values.pnlAmountForUser > 0) {
            cache.outputToken = cache.pnlToken;
            values.outputAmount = values.pnlAmountForUser;
            values.pnlAmountForUser = 0;
        }

        return DecreasePositionResult(
            cache.adjustedSizeDeltaUsd,
            cache.outputToken,
            values.outputAmount,
            cache.pnlToken,
            values.pnlAmountForUser
        );
    }

    // @dev emit details of a position decrease
    // @param params PositionUtils.UpdatePositionParams
    // @param values ProcessCollateralValues
    function emitPositionDecrease(
        PositionUtils.UpdatePositionParams memory params,
        DecreasePositionCollateralUtils.ProcessCollateralValues memory values,
        DecreasePositionCollateralUtils.DecreasePositionCache memory cache
    ) internal {
        EventUtils.EmitPositionDecreaseParams memory eventParams = EventUtils.EmitPositionDecreaseParams(
            params.positionKey,
            params.position.account(),
            params.position.market(),
            params.position.collateralToken(),
            params.position.isLong()
        );

        params.contracts.eventEmitter.emitPositionDecrease(
            eventParams,
            values.executionPrice,
            cache.adjustedSizeDeltaUsd,
            values.sizeDeltaInTokens,
            params.order.initialCollateralDeltaAmount().toInt256(),
            values.pnlAmountForPool,
            values.remainingCollateralAmount,
            values.outputAmount,
            params.order.orderType()
        );
    }
}
