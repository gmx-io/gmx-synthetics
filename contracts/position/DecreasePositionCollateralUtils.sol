// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";
import "../error/ErrorUtils.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "../oracle/Oracle.sol";
import "../pricing/PositionPricingUtils.sol";

import "./Position.sol";
import "./PositionEventUtils.sol";
import "./PositionStoreUtils.sol";
import "./PositionUtils.sol";
import "../order/BaseOrderUtils.sol";
import "../order/OrderEventUtils.sol";

import "../swap/SwapUtils.sol";
import "./DecreasePositionSwapUtils.sol";

// @title DecreasePositionCollateralUtils
// @dev Library for functions to help with the calculations when decreasing a position
library DecreasePositionCollateralUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    struct ProcessCollateralCache {
        int256 adjustedPositionPnlUsd;
        uint256 adjustedPriceImpactDiffUsd;
        uint256 adjustedPriceImpactDiffAmount;
        uint256 pnlDiffAmount;
        uint256 deductionAmountForPool;
        uint256 pnlAmountForUser;
    }

    struct ProcessForceCloseCache {
        uint256 remainingFundingFeeAmount;
        uint256 remainingCostAmount;
        address holdingAddress;
    }

    // @dev handle the collateral changes of the position
    // @param params PositionUtils.UpdatePositionParams
    // @param cache DecreasePositionCache
    // @return (PositionUtils.DecreasePositionCollateralValues, PositionPricingUtils.PositionFees)
    function processCollateral(
        PositionUtils.UpdatePositionParams memory params,
        PositionUtils.DecreasePositionCache memory cache
    ) external returns (
        PositionUtils.DecreasePositionCollateralValues memory,
        PositionPricingUtils.PositionFees memory
    ) {
        ProcessCollateralCache memory collateralCache;
        PositionUtils.DecreasePositionCollateralValues memory values;

        values.output.outputToken = params.position.collateralToken();
        values.output.secondaryOutputToken = cache.pnlToken;

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, cache.prices);

        // in case price impact is too high it is capped and the difference is made to be claimable
        // the execution price is based on the capped price impact so it may be a better price than what it should be
        // priceImpactDiffUsd is the difference between the maximum price impact and the originally calculated price impact
        // e.g. if the originally calculated price impact is -$100, but the capped price impact is -$80
        // then priceImpactUsd would be $20
        (values.executionPrice, values.priceImpactAmount, values.priceImpactDiffUsd) = getExecutionPrice(params, cache.prices, params.order.sizeDeltaUsd());

        // the position's total pnl is calculated based on the execution price
        // since the execution price may be better than it should be, the position's positive pnl may be higher than it should be
        // or the position's negative pnl may be lower than it should be
        // the sizeDeltaInTokens is calculated as position.sizeInTokens() * sizeDeltaUsd / position.sizeInUsd()
        // the positionPnlUsd is the pnl to be realized, and is calculated as:
        // totalPositionPnl * sizeDeltaInTokens / position.sizeInTokens()
        (values.positionPnlUsd, values.sizeDeltaInTokens) = PositionUtils.getPositionPnlUsd(
            params.contracts.dataStore,
            params.market,
            cache.prices,
            params.position,
            values.executionPrice,
            params.order.sizeDeltaUsd()
        );

        collateralCache.adjustedPositionPnlUsd = values.positionPnlUsd;
        collateralCache.adjustedPriceImpactDiffUsd = values.priceImpactDiffUsd;

        // if the position's pnl is positive, use the position's pnl to pay for the priceImpactDiffUsd
        // the difference should be made claimable
        if (values.positionPnlUsd > 0 && values.priceImpactDiffUsd > 0) {
            if (values.positionPnlUsd > values.priceImpactDiffUsd.toInt256()) {
                // reduce the pnl by the price impact difference
                collateralCache.adjustedPositionPnlUsd = values.positionPnlUsd - values.priceImpactDiffUsd.toInt256();
                collateralCache.adjustedPriceImpactDiffUsd = 0;
            } else {
                // if the price impact difference is more than the realized pnl, set the adjusted pnl to zero
                // set the adjusted price impact to the initial priceImpactDiffUsd reduced by the realized pnl
                collateralCache.adjustedPositionPnlUsd = 0;
                collateralCache.adjustedPriceImpactDiffUsd = values.priceImpactDiffUsd - values.positionPnlUsd.toUint256();
            }
        }

        // calculate the amount that should be deducted from the position's collateral for the price impact
        collateralCache.adjustedPriceImpactDiffAmount = collateralCache.adjustedPriceImpactDiffUsd / collateralTokenPrice.max;

        // adjust the initialCollateralDeltaAmount by the adjustedPriceImpactDiffAmount to reduce the chance that
        // the position's collateral / leverage gets adjusted by an unexpected amount
        if (collateralCache.adjustedPriceImpactDiffAmount > 0 && params.order.initialCollateralDeltaAmount() > 0) {
            uint256 initialCollateralDeltaAmount = params.order.initialCollateralDeltaAmount();

            if (collateralCache.adjustedPriceImpactDiffAmount > params.order.initialCollateralDeltaAmount()) {
                // if the adjustedPriceImpactDiffAmount is more than the initialCollateralDeltaAmount then set
                // the initial collateral delta amount to zero
                params.order.setInitialCollateralDeltaAmount(0);
            } else {
                // reduce the initialCollateralDeltaAmount by the adjustedPriceImpactDiffAmount
                params.order.setInitialCollateralDeltaAmount(params.order.initialCollateralDeltaAmount() - collateralCache.adjustedPriceImpactDiffAmount);
            }

            OrderEventUtils.emitOrderCollateralDeltaAmountAutoUpdated(
                params.contracts.eventEmitter,
                params.orderKey,
                initialCollateralDeltaAmount,
                params.order.initialCollateralDeltaAmount()
            );
        }

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

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            getPositionFeesParams
        );

        // position realizes a profit, deduct the pnl from the pool
        if (collateralCache.adjustedPositionPnlUsd > 0) {
            // calculate deductionAmountForPool using positionPnlUsd instead of adjustedPositionPnlUsd
            // as the full realized profit should be deducted from the pool
            collateralCache.deductionAmountForPool = values.positionPnlUsd.toUint256() / cache.pnlTokenPrice.max;
            collateralCache.pnlAmountForUser = collateralCache.adjustedPositionPnlUsd.toUint256() / cache.pnlTokenPrice.max;

            // if the price impact for pnl was capped keep the difference to allow it to be claimable later
            collateralCache.pnlDiffAmount = collateralCache.deductionAmountForPool - collateralCache.pnlAmountForUser;

            // pnlDiffAmount is deducted from the position's pnl and made to be claimable
            // this is called before the liquidation check
            // it is possible that the reduction in pnl causes the position to have insufficient
            // pnl to pay for fees
            // however, calling this before the liquidation check is necessary as only the
            // adjustedPositionPnlUsd value should be used to be swapped to the collateral token
            // for cases where the pnlToken is different from the collateral token
            if (collateralCache.pnlDiffAmount > 0) {
                MarketUtils.incrementClaimableCollateralAmount(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.market.marketToken,
                    cache.pnlToken,
                    params.order.account(),
                    collateralCache.pnlDiffAmount
                );
            }

            MarketUtils.applyDeltaToPoolAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                cache.pnlToken,
                -collateralCache.deductionAmountForPool.toInt256()
            );

            // swap profit to the collateral token here so that the profit can be used
            // to pay for the totalNetCostAmount from the fees
            // if the decreasePositionSwapType was set to NoSwap or if the swap fails due
            // to insufficient liquidity or other reasons then it is possible that
            // the profit remains in a different token from the collateral token
            (bool wasSwapped, uint256 swapOutputAmount) = DecreasePositionSwapUtils.swapProfitToCollateralToken(
                params,
                cache.pnlToken,
                collateralCache.pnlAmountForUser
            );

            // if the swap was successful the profit should have been swapped
            // to the collateral token
            if (wasSwapped) {
                values.output.outputAmount += swapOutputAmount;
            } else {
                // if there was no swap or the swap failed but the pnlToken
                // is the same as the collateral token then update the outputAmount
                // with the profit amount
                if (params.position.collateralToken() == cache.pnlToken) {
                    values.output.outputAmount += collateralCache.pnlAmountForUser;
                } else {
                    // if there was no swap or the swap failed and the pnlToken is not the same
                    // as the collateral token then store the pnlAmountForUser separately
                    values.output.secondaryOutputAmount = collateralCache.pnlAmountForUser;
                }
            }
        }

        // if there is a positive outputAmount, use the outputAmount to pay for fees
        // the values.output.outputToken should be the same as the position.collateralToken at this point
        if (values.output.outputToken == params.position.collateralToken() && values.output.outputAmount > 0) {
            if (values.output.outputAmount > fees.totalNetCostAmount) {
                values.output.outputAmount -= fees.totalNetCostAmount;
                fees.collateralCostAmount = 0;
            } else {
                fees.collateralCostAmount -= values.output.outputAmount;
                values.output.outputAmount = 0;
            }
        }

        values.pendingCollateralDeduction = fees.collateralCostAmount;
        // increase the pendingCollateralDeduction by the realized pnl if the pnl is negative
        if (collateralCache.adjustedPositionPnlUsd < 0) {
            values.pendingCollateralDeduction += (-collateralCache.adjustedPositionPnlUsd).toUint256() / collateralTokenPrice.min;
        }

        values.remainingCollateralAmount = params.position.collateralAmount();

        if (values.pendingCollateralDeduction > values.remainingCollateralAmount) {
            if (
                params.order.sizeDeltaUsd() == params.position.sizeInUsd() &&
                (
                    BaseOrderUtils.isLiquidationOrder(params.order.orderType()) ||
                    params.secondaryOrderType == Order.SecondaryOrderType.Adl
                )
            ) {
                // if there is insufficient collateral remaining then prioritize using the collateral to pay
                // funding fees, the rest of the collateral is sent to the pool
                // paying of closing fees should be safe to skip
                // any difference in the paying of borrowing fees should be accounted for
                // from the transfer of collateral to the pool and by the update of the
                // pending borrowing fees
                // any difference in pending negative PnL should similarly be accounted for
                // through the transfer fo collateral to the pool and by the update of the
                // pending pnl
                // updating of the position impact pool should also be safe to skip, it would be the same as
                // closing the position with zero price impact, just that if there were any collateral that could
                // partially pay for negative price impact, it would be sent to the pool instead of the position impact pool
                // the outputAmount should be zero here since it was not sufficient to pay for the totalNetCostAmount
                return processForceClose(params, values, fees, cache.prices, collateralTokenPrice);
            } else {
                // it is possible that this reverts if the swapProfitToCollateralToken
                // did not succeed due to insufficient liquidity, etc.
                // this should be rare since only the profit amount needs to be swapped
                // the reserve and max cap values should be carefully configured to minimize
                // the risk of swapProfitToCollateralToken failing
                revert Errors.InsufficientCollateral(params.position.collateralAmount(), values.pendingCollateralDeduction);
            }
        }

        // position realizes a loss
        // deduct collateral from user, transfer it to the pool
        if (collateralCache.adjustedPositionPnlUsd < 0) {
            // if positionPnlUsd is < 0, then it should be equal to adjustedPositionPnlUsd
            uint256 amountForPool = (-values.positionPnlUsd).toUint256() / collateralTokenPrice.min;
            values.remainingCollateralAmount -= amountForPool;

            MarketUtils.applyDeltaToPoolAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
                amountForPool.toInt256()
            );
        }

        // deduct remaining fees from the position's collateral
        values.remainingCollateralAmount -= fees.collateralCostAmount;

        // if there is a positive impact, the impact pool amount should be reduced
        // if there is a negative impact, the impact pool amount should be increased
        MarketUtils.applyDeltaToPositionImpactPool(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            -values.priceImpactAmount
        );

        // the adjustedPriceImpactDiffAmount has been reduced based on the realized pnl
        // if the realized pnl was not sufficient then further reduce the position's collateral
        // allow the difference to be claimable
        // the adjustedPriceImpactDiffAmount is stored to be claimable after the liquidation check
        // a position is liquidated if the remaining collateral is insufficient to cover losses
        // and fees, if this were called before the liquidation check, it would reduce the amount of collateral
        // available to pay for fees, etc
        // this is called after the remainingCollateralAmount < 0 check and the adjustedPriceImpactDiffAmount
        // is capped to the remainingCollateralAmount the remainingCollateralAmount should not become negative
        if (collateralCache.adjustedPriceImpactDiffAmount > 0) {
            // cap the adjustedPriceImpactDiffAmount to the remainingCollateralAmount
            if (values.remainingCollateralAmount < collateralCache.adjustedPriceImpactDiffAmount) {
                collateralCache.adjustedPriceImpactDiffAmount = values.remainingCollateralAmount;
            }

            // while the remainingCollateralAmount should not become negative, it is possible for it to
            // become zero or to be reduced below the min collateral usd value
            // it is also possible for the position's remaining size to be greater than zero
            // in this case the position could become liquidatable if there is insufficient positive pending pnl
            values.remainingCollateralAmount -= collateralCache.adjustedPriceImpactDiffAmount;

            MarketUtils.incrementClaimableCollateralAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
                params.order.account(),
                collateralCache.adjustedPriceImpactDiffAmount
            );
        }

        if (params.order.initialCollateralDeltaAmount() > values.remainingCollateralAmount) {
            params.order.setInitialCollateralDeltaAmount(values.remainingCollateralAmount);
        }

        values.remainingCollateralAmount -= params.order.initialCollateralDeltaAmount();
        values.output.outputAmount += params.order.initialCollateralDeltaAmount();

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

        return (values, fees);
    }

    function getExecutionPrice(
        PositionUtils.UpdatePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        uint256 sizeDeltaUsd
    ) internal view returns (uint256, int256, uint256) {
        int256 priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.contracts.dataStore,
                params.market,
                -sizeDeltaUsd.toInt256(),
                params.order.isLong()
            )
        );

        priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.contracts.dataStore,
            params.market.marketToken,
            prices.indexTokenPrice,
            priceImpactUsd,
            sizeDeltaUsd
        );

        uint256 priceImpactDiffUsd;
        if (priceImpactUsd < 0) {
            uint256 maxPriceImpactFactor = MarketUtils.getMaxPositionImpactFactor(
                params.contracts.dataStore,
                params.market.marketToken,
                false
            );

            // convert the max price impact to the min negative value
            int256 minPriceImpactUsd = -Precision.applyFactor(sizeDeltaUsd, maxPriceImpactFactor).toInt256();

            if (priceImpactUsd < minPriceImpactUsd) {
                priceImpactDiffUsd = (minPriceImpactUsd - priceImpactUsd).toUint256();
                priceImpactUsd = minPriceImpactUsd;
            }
        }

        uint256 executionPrice = BaseOrderUtils.getExecutionPrice(
            params.contracts.oracle.getPrimaryPrice(params.market.indexToken),
            sizeDeltaUsd,
            priceImpactUsd,
            params.order.acceptablePrice(),
            params.position.isLong(),
            false // isIncrease
        );

        int256 priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            priceImpactUsd,
            prices.indexTokenPrice,
            params.position.isLong(),
            false // isIncrease
        );

        return (executionPrice, priceImpactAmount, priceImpactDiffUsd);
    }

    function processForceClose(
        PositionUtils.UpdatePositionParams memory params,
        PositionUtils.DecreasePositionCollateralValues memory values,
        PositionPricingUtils.PositionFees memory fees,
        MarketUtils.MarketPrices memory prices,
        Price.Props memory collateralTokenPrice
    ) internal returns (
        PositionUtils.DecreasePositionCollateralValues memory,
        PositionPricingUtils.PositionFees memory
    ) {
        ProcessForceCloseCache memory cache;

        // values.output.outputAmount should be zero here
        // since if the outputAmount was positive and more than
        // the pendingCollateralDeduction, the position should not need
        // to be force closed

        PositionEventUtils.emitPositionFeesInfo(
            params.contracts.eventEmitter,
            params.orderKey,
            params.market.marketToken,
            params.position.collateralToken(),
            params.order.sizeDeltaUsd(),
            false, // isIncrease
            fees
        );

        PositionEventUtils.emitForceCloseInfo(
            params.contracts.eventEmitter,
            params.orderKey,
            params.position.collateralAmount(),
            values.positionPnlUsd,
            values.pendingCollateralDeduction
        );

        // separate the funding fee amount and remaining cost
        // since the funding fee should be attempted to be paid first
        cache.remainingCostAmount = values.pendingCollateralDeduction - fees.funding.fundingFeeAmount;

        if (fees.funding.fundingFeeAmount > values.remainingCollateralAmount) {
            cache.remainingFundingFeeAmount = fees.funding.fundingFeeAmount - values.remainingCollateralAmount;

            // the case where this is insufficient collateral to pay funding fees
            // should be rare, and the difference should be small
            // in case it happens, the pool should be topped up with the required amount using
            // the secondary output amount, an insurance fund, or similar mechanism
            PositionEventUtils.emitInsufficientFundingFeePayment(
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
                fees.funding.fundingFeeAmount,
                values.remainingCollateralAmount
            );
        } else {
            uint256 amountForPool = values.remainingCollateralAmount - fees.funding.fundingFeeAmount;
            cache.remainingFundingFeeAmount = 0;

            // the amountForPool should be used to cover the fees and position losses
            // reduce the remainingCostAmount by amountForPool since those costs should be covered
            if (cache.remainingCostAmount > amountForPool ) {
                cache.remainingCostAmount -= amountForPool;
            } else {
                cache.remainingCostAmount = 0;
            }

            MarketUtils.applyDeltaToPoolAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
                amountForPool.toInt256()
            );
        }

        Price.Props memory secondaryTokenPrice = MarketUtils.getCachedTokenPrice(values.output.secondaryOutputToken, params.market, prices);

        if (values.output.secondaryOutputAmount > 0 && cache.remainingFundingFeeAmount > 0) {
            cache.holdingAddress = params.contracts.dataStore.getAddress(Keys.HOLDING_ADDRESS);
            if (cache.holdingAddress == address(0)) {
                revert Errors.EmptyHoldingAddress();
            }

            uint256 secondaryFundingFeeAmount = cache.remainingFundingFeeAmount * collateralTokenPrice.max / secondaryTokenPrice.min;

            if (values.output.secondaryOutputAmount >= secondaryFundingFeeAmount) {
                values.output.secondaryOutputAmount -= secondaryFundingFeeAmount;
            } else {
                PositionEventUtils.emitInsufficientFundingFeePayment(
                    params.contracts.eventEmitter,
                    params.market.marketToken,
                    values.output.secondaryOutputToken,
                    secondaryFundingFeeAmount,
                    values.output.secondaryOutputAmount
                );

                secondaryFundingFeeAmount = values.output.secondaryOutputAmount;
                values.output.secondaryOutputAmount = 0;
            }

            // send the funding fee amount to the holding address
            // this funding fee amount should be swapped to the required token
            // and the resulting tokens should be deposited back into the pool
            MarketUtils.incrementClaimableCollateralAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                values.output.secondaryOutputToken,
                cache.holdingAddress,
                secondaryFundingFeeAmount
            );
        }

        if (values.output.secondaryOutputAmount > 0 && cache.remainingCostAmount > 0) {
            uint256 secondaryAmountForPool = cache.remainingCostAmount * collateralTokenPrice.max / secondaryTokenPrice.min;

            if (values.output.secondaryOutputAmount > secondaryAmountForPool) {
                values.output.secondaryOutputAmount -= secondaryAmountForPool;
            } else {
                secondaryAmountForPool = values.output.secondaryOutputAmount;
                values.output.secondaryOutputAmount = 0;
            }

            MarketUtils.applyDeltaToPoolAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                values.output.secondaryOutputToken,
                secondaryAmountForPool.toInt256()
            );
        }

        PositionUtils.DecreasePositionCollateralValues memory _values = PositionUtils.DecreasePositionCollateralValues(
            values.executionPrice, // executionPrice
            0, // remainingCollateralAmount
            values.positionPnlUsd, // positionPnlUsd
            values.sizeDeltaInTokens, // sizeDeltaInTokens
            values.priceImpactAmount, // priceImpactAmount
            0, // priceImpactDiffUsd
            0, // pendingCollateralDeduction
            PositionUtils.DecreasePositionCollateralValuesOutput(
                address(0), // outputToken
                0, // outputAmount
                values.output.secondaryOutputToken, // secondaryOutputToken
                values.output.secondaryOutputAmount // secondaryOutputAmount
            )
        );

        PositionPricingUtils.PositionFees memory _fees;

        // allow the accumulated funding fees to still be claimable
        _fees.funding.claimableLongTokenAmount = fees.funding.claimableLongTokenAmount;
        _fees.funding.claimableShortTokenAmount = fees.funding.claimableShortTokenAmount;

        return (_values, _fees);
    }

}
