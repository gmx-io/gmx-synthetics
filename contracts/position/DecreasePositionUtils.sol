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

library DecreasePositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    struct DecreasePositionParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        PositionStore positionStore;
        Oracle oracle;
        SwapHandler swapHandler;
        FeeReceiver feeReceiver;
        IReferralStorage referralStorage;
        Market.Props market;
        Order.Props order;
        Market.Props[] swapPathMarkets;
        Position.Props position;
        bytes32 positionKey;
        uint256 adjustedSizeDeltaUsd;
    }

    struct ProcessCollateralValues {
        uint256 executionPrice;
        int256 remainingCollateralAmount;
        uint256 outputAmount;
        int256 positionPnlUsd;
        int256 pnlAmountForPool;
        uint256 pnlAmountForUser;
        uint256 sizeDeltaInTokens;
        int256 priceImpactUsd;
        int256 priceImpactAmount;
    }

    struct _ProcessCollateralCache {
        MarketUtils.MarketPrices prices;
        int256 initialCollateralAmount;
        address pnlToken;
        Price.Props pnlTokenPrice;
    }

    struct _DecreasePositionCache {
        MarketUtils.MarketPrices prices;
        address pnlToken;
        address outputToken;
        Price.Props pnlTokenPrice;
        uint256 initialCollateralAmount;
        uint256 nextPositionSizeInUsd;
        uint256 nextPositionBorrowingFactor;
        int256 poolDeltaAmount;
    }

    struct DecreasePositionResult {
        uint256 adjustedSizeDeltaUsd;
        address outputToken;
        uint256 outputAmount;
        address pnlToken;
        uint256 pnlAmountForUser;
    }

    function decreasePosition(
        DecreasePositionParams memory params
    ) external returns (DecreasePositionResult memory) {
        _DecreasePositionCache memory cache;

        cache.prices = MarketUtils.getMarketPricesForPosition(
            params.market,
            params.oracle
        );

        cache.pnlToken = params.position.isLong ? params.market.longToken : params.market.shortToken;
        cache.pnlTokenPrice = params.position.isLong ? cache.prices.longTokenPrice : cache.prices.shortTokenPrice;

        if (OrderBaseUtils.isLiquidationOrder(params.order.orderType()) && !PositionUtils.isPositionLiquidatable(
            params.dataStore,
            params.referralStorage,
            params.position,
            params.market,
            cache.prices
        )) {
            revert("DecreasePositionUtils: Invalid Liquidation");
        }

        MarketUtils.updateFundingAmountPerSize(
            params.dataStore,
            cache.prices,
            params.market.marketToken,
            params.market.longToken,
            params.market.shortToken
        );

        MarketUtils.updateCumulativeBorrowingFactor(
            params.dataStore,
            cache.prices,
            params.market.marketToken,
            params.market.longToken,
            params.market.shortToken,
            params.position.isLong
        );

        params.adjustedSizeDeltaUsd = params.order.sizeDeltaUsd();

        if (params.adjustedSizeDeltaUsd > params.position.sizeInUsd) {
            if (params.order.orderType() == Order.OrderType.LimitDecrease ||
                params.order.orderType() == Order.OrderType.StopLossDecrease) {
                params.adjustedSizeDeltaUsd = params.position.sizeInUsd;
            } else {
                revert("DecreasePositionUtils: Invalid order size");
            }
        }

        cache.initialCollateralAmount = params.position.collateralAmount;
        (
            ProcessCollateralValues memory values,
            PositionPricingUtils.PositionFees memory fees
        ) = processCollateral(
            params,
            _ProcessCollateralCache(
                cache.prices,
                cache.initialCollateralAmount.toInt256(),
                cache.pnlToken,
                cache.pnlTokenPrice
            )
        );

        if (values.remainingCollateralAmount < 0) {
            revert("Insufficient collateral");
        }

        cache.nextPositionSizeInUsd = params.position.sizeInUsd - params.adjustedSizeDeltaUsd;
        cache.nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(params.dataStore, params.market.marketToken, params.position.isLong);

        MarketUtils.updateTotalBorrowing(
            params.dataStore,
            params.market.marketToken,
            params.position.isLong,
            params.position.borrowingFactor,
            params.position.sizeInUsd,
            cache.nextPositionSizeInUsd,
            cache.nextPositionBorrowingFactor
        );

        params.position.sizeInUsd = cache.nextPositionSizeInUsd;
        params.position.sizeInTokens -= values.sizeDeltaInTokens;
        params.position.collateralAmount = values.remainingCollateralAmount.toUint256();
        params.position.decreasedAtBlock = Chain.currentBlockNumber();

        if (fees.longTokenFundingFeeAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.dataStore,
                params.eventEmitter,
                params.market.marketToken,
                params.market.longToken,
                params.position.account,
                fees.longTokenFundingFeeAmount.toUint256()
            );
        }

        if (fees.shortTokenFundingFeeAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.dataStore,
                params.eventEmitter,
                params.market.marketToken,
                params.market.shortToken,
                params.position.account,
                fees.shortTokenFundingFeeAmount.toUint256()
            );
        }

        if (params.position.sizeInUsd == 0 || params.position.sizeInTokens == 0) {
            // withdraw all collateral if the position will be closed
            values.outputAmount += params.position.collateralAmount;
            params.position.collateralAmount = 0;

            params.positionStore.remove(params.positionKey, params.order.account());
        } else {
            if (!fees.hasPendingLongTokenFundingFee) {
                params.position.longTokenFundingAmountPerSize = fees.latestLongTokenFundingAmountPerSize;
            }
            if (!fees.hasPendingShortTokenFundingFee) {
                params.position.shortTokenFundingAmountPerSize = fees.latestShortTokenFundingAmountPerSize;
            }
            params.position.borrowingFactor = cache.nextPositionBorrowingFactor;

            PositionUtils.validatePosition(
                params.dataStore,
                params.referralStorage,
                params.position,
                params.market,
                cache.prices
            );

            params.positionStore.set(params.positionKey, params.order.account(), params.position);
        }

        MarketUtils.applyDeltaToCollateralSum(
            params.dataStore,
            params.eventEmitter,
            params.position.market,
            params.position.collateralToken,
            params.position.isLong,
            -(cache.initialCollateralAmount - params.position.collateralAmount).toInt256()
        );

        if (params.adjustedSizeDeltaUsd > 0) {
            MarketUtils.applyDeltaToOpenInterest(
                params.dataStore,
                params.eventEmitter,
                params.position.market,
                params.position.collateralToken,
                params.position.isLong,
                -params.adjustedSizeDeltaUsd.toInt256()
            );
            // since sizeDeltaInTokens is rounded down, when positions are closed for tokens with
            // a small number of decimals, the price of the market tokens may increase
            MarketUtils.applyDeltaToOpenInterestInTokens(
                params.dataStore,
                params.eventEmitter,
                params.position.market,
                params.position.collateralToken,
                params.position.isLong,
                values.sizeDeltaInTokens.toInt256()
            );
        }

        cache.poolDeltaAmount = fees.feesForPool.toInt256() + values.pnlAmountForPool;
        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            params.market.marketToken,
            params.order.initialCollateralToken(),
            cache.poolDeltaAmount
        );

        params.eventEmitter.emitPositionFeesCollected(false, fees);
        emitPositionDecrease(params, values);

        ReferralUtils.incrementAffiliateReward(
            params.dataStore,
            params.eventEmitter,
            params.position.market,
            params.position.collateralToken,
            fees.affiliate,
            params.position.account,
            fees.affiliateRewardAmount
        );

        if (fees.traderDiscountAmount > 0) {
            params.eventEmitter.emitTraderReferralDiscountApplied(params.position.market, params.position.collateralToken, params.position.account, fees.traderDiscountAmount);
        }

        cache.outputToken = params.position.collateralToken;

        // swap the withdrawn collateral from collateralToken to pnlToken if needed
        if (params.position.collateralToken != cache.pnlToken && shouldSwapCollateralTokenToPnlToken(params.order.swapPath())) {
            Market.Props[] memory swapPath = new Market.Props[](1);
            swapPath[0] = params.swapPathMarkets[0];

            try params.swapHandler.swap(
                SwapUtils.SwapParams(
                    params.dataStore,
                    params.eventEmitter,
                    params.oracle,
                    params.feeReceiver,
                    params.position.collateralToken, // tokenIn
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

        // if outputAmount is zero, transfer the values from pnlAmountForUser to outputAmount
        if (values.outputAmount == 0 && values.pnlAmountForUser > 0) {
            cache.outputToken = cache.pnlToken;
            values.outputAmount = values.pnlAmountForUser;
            values.pnlAmountForUser = 0;
        }

        return DecreasePositionResult(
            params.adjustedSizeDeltaUsd,
            cache.outputToken,
            values.outputAmount,
            cache.pnlToken,
            values.pnlAmountForUser
        );
    }

    function emitPositionDecrease(
        DecreasePositionParams memory params,
        ProcessCollateralValues memory values
    ) internal {
        params.eventEmitter.emitPositionDecrease(
            params.positionKey,
            params.order.account(),
            params.order.market(),
            params.order.initialCollateralToken(),
            params.order.isLong(),
            values.executionPrice,
            params.adjustedSizeDeltaUsd,
            params.order.initialCollateralDeltaAmount().toInt256(),
            values.pnlAmountForPool,
            values.positionPnlUsd,
            values.remainingCollateralAmount,
            values.outputAmount
        );
    }

    function processCollateral(
        DecreasePositionParams memory params,
        _ProcessCollateralCache memory cache
    ) internal returns (
        ProcessCollateralValues memory,
        PositionPricingUtils.PositionFees memory
    ) {
        ProcessCollateralValues memory values;
        values.remainingCollateralAmount = cache.initialCollateralAmount;

        values.remainingCollateralAmount -= params.order.initialCollateralDeltaAmount().toInt256();
        values.outputAmount = params.order.initialCollateralDeltaAmount();

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.order.initialCollateralToken(), params.market, cache.prices);

        values.priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.dataStore,
                params.market.marketToken,
                params.market.longToken,
                params.market.shortToken,
                -params.adjustedSizeDeltaUsd.toInt256(),
                params.order.isLong()
            )
        );

        values.priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.dataStore,
            params.market.marketToken,
            cache.prices.indexTokenPrice,
            values.priceImpactUsd
        );

        values.executionPrice = OrderBaseUtils.getExecutionPrice(
            params.oracle.getCustomPrice(params.market.indexToken),
            params.order.sizeDeltaUsd(),
            values.priceImpactUsd,
            params.order.acceptablePrice(),
            params.position.isLong,
            false
        );

        values.priceImpactAmount = PositionPricingUtils.getPriceImpactAmount(
            params.order.sizeDeltaUsd(),
            values.executionPrice,
            cache.prices.indexTokenPrice.max,
            params.position.isLong,
            false
        );

        // if there is a positive impact, the impact pool amount should be reduced
        // if there is a negative impact, the impact pool amount should be increased
        MarketUtils.applyDeltaToPositionImpactPool(
            params.dataStore,
            params.eventEmitter,
            params.market.marketToken,
            -values.priceImpactAmount
        );

        (values.positionPnlUsd, values.sizeDeltaInTokens) = PositionUtils.getPositionPnlUsd(
            params.position,
            params.adjustedSizeDeltaUsd,
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

            // swap the realized profit from the pnlToken to the collateralToken if needed
            if (params.position.collateralToken != cache.pnlToken && shouldSwapPnlTokenToCollateralToken(params.order.swapPath())) {
                Market.Props[] memory swapPath = new Market.Props[](1);
                swapPath[0] = params.swapPathMarkets[0];

                try params.swapHandler.swap(
                    SwapUtils.SwapParams(
                        params.dataStore,
                        params.eventEmitter,
                        params.oracle,
                        params.feeReceiver,
                        cache.pnlToken, // tokenIn
                        pnlAmountForUser, // amountIn
                        swapPath, // markets
                        0, // minOutputAmount
                        params.market.marketToken, // receiver
                        false // shouldUnwrapNativeToken
                    )
                ) returns (address tokenOut, uint256 swapOutputAmount) {
                    cache.pnlToken = tokenOut;
                    pnlAmountForUser = swapOutputAmount;
                } catch Error(string memory reason) {
                    emit SwapUtils.SwapReverted(reason);
                } catch (bytes memory _reason) {
                    string memory reason = string(abi.encode(_reason));
                    emit SwapUtils.SwapReverted(reason);
                }
            }

            if (params.position.collateralToken == cache.pnlToken) {
                values.outputAmount += pnlAmountForUser;
            } else {
                // store the pnlAmountForUser separately as it differs from the collateralToken
                values.pnlAmountForUser = pnlAmountForUser;
            }
        }

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            params.dataStore,
            params.referralStorage,
            params.position,
            collateralTokenPrice,
            params.market.longToken,
            params.market.shortToken,
            params.adjustedSizeDeltaUsd
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
            if (fees.fundingFeeAmount > params.position.collateralAmount) {
                values.pnlAmountForPool = 0;
                // the case where this is insufficient collateral to pay funding fees
                // should be rare, and the difference should be small
                // in case it happens, the pool should be topped up with the required amount using
                // an insurance fund or similar mechanism
                params.eventEmitter.emitInsufficientFundingFeePayment(
                    fees.fundingFeeAmount,
                    params.position.collateralAmount
                );
            } else {
                values.pnlAmountForPool = (params.position.collateralAmount - fees.fundingFeeAmount).toInt256();
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
                values.priceImpactUsd, // priceImpactUsd
                values.priceImpactAmount // priceImpactAmount
            );

            return (_values, _fees);
        }

        PricingUtils.transferFees(
            params.dataStore,
            params.feeReceiver,
            params.market.marketToken,
            params.position.collateralToken,
            fees.feeReceiverAmount,
            FeeUtils.POSITION_FEE
        );

        return (values, fees);
    }

    function shouldSwapPnlTokenToCollateralToken(address[] memory swapPath) internal pure returns (bool) {
        if (swapPath.length == 0) {
            return false;
        }

        return swapPath[0] == MarketUtils.SWAP_PNL_TOKEN_TO_COLLATERAL_TOKEN;
    }

    function shouldSwapCollateralTokenToPnlToken(address[] memory swapPath) internal pure returns (bool) {
        if (swapPath.length == 0) {
            return false;
        }

        return swapPath[0] == MarketUtils.SWAP_COLLATERAL_TOKEN_TO_PNL_TOKEN;
    }
}
