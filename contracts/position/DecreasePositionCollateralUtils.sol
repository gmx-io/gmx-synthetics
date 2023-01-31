// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";
import "../utils/ErrorUtils.sol";

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

    error InsufficientCollateral(int256 remainingCollateralAmount);
    error InvalidOutputToken(address tokenOut, address expectedTokenOut);

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
                collateralCache.adjustedPositionPnlUsd = values.positionPnlUsd - values.priceImpactDiffUsd.toInt256();
                collateralCache.adjustedPriceImpactDiffUsd = 0;
            } else {
                collateralCache.adjustedPositionPnlUsd = 0;
                collateralCache.adjustedPriceImpactDiffUsd = values.priceImpactDiffUsd - values.positionPnlUsd.toUint256();
            }
        }

        collateralCache.adjustedPriceImpactDiffAmount = collateralCache.adjustedPriceImpactDiffUsd / collateralTokenPrice.max;

        if (collateralCache.adjustedPriceImpactDiffUsd > 0 && params.order.initialCollateralDeltaAmount() > 0) {
            uint256 initialCollateralDeltaAmount = params.order.initialCollateralDeltaAmount();

            if (collateralCache.adjustedPriceImpactDiffAmount > params.order.initialCollateralDeltaAmount()) {
                params.order.setInitialCollateralDeltaAmount(0);
            } else {
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
            values.pnlAmountForPool = -values.positionPnlUsd / collateralTokenPrice.min.toInt256();
            values.remainingCollateralAmount -= values.pnlAmountForPool;
        } else {
            // position realizes a profit
            // deduct the pnl from the pool
            values.pnlTokenForPool = cache.pnlToken;
            values.pnlAmountForPool = -values.positionPnlUsd / cache.pnlTokenPrice.max.toInt256();
            values.pnlAmountForUser = collateralCache.adjustedPositionPnlUsd.toUint256() / cache.pnlTokenPrice.max;

            // if the price impact was capped send the difference to a holding area
            collateralCache.pnlDiffAmount = (-values.pnlAmountForPool - values.pnlAmountForUser.toInt256()).toUint256();
            if (collateralCache.pnlDiffAmount > 0) {
                MarketUtils.incrementClaimableCollateralAmount(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.market.marketToken,
                    cache.pnlToken,
                    params.order.receiver(),
                    collateralCache.pnlDiffAmount
                );
            }

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

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            params.contracts.dataStore,
            params.contracts.referralStorage,
            params.position,
            collateralTokenPrice,
            params.market.longToken,
            params.market.shortToken,
            params.order.sizeDeltaUsd()
        );

        // if there is a positive outputAmount, use the outputAmount to pay for fees and price impact
        // the values.output.outputToken should be the same as the position.collateralToken at this point
        if (values.output.outputToken == params.position.collateralToken() && values.output.outputAmount > 0) {
            if (values.output.outputAmount > fees.totalNetCostAmount) {
                values.output.outputAmount -= fees.totalNetCostAmount;
                fees.totalNetCostAmount = 0;
            } else {
                fees.totalNetCostAmount -= values.output.outputAmount;
                values.output.outputAmount = 0;
            }
        }

        // deduct remaining fees from the position's collateral
        values.remainingCollateralAmount -= fees.totalNetCostAmount.toInt256();

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
        if (BaseOrderUtils.isLiquidationOrder(params.order.orderType()) && values.remainingCollateralAmount < 0) {
            PositionPricingUtils.emitPositionFeesInfo(
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
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

            return getLiquidationValues(params, values, fees);
        }

        if (values.remainingCollateralAmount < 0) {
            revert InsufficientCollateral(values.remainingCollateralAmount);
        }

        // if there is a positive impact, the impact pool amount should be reduced
        // if there is a negative impact, the impact pool amount should be increased
        MarketUtils.applyDeltaToPositionImpactPool(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            -values.priceImpactAmount
        );

        // if the price impact was capped, deduct the difference from the collateral
        // and send it to a holding area
        if (collateralCache.adjustedPriceImpactDiffAmount > 0) {
            if (values.remainingCollateralAmount.toUint256() < collateralCache.adjustedPriceImpactDiffAmount) {
                collateralCache.adjustedPriceImpactDiffAmount = values.remainingCollateralAmount.toUint256();
            }

            values.remainingCollateralAmount -= collateralCache.adjustedPriceImpactDiffAmount.toInt256();

            MarketUtils.incrementClaimableCollateralAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
                params.order.receiver(),
                collateralCache.adjustedPriceImpactDiffAmount
            );
        }

        FeeUtils.incrementClaimableFeeAmount(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            params.position.collateralToken(),
            fees.feeReceiverAmount,
            Keys.POSITION_FEE
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
                params.market.marketToken,
                params.market.indexToken,
                params.market.longToken,
                params.market.shortToken,
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
            params.contracts.oracle.getCustomPrice(params.market.indexToken),
            sizeDeltaUsd,
            priceImpactUsd,
            params.order.acceptablePrice(),
            params.position.isLong(),
            false
        );

        int256 priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            sizeDeltaUsd,
            executionPrice,
            prices.indexTokenPrice,
            params.position.isLong(),
            false
        );

        return (executionPrice, priceImpactAmount, priceImpactDiffUsd);
    }

    function getLiquidationValues(
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
            values.pnlAmountForPool = (params.position.collateralAmount() - fees.funding.fundingFeeAmount).toInt256();
        }

        PositionPricingUtils.PositionFees memory _fees;

        PositionUtils.DecreasePositionCollateralValues memory _values = PositionUtils.DecreasePositionCollateralValues(
            values.pnlTokenForPool,
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
                address(0),
                0,
                address(0),
                0
            )
        );

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
                    params.position.collateralToken(), // tokenIn
                    values.output.outputAmount, // amountIn
                    swapPathMarkets, // markets
                    0, // minOutputAmount
                    params.market.marketToken, // receiver
                    false // shouldUnwrapNativeToken
                )
            ) returns (address tokenOut, uint256 swapOutputAmount) {
                if (tokenOut != values.output.secondaryOutputToken) {
                    revert InvalidOutputToken(tokenOut, values.output.secondaryOutputToken);
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
                    pnlToken, // tokenIn
                    profitAmount, // amountIn
                    swapPathMarkets, // markets
                    0, // minOutputAmount
                    params.market.marketToken, // receiver
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
