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
        values.remainingCollateralAmount = cache.initialCollateralAmount.toInt256();

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, cache.prices);

        // priceImpactDiffUsd is the difference between the maximum price impact and the originally calculated price impact
        // e.g. if the originally calculated price impact is -$100, but the capped price impact is -$80
        // then priceImpactUsd would be $20
        (values.executionPrice, values.priceImpactAmount, values.priceImpactDiffUsd) = getExecutionPrice(params, cache.prices, params.order.sizeDeltaUsd());

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

        if (values.positionPnlUsd > 0 && values.priceImpactDiffUsd > 0) {
            if (values.positionPnlUsd > values.priceImpactDiffUsd.toInt256()) {
                // if the position is realizing a profit, reduce the pnl by the price impact difference
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

        if (collateralCache.adjustedPriceImpactDiffUsd > 0 && params.order.initialCollateralDeltaAmount() > 0) {
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

        values.remainingCollateralAmount -= params.order.initialCollateralDeltaAmount().toInt256();
        values.output.outputToken = params.position.collateralToken();
        values.output.outputAmount = params.order.initialCollateralDeltaAmount();
        values.output.secondaryOutputToken = cache.pnlToken;

        if (collateralCache.adjustedPositionPnlUsd < 0) {
            // position realizes a loss
            // deduct collateral from user, transfer it to the pool
            values.pnlTokenForPool = params.position.collateralToken();
            // if positionPnlUsd is < 0, then it should be equal to adjustedPositionPnlUsd
            values.pnlAmountForPool = -values.positionPnlUsd / collateralTokenPrice.min.toInt256();
            values.remainingCollateralAmount -= values.pnlAmountForPool;

            MarketUtils.applyDeltaToPoolAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                values.pnlTokenForPool,
                values.pnlAmountForPool
            );
        } else {
            // position realizes a profit
            // deduct the pnl from the pool
            values.pnlTokenForPool = cache.pnlToken;
            // update pnlAmountForPool using positionPnlUsd instead of adjustedPositionPnlUsd
            // as the full realized profit should be deducted from the pool
            values.pnlAmountForPool = -values.positionPnlUsd / cache.pnlTokenPrice.max.toInt256();
            values.pnlAmountForUser = collateralCache.adjustedPositionPnlUsd.toUint256() / cache.pnlTokenPrice.max;

            // if the price impact for pnl was capped keep the difference to allow it to be claimable later
            collateralCache.pnlDiffAmount = (-values.pnlAmountForPool - values.pnlAmountForUser.toInt256()).toUint256();

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
                values.pnlTokenForPool,
                values.pnlAmountForPool
            );

            // swap profit to the collateral token here so that the profit can be used
            // to pay for the totalNetCostAmount from the fees
            (bool wasSwapped, uint256 swapOutputAmount) = swapProfitToCollateralToken(
                params,
                cache.pnlToken,
                values.pnlAmountForUser
            );

            if (wasSwapped) {
                values.output.outputAmount += swapOutputAmount;
            } else {
                if (params.position.collateralToken() == cache.pnlToken) {
                    values.output.outputAmount += values.pnlAmountForUser;
                } else {
                    // store the pnlAmountForUser separately as it differs from the collateralToken
                    values.output.secondaryOutputAmount = values.pnlAmountForUser;
                }
            }
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

        // if there is a positive outputAmount, use the outputAmount to pay for fees and price impact
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

        // deduct remaining fees from the position's collateral
        values.remainingCollateralAmount -= fees.collateralCostAmount.toInt256();

        // if there is insufficient collateral remaining then prioritize using the collateral to pay
        // funding fees, the rest of the collateral is sent to the pool
        // paying of closing fees should be safe to skip
        // any difference in the paying of borrowing fees should be accounted for
        // from the transfer of collateral to the pool and by the update of the
        // pending borrowing fees
        // any difference in pending negative PnL should similarly be accounted for
        // through the transfer fo collateral to the pool and by the update of the
        // pending pnl
        // paying of price impact should also be safe to skip, it would be the same as
        // closing the position with zero price impact, just that if there were any collateral that could
        // partially pay for negative price impact, it would be sent to the pool instead
        // the outputAmount should be zero here since it was not sufficient to pay for the totalNetCostAmount
        if (BaseOrderUtils.isLiquidationOrder(params.order.orderType()) && values.remainingCollateralAmount < 0) {
            PositionEventUtils.emitPositionFeesInfo(
                params.contracts.eventEmitter,
                params.orderKey,
                params.market.marketToken,
                params.position.collateralToken(),
                params.order.sizeDeltaUsd(),
                false,
                fees
            );

            PositionEventUtils.emitLiquidationInfo(
                params.contracts.eventEmitter,
                params.orderKey,
                params.position.collateralAmount(),
                values.positionPnlUsd,
                values.remainingCollateralAmount
            );

            return processLiquidation(params, values, fees);
        }

        // it is possible that this reverts if the swapProfitToCollateralToken
        // did not succeed due to insufficient liquidity, etc.
        // this should be rare since only the profit amount needs to be swapped
        // but it could lead to ADLs orders failing
        // the reserve and max cap values should be carefully configured to minimize
        // the risk of swapProfitToCollateralToken failing
        // alternatively, an external system to provide liquidity in times when
        // these swaps are needed could be setup
        if (values.remainingCollateralAmount < 0) {
            revert Errors.InsufficientCollateral(values.remainingCollateralAmount);
        }

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
        // a position is only liquidated if the remaining collateral is insufficient to cover losses
        // and fees, if this were called before the liquidation check, it would reduce the amount of collateral
        // available to pay for fees, etc
        // this is called after the remainingCollateralAmount < 0 check and the adjustedPriceImpactDiffAmount
        // is capped to the remainingCollateralAmount the remainingCollateralAmount should not become negative
        if (collateralCache.adjustedPriceImpactDiffAmount > 0) {
            // cap the adjustedPriceImpactDiffAmount to the remainingCollateralAmount
            if (values.remainingCollateralAmount.toUint256() < collateralCache.adjustedPriceImpactDiffAmount) {
                collateralCache.adjustedPriceImpactDiffAmount = values.remainingCollateralAmount.toUint256();
            }

            // while the remainingCollateralAmount should not become negative, it is possible for it to
            // become zero or to be reduced below the min collateral usd value
            // it is also possible for the position's remaining size to be greater than zero
            // in this case the position could become liquidatable if there is insufficient positive pending pnl
            values.remainingCollateralAmount -= collateralCache.adjustedPriceImpactDiffAmount.toInt256();

            MarketUtils.incrementClaimableCollateralAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
                params.order.account(),
                collateralCache.adjustedPriceImpactDiffAmount
            );
        }

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
            false
        );

        int256 priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(priceImpactUsd, executionPrice);

        return (executionPrice, priceImpactAmount, priceImpactDiffUsd);
    }

    // for simplicity all fee values are set to zero in case there is insufficient
    // collateral to cover all fees
    function processLiquidation(
        PositionUtils.UpdatePositionParams memory params,
        PositionUtils.DecreasePositionCollateralValues memory values,
        PositionPricingUtils.PositionFees memory fees
    ) internal returns (
        PositionUtils.DecreasePositionCollateralValues memory,
        PositionPricingUtils.PositionFees memory
    ) {
        if (fees.funding.fundingFeeAmount > params.position.collateralAmount()) {
            values.pnlAmountForPool = 0;
            // the case where this is insufficient collateral to pay funding fees
            // should be rare, and the difference should be small
            // in case it happens, the pool should be topped up with the required amount using
            // an insurance fund or similar mechanism
            PositionEventUtils.emitInsufficientFundingFeePayment(
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
                fees.funding.fundingFeeAmount,
                params.position.collateralAmount()
            );
        } else {
            values.pnlTokenForPool = params.position.collateralToken();
            values.pnlAmountForPool = (params.position.collateralAmount() - fees.funding.fundingFeeAmount).toInt256();

            MarketUtils.applyDeltaToPoolAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                values.pnlTokenForPool,
                values.pnlAmountForPool
            );
        }

        if (values.output.secondaryOutputAmount != 0) {
            // it is possible for a large amount of borrowing fees / funding fees
            // to be unpaid if the swapProfitToCollateralToken did not succeed
            // this could lead to an unexpected change in the price of the market token
            // this case should be rare since only the profit needs to be swapped
            //
            // the reserve and max cap values should be carefully configured to minimize
            // the risk of swapProfitToCollateralToken failing
            // alternatively, an external system to provide liquidity in times when
            // these swaps are needed could be setup
            //
            // a separate flow could also be setup to gradually distribute
            // this value back to market token holders
            MarketUtils.incrementClaimableCollateralAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                values.output.secondaryOutputToken,
                params.order.account(),
                values.output.secondaryOutputAmount
            );
        }

        PositionUtils.DecreasePositionCollateralValues memory _values = PositionUtils.DecreasePositionCollateralValues(
            values.pnlTokenForPool, // pnlTokenForPool
            values.executionPrice, // executionPrice
            0, // remainingCollateralAmount
            values.positionPnlUsd, // positionPnlUsd
            values.pnlAmountForPool, // pnlAmountForPool
            0, // pnlAmountForUser
            values.sizeDeltaInTokens, // sizeDeltaInTokens
            values.priceImpactAmount, // priceImpactAmount
            0, // priceImpactDiffUsd
            0, // priceImpactDiffAmount
            PositionUtils.DecreasePositionCollateralValuesOutput(
                address(0), // outputToken
                0, // outputAmount
                address(0), // secondaryOutputToken
                0 // secondaryOutputAmount
            )
        );

        PositionPricingUtils.PositionFees memory _fees;

        // allow the accumulated funding fees to still be claimable
        _fees.funding.claimableLongTokenAmount = fees.funding.claimableLongTokenAmount;
        _fees.funding.claimableShortTokenAmount = fees.funding.claimableShortTokenAmount;

        return (_values, _fees);
    }

    // swap the withdrawn collateral from collateralToken to pnlToken if needed
    function swapWithdrawnCollateralToPnlToken(
        PositionUtils.UpdatePositionParams memory params,
        PositionUtils.DecreasePositionCollateralValues memory values
    ) external returns (PositionUtils.DecreasePositionCollateralValues memory) {
        if (params.order.decreasePositionSwapType() == Order.DecreasePositionSwapType.SwapCollateralTokenToPnlToken) {
            Market.Props[] memory swapPathMarkets = new Market.Props[](1);
            swapPathMarkets[0] = params.market;

            try params.contracts.swapHandler.swap(
                SwapUtils.SwapParams(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.contracts.oracle,
                    Bank(payable(params.market.marketToken)),
                    params.orderKey,
                    params.position.collateralToken(), // tokenIn
                    values.output.outputAmount, // amountIn
                    swapPathMarkets, // markets
                    0, // minOutputAmount
                    params.market.marketToken, // receiver
                    params.order.uiFeeReceiver(), // uiFeeReceiver
                    false // shouldUnwrapNativeToken
                )
            ) returns (address tokenOut, uint256 swapOutputAmount) {
                if (tokenOut != values.output.secondaryOutputToken) {
                    revert Errors.InvalidOutputToken(tokenOut, values.output.secondaryOutputToken);
                }
                // combine the values into outputToken and outputAmount
                values.output.outputToken = tokenOut;
                values.output.outputAmount = values.output.secondaryOutputAmount + swapOutputAmount;
                values.output.secondaryOutputAmount = 0;
            } catch Error(string memory reason) {
                emit SwapUtils.SwapReverted(reason, "");
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                emit SwapUtils.SwapReverted(reason, reasonBytes);
            }
        }

        return values;
    }

    // swap the realized profit from the pnlToken to the collateralToken if needed
    function swapProfitToCollateralToken(
        PositionUtils.UpdatePositionParams memory params,
        address pnlToken,
        uint256 profitAmount
    ) internal returns (bool, uint256) {
        if (params.order.decreasePositionSwapType() == Order.DecreasePositionSwapType.SwapPnlTokenToCollateralToken) {
            Market.Props[] memory swapPathMarkets = new Market.Props[](1);
            swapPathMarkets[0] = params.market;

            try params.contracts.swapHandler.swap(
                SwapUtils.SwapParams(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.contracts.oracle,
                    Bank(payable(params.market.marketToken)),
                    params.orderKey,
                    pnlToken, // tokenIn
                    profitAmount, // amountIn
                    swapPathMarkets, // markets
                    0, // minOutputAmount
                    params.market.marketToken, // receiver
                    params.order.uiFeeReceiver(), // uiFeeReceiver
                    false // shouldUnwrapNativeToken
                )
            ) returns (address /* tokenOut */, uint256 swapOutputAmount) {
                return (true, swapOutputAmount);
            } catch Error(string memory reason) {
                emit SwapUtils.SwapReverted(reason, "");
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                emit SwapUtils.SwapReverted(reason, reasonBytes);
            }
        }

        return (false, 0);
    }
}
