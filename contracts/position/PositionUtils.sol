// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../utils/Precision.sol";

import "./Position.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "../pricing/PositionPricingUtils.sol";
import "../order/BaseOrderUtils.sol";
import "../referral/ReferralEventUtils.sol";

// @title PositionUtils
// @dev Library for position functions
library PositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Price for Price.Props;
    using Position for Position.Props;
    using Order for Order.Props;

    // @dev UpdatePositionParams struct used in increasePosition to avoid
    // stack too deep errors
    //
    // @param market the values of the trading market
    // @param order the decrease position order
    // @param position the order's position
    // @param positionKey the key of the order's position
    // @param collateral the collateralToken of the position
    // @param collateralDeltaAmount the amount of collateralToken deposited
    struct UpdatePositionParams {
        BaseOrderUtils.ExecuteOrderParamsContracts contracts;
        Market.Props market;
        Order.Props order;
        bytes32 orderKey;
        Position.Props position;
        bytes32 positionKey;
    }

    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param oracle Oracle
    // @param referralStorage IReferralStorage
    struct UpdatePositionParamsContracts {
        DataStore dataStore;
        EventEmitter eventEmitter;
        Oracle oracle;
        SwapHandler swapHandler;
        IReferralStorage referralStorage;
    }

    struct WillPositionCollateralBeSufficientValues {
        uint256 positionSizeInUsd;
        uint256 positionCollateralAmount;
        int256 positionPnlUsd;
        int256 realizedPnlUsd;
        int256 openInterestDelta;
    }

    struct DecreasePositionCollateralValuesOutput {
        address outputToken;
        uint256 outputAmount;
        address secondaryOutputToken;
        uint256 secondaryOutputAmount;
    }

    // @dev ProcessCollateralValues struct used to contain the values in processCollateral
    // @param executionPrice the order execution price
    // @param remainingCollateralAmount the remaining collateral amount of the position
    // @param outputAmount the output amount
    // @param positionPnlUsd the pnl of the position in USD
    // @param pnlAmountForPool the pnl for the pool in token amount
    // @param pnlAmountForUser the pnl for the user in token amount
    // @param sizeDeltaInTokens the change in position size in tokens
    // @param priceImpactAmount the price impact in tokens
    struct DecreasePositionCollateralValues {
        address pnlTokenForPool;
        uint256 executionPrice;
        int256 remainingCollateralAmount;
        int256 positionPnlUsd;
        int256 pnlAmountForPool;
        uint256 pnlAmountForUser;
        uint256 sizeDeltaInTokens;
        int256 priceImpactAmount;
        uint256 priceImpactDiffUsd;
        uint256 priceImpactDiffAmount;
        DecreasePositionCollateralValuesOutput output;
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
        int256 estimatedPositionPnlUsd;
        int256 estimatedRealizedPnlUsd;
        int256 estimatedRemainingPnlUsd;
        address pnlToken;
        Price.Props pnlTokenPrice;
        uint256 initialCollateralAmount;
        uint256 nextPositionSizeInUsd;
        uint256 nextPositionBorrowingFactor;
    }


    struct GetPositionPnlUsdCache {
        int256 positionValue;
        int256 totalPositionPnl;
        address pnlToken;
        uint256 poolTokenAmount;
        uint256 poolTokenPrice;
        uint256 poolTokenUsd;
        int256 poolPnl;
        int256 cappedPoolPnl;
        uint256 sizeDeltaInTokens;
        int256 positionPnlUsd;
    }

    // @dev IsPositionLiquidatableCache struct used in isPositionLiquidatable
    // to avoid stack too deep errors
    // @param positionPnlUsd the position's pnl in USD
    // @param minCollateralFactor the min collateral factor
    // @param collateralUsd the position's collateral in USD
    // @param priceImpactUsd the price impact of closing the position in USD
    // @param minCollateralUsd the minimum allowed collateral in USD
    // @param remainingCollateralUsd the remaining position collateral in USD
    struct IsPositionLiquidatableCache {
        int256 positionPnlUsd;
        uint256 minCollateralFactor;
        uint256 collateralUsd;
        int256 priceImpactUsd;
        int256 minCollateralUsd;
        int256 minCollateralUsdForLeverage;
        int256 remainingCollateralUsd;
    }

    error LiquidatablePosition();
    error EmptyPosition(uint256 sizeInUsd, uint256 sizeInTokens, uint256 collateralAmount);

    // @dev get the position pnl in USD
    //
    // for long positions, pnl is calculated as:
    // (position.sizeInTokens * indexTokenPrice) - position.sizeInUsd
    // if position.sizeInTokens is larger for long positions, the position will have
    // larger profits and smaller losses for the same changes in token price
    //
    // for short positions, pnl is calculated as:
    // position.sizeInUsd -  (position.sizeInTokens * indexTokenPrice)
    // if position.sizeInTokens is smaller for long positions, the position will have
    // larger profits and smaller losses for the same changes in token price
    //
    // @param position the position values
    // @param sizeDeltaUsd the change in position size
    // @param indexTokenPrice the price of the index token
    //
    // @return (positionPnlUsd, sizeDeltaInTokens)
    function getPositionPnlUsd(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        Position.Props memory position,
        uint256 indexTokenPrice,
        uint256 sizeDeltaUsd
    ) public view returns (int256, uint256) {
        GetPositionPnlUsdCache memory cache;

        // position.sizeInUsd is the cost of the tokens, positionValue is the current worth of the tokens
        cache.positionValue = (position.sizeInTokens() * indexTokenPrice).toInt256();
        cache.totalPositionPnl = position.isLong() ? cache.positionValue - position.sizeInUsd().toInt256() : position.sizeInUsd().toInt256() - cache.positionValue;

        if (cache.totalPositionPnl > 0) {
            cache.pnlToken = position.isLong() ? market.longToken : market.shortToken;
            cache.poolTokenAmount = MarketUtils.getPoolAmount(dataStore, market.marketToken, cache.pnlToken);
            cache.poolTokenPrice = position.isLong() ? prices.longTokenPrice.min : prices.shortTokenPrice.min;
            cache.poolTokenUsd = cache.poolTokenAmount * cache.poolTokenPrice;
            cache.poolPnl = MarketUtils.getPnl(
                dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
                indexTokenPrice,
                position.isLong(),
                true
            );

            cache.cappedPoolPnl = MarketUtils.getCappedPnl(
                dataStore,
                market.marketToken,
                position.isLong(),
                cache.poolPnl,
                cache.poolTokenUsd,
                Keys.MAX_PNL_FACTOR_FOR_TRADERS
            );

            if (cache.cappedPoolPnl != cache.poolPnl && cache.cappedPoolPnl > 0 && cache.poolPnl > 0) {
                // divide by WEI_PRECISION to reduce the risk of overflow
                cache.totalPositionPnl = cache.totalPositionPnl * (cache.cappedPoolPnl / Precision.WEI_PRECISION.toInt256()) / (cache.poolPnl / Precision.WEI_PRECISION.toInt256());
            }
        }

        cache.sizeDeltaInTokens;

        if (position.sizeInUsd() == sizeDeltaUsd) {
            cache.sizeDeltaInTokens = position.sizeInTokens();
        } else {
            if (position.isLong()) {
                cache.sizeDeltaInTokens = Calc.roundUpDivision(position.sizeInTokens() * sizeDeltaUsd, position.sizeInUsd());
            } else {
                cache.sizeDeltaInTokens = position.sizeInTokens() * sizeDeltaUsd / position.sizeInUsd();
            }
        }

        cache.positionPnlUsd = cache.totalPositionPnl * cache.sizeDeltaInTokens.toInt256() / position.sizeInTokens().toInt256();

        return (cache.positionPnlUsd, cache.sizeDeltaInTokens);
    }

    // @dev convert sizeDeltaUsd to sizeDeltaInTokens
    // @param sizeInUsd the position size in USD
    // @param sizeInTokens the position size in tokens
    // @param sizeDeltaUsd the position size change in USD
    // @return the size delta in tokens
    function getSizeDeltaInTokens(uint256 sizeInUsd, uint256 sizeInTokens, uint256 sizeDeltaUsd) internal pure returns (uint256) {
        return sizeInTokens * sizeDeltaUsd / sizeInUsd;
    }

    // @dev get the key for a position
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @return the position key
    function getPositionKey(address account, address market, address collateralToken, bool isLong) internal pure returns (bytes32) {
        bytes32 key = keccak256(abi.encode(account, market, collateralToken, isLong));
        return key;
    }

    // @dev validate that a position is not empty
    // @param position the position values
    function validateNonEmptyPosition(Position.Props memory position) internal pure {
        if (position.sizeInUsd() == 0 || position.sizeInTokens() == 0 || position.collateralAmount() == 0) {
            revert EmptyPosition(position.sizeInUsd(), position.sizeInTokens(), position.collateralAmount());
        }
    }

    // @dev check if a position is valid
    // @param dataStore DataStore
    // @param referralStorage IReferralStorage
    // @param position the position values
    // @param market the market values
    // @param prices the prices of the tokens in the market
    // @param shouldValidateMinCollateralUsd whether min collateral usd needs to be validated
    // validation is skipped for decrease position to prevent reverts in case the order size
    // is just slightly smaller than the position size
    // in decrease position, the remaining collateral is estimated at the start, and the order
    // size is updated to match the position size if the remaining collateral will be less than
    // the min collateral usd
    // since this is an estimate, there may be edge cases where there is a small remaining position size
    // and small amount of collateral remaining
    // validation is skipped for this case as it is preferred for the order to be executed
    // since the small amount of collateral remaining only impacts the potential payment of liquidation
    // keepers
    function validatePosition(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Position.Props memory position,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        bool shouldValidateMinCollateralUsd
    ) public view {
        validateNonEmptyPosition(position);

        if (isPositionLiquidatable(
            dataStore,
            referralStorage,
            position,
            market,
            prices,
            shouldValidateMinCollateralUsd
        )) {
            revert LiquidatablePosition();
        }
    }

    // @dev check if a position is liquidatable
    // @param dataStore DataStore
    // @param referralStorage IReferralStorage
    // @param position the position values
    // @param market the market values
    // @param prices the prices of the tokens in the market
    function isPositionLiquidatable(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Position.Props memory position,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        bool shouldValidateMinCollateralUsd
    ) public view returns (bool) {
        IsPositionLiquidatableCache memory cache;

        (cache.positionPnlUsd, ) = getPositionPnlUsd(
            dataStore,
            market,
            prices,
            position,
            prices.indexTokenPrice.pickPriceForPnl(position.isLong(), false),
            position.sizeInUsd()
        );

        cache.minCollateralFactor = MarketUtils.getMinCollateralFactor(dataStore, market.marketToken);

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(
            position.collateralToken(),
            market,
            prices
        );

        cache.collateralUsd = position.collateralAmount() * collateralTokenPrice.min;

        cache.priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                dataStore,
                market.marketToken,
                market.indexToken,
                market.longToken,
                market.shortToken,
                -position.sizeInUsd().toInt256(),
                position.isLong()
            )
        );

        // even if there is a large positive price impact, positions that would be liquidated
        // if the positive price impact is reduced should not be allowed to be created
        // as they would be easily liquidated if the price impact changes
        // cap the priceImpactUsd to zero to prevent these positions from being created
        if (cache.priceImpactUsd > 0) {
            cache.priceImpactUsd = 0;
        } else {
            uint256 maxPriceImpactFactor = MarketUtils.getMaxPositionImpactFactorForLiquidations(
                dataStore,
                market.marketToken
            );

            // if there is a large build up of open interest and a sudden large price movement
            // it may result in a large imbalance between longs and shorts
            // this could result in very large price impact temporarily
            // cap the max negative price impact to prevent cascading liquidations
            int256 maxNegativePriceImpactUsd = -Precision.applyFactor(position.sizeInUsd(), maxPriceImpactFactor).toInt256();
            if (cache.priceImpactUsd < maxNegativePriceImpactUsd) {
                cache.priceImpactUsd = maxNegativePriceImpactUsd;
            }
        }

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            dataStore,
            referralStorage,
            position,
            collateralTokenPrice,
            market.longToken,
            market.shortToken,
            position.sizeInUsd()
        );

        cache.remainingCollateralUsd = cache.collateralUsd.toInt256() + cache.positionPnlUsd + cache.priceImpactUsd - fees.totalNetCostUsd.toInt256();

        if (shouldValidateMinCollateralUsd) {
            cache.minCollateralUsd = dataStore.getUint(Keys.MIN_COLLATERAL_USD).toInt256();
            if (cache.remainingCollateralUsd < cache.minCollateralUsd) {
                return true;
            }
        }

        if (cache.remainingCollateralUsd <= 0) {
            return true;
        }

        // validate if (remaining collateral) / position.size is less than the min collateral factor (max leverage exceeded)
        cache.minCollateralUsdForLeverage = Precision.applyFactor(position.sizeInUsd(), cache.minCollateralFactor).toInt256();
        if (cache.remainingCollateralUsd < cache.minCollateralUsdForLeverage) {
            return true;
        }

        return false;
    }

    function willPositionCollateralBeSufficient(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        address collateralToken,
        bool isLong,
        WillPositionCollateralBeSufficientValues memory values
    ) public view returns (bool, int256) {
        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(
            collateralToken,
            market,
            prices
        );

        uint256 minCollateralFactor = MarketUtils.getMinCollateralFactorForOpenInterest(
            dataStore,
            market.marketToken,
            market.longToken,
            market.shortToken,
            values.openInterestDelta,
            isLong
        );

        int256 remainingCollateralUsd = values.positionCollateralAmount.toInt256() * collateralTokenPrice.min.toInt256();

        remainingCollateralUsd += values.positionPnlUsd;

        if (values.realizedPnlUsd < 0) {
            remainingCollateralUsd = remainingCollateralUsd + values.realizedPnlUsd;
        }

        if (remainingCollateralUsd < 0) {
            return (false, remainingCollateralUsd);
        }

        int256 minCollateralUsdForLeverage = Precision.applyFactor(values.positionSizeInUsd, minCollateralFactor).toInt256();
        bool willBeSufficient = remainingCollateralUsd >= minCollateralUsdForLeverage;

        return (willBeSufficient, remainingCollateralUsd);
    }

    function updateFundingAndBorrowingState(
        PositionUtils.UpdatePositionParams memory params,
        MarketUtils.MarketPrices memory prices
    ) internal {
        // update the funding amount per size for the market
        MarketUtils.updateFundingAmountPerSize(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market,
            prices
        );

        // update the cumulative borrowing factor for the market
        MarketUtils.updateCumulativeBorrowingFactor(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market,
            prices,
            params.order.isLong()
        );
    }

    function updateTotalBorrowing(
        PositionUtils.UpdatePositionParams memory params,
        uint256 nextPositionSizeInUsd,
        uint256 nextPositionBorrowingFactor
    ) internal {
        MarketUtils.updateTotalBorrowing(
            params.contracts.dataStore,
            params.market.marketToken,
            params.position.isLong(),
            params.position.borrowingFactor(),
            params.position.sizeInUsd(),
            nextPositionSizeInUsd,
            nextPositionBorrowingFactor
        );
    }

    function incrementClaimableFundingAmount(
        PositionUtils.UpdatePositionParams memory params,
        PositionPricingUtils.PositionFees memory fees
    ) internal {
        // if the position has negative funding fees, distribute it to allow it to be claimable
        if (fees.funding.claimableLongTokenAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.market.longToken,
                params.order.receiver(),
                fees.funding.claimableLongTokenAmount
            );
        }

        if (fees.funding.claimableShortTokenAmount > 0) {
            MarketUtils.incrementClaimableFundingAmount(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.market.shortToken,
                params.order.receiver(),
                fees.funding.claimableShortTokenAmount
            );
        }
    }

    function updateOpenInterest(
        PositionUtils.UpdatePositionParams memory params,
        int256 sizeDeltaUsd,
        int256 sizeDeltaInTokens
    ) internal {
        if (sizeDeltaUsd != 0) {
            MarketUtils.applyDeltaToOpenInterest(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.market.marketToken,
                params.market.indexToken,
                params.position.collateralToken(),
                params.position.isLong(),
                sizeDeltaUsd
            );

            MarketUtils.applyDeltaToOpenInterestInTokens(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.position.market(),
                params.position.collateralToken(),
                params.position.isLong(),
                sizeDeltaInTokens
            );
        }
    }

    function handleReferral(
        PositionUtils.UpdatePositionParams memory params,
        PositionPricingUtils.PositionFees memory fees
    ) internal {
        ReferralUtils.incrementAffiliateReward(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.position.market(),
            params.position.collateralToken(),
            fees.referral.affiliate,
            params.position.account(),
            fees.referral.affiliateRewardAmount
        );

        if (fees.referral.traderDiscountAmount > 0) {
            ReferralEventUtils.emitTraderReferralDiscountApplied(
                params.contracts.eventEmitter,
                params.position.market(),
                params.position.collateralToken(),
                params.position.account(),
                fees.referral.traderDiscountAmount
            );
        }
    }
}
