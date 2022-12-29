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

// @title DecreasePositionUtils
// @dev Libary for functions to help with decreasing a position
library DecreasePositionUtils {
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
        uint256 executionPrice;
        int256 remainingCollateralAmount;
        uint256 outputAmount;
        int256 positionPnlUsd;
        int256 pnlAmountForPool;
        uint256 pnlAmountForUser;
        uint256 sizeDeltaInTokens;
        int256 priceImpactAmount;
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

    // @dev _DecreasePositionCache struct used in decreasePosition to
    // avoid stack too deep errors
    // @param prices the prices of the tokens in the market
    // @param pnlToken the token that the pnl for the user is in, for long positions
    // this is the market.longToken, for short positions this is the market.shortToken
    // @param pnlTokenPrice the price of the pnlToken
    // @param initialCollateralAmount the initial collateral amount
    // @param nextPositionSizeInUsd the new position size in USD
    // @param nextPositionBorrowingFactor the new position borrowing factor
    // @param poolDeltaAmount the change in pool amount
    struct _DecreasePositionCache {
        MarketUtils.MarketPrices prices;
        address pnlToken;
        address outputToken;
        Price.Props pnlTokenPrice;
        uint256 adjustedSizeDeltaUsd;
        uint256 initialCollateralAmount;
        uint256 nextPositionSizeInUsd;
        uint256 nextPositionBorrowingFactor;
        int256 poolDeltaAmount;
    }

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
        _DecreasePositionCache memory cache;

        cache.prices = MarketUtils.getMarketPricesForPosition(
            params.contracts.oracle,
            params.market
        );

        cache.pnlToken = params.position.isLong() ? params.market.longToken : params.market.shortToken;
        cache.pnlTokenPrice = params.position.isLong() ? cache.prices.longTokenPrice : cache.prices.shortTokenPrice;

        if (OrderBaseUtils.isLiquidationOrder(params.order.orderType()) && !PositionUtils.isPositionLiquidatable(
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
            ProcessCollateralValues memory values,
            PositionPricingUtils.PositionFees memory fees
        ) = processCollateral(
            params,
            cache
        );

        if (values.remainingCollateralAmount < 0) {
            revert("Insufficient collateral");
        }

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

            params.contracts.positionStore.remove(params.positionKey, params.order.account());
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

            params.contracts.positionStore.set(params.positionKey, params.order.account(), params.position);
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

        values = swapWithdrawnCollateralToPnlToken(params, values, cache.pnlToken);

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
        ProcessCollateralValues memory values,
        _DecreasePositionCache memory cache
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

    // @dev handle the collateral changes of the position
    // @param params PositionUtils.UpdatePositionParams
    // @param cache _ProcessCollateralCache
    // @return (ProcessCollateralValues, PositionPricingUtils.PositionFees)
    function processCollateral(
        PositionUtils.UpdatePositionParams memory params,
        _DecreasePositionCache memory cache
    ) internal returns (
        ProcessCollateralValues memory,
        PositionPricingUtils.PositionFees memory
    ) {
        ProcessCollateralValues memory values;
        values.remainingCollateralAmount = cache.initialCollateralAmount.toInt256();

        values.remainingCollateralAmount -= params.order.initialCollateralDeltaAmount().toInt256();
        values.outputAmount = params.order.initialCollateralDeltaAmount();

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, cache.prices);

        (values.executionPrice, values.priceImpactAmount) = getExecutionPrice(params, cache.prices, cache.adjustedSizeDeltaUsd);

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
            values.pnlAmountForPool = -values.positionPnlUsd / collateralTokenPrice.min.toInt256();
            values.remainingCollateralAmount -= values.pnlAmountForPool;
        } else {
            // position realizes a profit
            // deduct the pnl from the pool
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
                values.outputAmount = 0;
                fees.totalNetCostAmount = fees.totalNetCostAmount - values.outputAmount;
            }
        }

        // deduct remaining fees from the position's collateral
        values.remainingCollateralAmount -= fees.totalNetCostAmount.toInt256();

        if (OrderBaseUtils.isLiquidationOrder(params.order.orderType()) && values.remainingCollateralAmount < 0) {
            return getLiquidationValues(params, values, fees);
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
    ) internal view returns (uint256, int256) {
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
            priceImpactUsd
        );

        uint256 executionPrice = OrderBaseUtils.getExecutionPrice(
            params.contracts.oracle.getCustomPrice(params.market.indexToken),
            params.order.sizeDeltaUsd(),
            priceImpactUsd,
            params.order.acceptablePrice(),
            params.position.isLong(),
            false
        );

        int256 priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            params.order.sizeDeltaUsd(),
            executionPrice,
            prices.indexTokenPrice.max,
            params.position.isLong(),
            false
        );

        return (executionPrice, priceImpactAmount);
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
            values.executionPrice, // executionPrice
            0, // remainingCollateralAmount
            0, // outputAmount
            values.positionPnlUsd, // positionPnlUsd
            values.pnlAmountForPool, // pnlAmountForPool
            0, // pnlAmountForUser
            values.sizeDeltaInTokens, // sizeDeltaInTokens
            values.priceImpactAmount // priceImpactAmount
        );

        return (_values, _fees);
    }

    // swap the withdrawn collateral from collateralToken to pnlToken if needed
    function swapWithdrawnCollateralToPnlToken(
        PositionUtils.UpdatePositionParams memory params,
        ProcessCollateralValues memory values,
        address pnlToken
    ) internal returns (ProcessCollateralValues memory) {
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
