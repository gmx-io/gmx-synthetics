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

import "../swap/SwapUtils.sol";

// @title DecreasePositionCollateralUtils
// @dev Libary for functions to help with the calculations when decreasing a position
library DecreasePositionCollateralUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    // @dev ProcessCollateralValues struct used to contain the values in processCollateral
    // @param executionPrice the order execution price
    // @param remainingCollateralAmount the remaining collateral amount of the position
    // @param outputAmount the output amount
    // @param positionPnlUsd the pnl of the position in USD
    // @param pnlAmountForPool the pnl for the pool in token amount
    // @param pnlAmountForUser the pnl for the user in token amount
    // @param sizeDeltaInTokens the change in position size in tokens
    // @param priceImpactAmount the price impact in tokens
    struct ProcessCollateralValues {
        address pnlTokenForPool;
        uint256 executionPrice;
        int256 remainingCollateralAmount;
        uint256 outputAmount;
        int256 positionPnlUsd;
        int256 pnlAmountForPool;
        uint256 pnlAmountForUser;
        uint256 sizeDeltaInTokens;
        int256 priceImpactAmount;
        uint256 priceImpactDiffUsd;
    }

    // @dev _ProcessCollateralCache struct used in processCollateral to
    // avoid stack too deep errors
    // @param prices the prices of the tokens in the market
    // @param initialCollateralAmount the initial collateral amount
    // @param pnlToken the token that the pnl for the user is in, for long positions
    // this is the market.longToken, for short positions this is the market.shortToken
    // @param pnlTokenPrice the price of the pnlToken
    struct _ProcessCollateralCache {
        MarketUtils.MarketPrices prices;
        int256 initialCollateralAmount;
        address pnlToken;
        Price.Props pnlTokenPrice;
    }

    // @dev DecreasePositionCache struct used in decreasePosition to
    // avoid stack too deep errors
    // @param prices the prices of the tokens in the market
    // @param pnlToken the token that the pnl for the user is in, for long positions
    // this is the market.longToken, for short positions this is the market.shortToken
    // @param pnlTokenPrice the price of the pnlToken
    // @param initialCollateralAmount the initial collateral amount
    // @param nextPositionSizeInUsd the new position size in USD
    // @param nextPositionBorrowingFactor the new position borrowing factor
    struct DecreasePositionCache {
        MarketUtils.MarketPrices prices;
        address pnlToken;
        address outputToken;
        Price.Props pnlTokenPrice;
        uint256 adjustedSizeDeltaUsd;
        uint256 initialCollateralAmount;
        uint256 nextPositionSizeInUsd;
        uint256 nextPositionBorrowingFactor;
    }


    // @dev handle the collateral changes of the position
    // @param params PositionUtils.UpdatePositionParams
    // @param cache _ProcessCollateralCache
    // @return (ProcessCollateralValues, PositionPricingUtils.PositionFees)
    function processCollateral(
        PositionUtils.UpdatePositionParams memory params,
        DecreasePositionCache memory cache
    ) external returns (
        ProcessCollateralValues memory,
        PositionPricingUtils.PositionFees memory
    ) {
        ProcessCollateralValues memory values;
        values.remainingCollateralAmount = cache.initialCollateralAmount.toInt256();

        values.remainingCollateralAmount -= params.order.initialCollateralDeltaAmount().toInt256();
        values.outputAmount = params.order.initialCollateralDeltaAmount();

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, cache.prices);

        (values.executionPrice, values.priceImpactAmount, values.priceImpactDiffUsd) = getExecutionPrice(params, cache.prices, cache.adjustedSizeDeltaUsd);

        // if there is a positive impact, the impact pool amount should be reduced
        // if there is a negative impact, the impact pool amount should be increased
        MarketUtils.applyDeltaToPositionImpactPool(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken,
            -values.priceImpactAmount
        );

        (values.positionPnlUsd, values.sizeDeltaInTokens) = PositionUtils.getPositionPnlUsd(
            params.position,
            cache.adjustedSizeDeltaUsd,
            values.executionPrice
        );

        if (values.positionPnlUsd < 0) {
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
            uint256 pnlAmountForUser = (-values.pnlAmountForPool).toUint256();

            (bool wasSwapped, uint256 swapOutputAmount) = swapProfitToCollateralToken(
                params,
                cache.pnlToken,
                pnlAmountForUser
            );

            if (wasSwapped) {
                values.outputAmount += swapOutputAmount;
            } else {
                if (params.position.collateralToken() == cache.pnlToken) {
                    values.outputAmount += pnlAmountForUser;
                } else {
                    // store the pnlAmountForUser separately as it differs from the collateralToken
                    values.pnlAmountForUser = pnlAmountForUser;
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
            cache.adjustedSizeDeltaUsd
        );

        // if there is a positive outputAmount, use the outputAmount to pay for fees and price impact
        if (values.outputAmount > 0) {
            if (values.outputAmount > fees.totalNetCostAmount) {
                values.outputAmount -= fees.totalNetCostAmount;
                fees.totalNetCostAmount = 0;
            } else {
                fees.totalNetCostAmount -= values.outputAmount;
                values.outputAmount = 0;
            }
        }

        // deduct remaining fees from the position's collateral
        values.remainingCollateralAmount -= fees.totalNetCostAmount.toInt256();

        if (OrderBaseUtils.isLiquidationOrder(params.order.orderType()) && values.remainingCollateralAmount < 0) {
            return getLiquidationValues(params, values, fees);
        }

        if (values.remainingCollateralAmount < 0) {
            revert("Insufficient collateral");
        }

        // if the price impact was capped, deduct the difference from the collateral
        // and send it to a holding area
        if (values.priceImpactDiffUsd > 0) {
            uint256 priceImpactDiffAmount = values.priceImpactDiffUsd / collateralTokenPrice.max;
            if (values.remainingCollateralAmount.toUint256() < priceImpactDiffAmount) {
                priceImpactDiffAmount = values.remainingCollateralAmount.toUint256();
            }

            values.remainingCollateralAmount -= priceImpactDiffAmount.toInt256();

            MarketUtils.incrementClaimableCollateralAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.position.collateralToken(),
                params.order.receiver(),
                priceImpactDiffAmount
            );
        }

        PricingUtils.transferFees(
            params.contracts.feeReceiver,
            params.market.marketToken,
            params.position.collateralToken(),
            fees.feeReceiverAmount,
            FeeUtils.POSITION_FEE
        );

        return (values, fees);
    }

    function getExecutionPrice(
        PositionUtils.UpdatePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        uint256 adjustedSizeDeltaUsd
    ) internal view returns (uint256, int256, uint256) {
        int256 priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.contracts.dataStore,
                params.market.marketToken,
                params.market.longToken,
                params.market.shortToken,
                -adjustedSizeDeltaUsd.toInt256(),
                params.order.isLong()
            )
        );

        priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.contracts.dataStore,
            params.market.marketToken,
            prices.indexTokenPrice,
            priceImpactUsd,
            adjustedSizeDeltaUsd
        );

        uint256 priceImpactDiffUsd;
        if (priceImpactUsd < 0) {
            uint256 maxPriceImpactFactor = MarketUtils.getMaxPositionImpactFactor(
                params.contracts.dataStore,
                params.market.marketToken,
                false
            );

            // convert the max price impact to the min negative value
            int256 minPriceImpactUsd = -Precision.applyFactor(adjustedSizeDeltaUsd, maxPriceImpactFactor).toInt256();

            if (priceImpactUsd < minPriceImpactUsd) {
                priceImpactDiffUsd = (minPriceImpactUsd - priceImpactUsd).toUint256();
                priceImpactUsd = minPriceImpactUsd;
            }
        }

        uint256 executionPrice = OrderBaseUtils.getExecutionPrice(
            params.contracts.oracle.getCustomPrice(params.market.indexToken),
            adjustedSizeDeltaUsd,
            priceImpactUsd,
            params.order.acceptablePrice(),
            params.position.isLong(),
            false
        );

        int256 priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            adjustedSizeDeltaUsd,
            executionPrice,
            prices.indexTokenPrice.max,
            params.position.isLong(),
            false
        );

        return (executionPrice, priceImpactAmount, priceImpactDiffUsd);
    }

    function getLiquidationValues(
        PositionUtils.UpdatePositionParams memory params,
        ProcessCollateralValues memory values,
        PositionPricingUtils.PositionFees memory fees
    ) internal returns (
        ProcessCollateralValues memory,
        PositionPricingUtils.PositionFees memory
    ) {
        if (fees.funding.fundingFeeAmount > params.position.collateralAmount()) {
            values.pnlAmountForPool = 0;
            // the case where this is insufficient collateral to pay funding fees
            // should be rare, and the difference should be small
            // in case it happens, the pool should be topped up with the required amount using
            // an insurance fund or similar mechanism
            params.contracts.eventEmitter.emitInsufficientFundingFeePayment(
                fees.funding.fundingFeeAmount,
                params.position.collateralAmount()
            );
        } else {
            values.pnlAmountForPool = (params.position.collateralAmount() - fees.funding.fundingFeeAmount).toInt256();
        }

        PositionPricingUtils.PositionFees memory _fees;

        ProcessCollateralValues memory _values = ProcessCollateralValues(
            values.pnlTokenForPool,
            values.executionPrice, // executionPrice
            0, // remainingCollateralAmount
            0, // outputAmount
            values.positionPnlUsd, // positionPnlUsd
            values.pnlAmountForPool, // pnlAmountForPool
            0, // pnlAmountForUser
            values.sizeDeltaInTokens, // sizeDeltaInTokens
            values.priceImpactAmount, // priceImpactAmount
            0 // priceImpactDiffUsd
        );

        return (_values, _fees);
    }

    // swap the withdrawn collateral from collateralToken to pnlToken if needed
    function swapWithdrawnCollateralToPnlToken(
        PositionUtils.UpdatePositionParams memory params,
        ProcessCollateralValues memory values,
        address pnlToken
    ) external returns (ProcessCollateralValues memory) {
        if (params.position.collateralToken() != pnlToken && shouldSwapCollateralTokenToPnlToken(params.order.swapPath())) {
            Market.Props[] memory swapPath = new Market.Props[](1);
            swapPath[0] = params.market;

            try params.contracts.swapHandler.swap(
                SwapUtils.SwapParams(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.contracts.oracle,
                    params.contracts.feeReceiver,
                    params.position.collateralToken(), // tokenIn
                    values.outputAmount, // amountIn
                    swapPath, // markets
                    0, // minOutputAmount
                    params.market.marketToken, // receiver
                    false // shouldUnwrapNativeToken
                )
            ) returns (address /* tokenOut */, uint256 swapOutputAmount) {
                values.outputAmount += swapOutputAmount;
                values.pnlAmountForUser = 0;
            } catch Error(string memory reason) {
                emit SwapUtils.SwapReverted(reason);
            } catch (bytes memory _reason) {
                string memory reason = string(abi.encode(_reason));
                emit SwapUtils.SwapReverted(reason);
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
        if (params.position.collateralToken() != pnlToken && shouldSwapPnlTokenToCollateralToken(params.order.swapPath())) {
            Market.Props[] memory swapPath = new Market.Props[](1);
            swapPath[0] = params.market;

            try params.contracts.swapHandler.swap(
                SwapUtils.SwapParams(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.contracts.oracle,
                    params.contracts.feeReceiver,
                    pnlToken, // tokenIn
                    profitAmount, // amountIn
                    swapPath, // markets
                    0, // minOutputAmount
                    params.market.marketToken, // receiver
                    false // shouldUnwrapNativeToken
                )
            ) returns (address /* tokenOut */, uint256 swapOutputAmount) {
                return (true, swapOutputAmount);
            } catch Error(string memory reason) {
                emit SwapUtils.SwapReverted(reason);
            } catch (bytes memory _reason) {
                string memory reason = string(abi.encode(_reason));
                emit SwapUtils.SwapReverted(reason);
            }
        }

        return (false, 0);
    }

    // @dev check if the pnlToken should be swapped to the collateralToken
    // @param the order.swapPath
    // @return whether the pnlToken should be swapped to the collateralToken
    function shouldSwapPnlTokenToCollateralToken(address[] memory swapPath) internal pure returns (bool) {
        if (swapPath.length == 0) {
            return false;
        }

        return swapPath[0] == MarketUtils.SWAP_PNL_TOKEN_TO_COLLATERAL_TOKEN;
    }

    // @dev check if the collateralToken should be swapped to the pnlToken
    // @param the order.swapPath
    // @return whether the collateralToken should be swapped to the pnlToken
    function shouldSwapCollateralTokenToPnlToken(address[] memory swapPath) internal pure returns (bool) {
        if (swapPath.length == 0) {
            return false;
        }

        return swapPath[0] == MarketUtils.SWAP_COLLATERAL_TOKEN_TO_PNL_TOKEN;
    }
}
