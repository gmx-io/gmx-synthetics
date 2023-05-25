// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";

import "../market/MarketStoreUtils.sol";

import "../deposit/DepositStoreUtils.sol";
import "../withdrawal/WithdrawalStoreUtils.sol";

import "../position/Position.sol";
import "../position/PositionUtils.sol";
import "../position/PositionStoreUtils.sol";

import "../order/OrderStoreUtils.sol";

import "../market/MarketUtils.sol";
import "../market/Market.sol";

struct PositionInfo {
    Position.Props position;
    PositionPricingUtils.PositionFees fees;
}

// @title ReaderUtils
// @dev Library for read utils functions
// convers some internal library functions into external functions to reduce
// the Reader contract size
library ReaderUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Price for Price.Props;
    using Position for Position.Props;

    struct GetPositionInfoCache {
        Position.Props position;
        Market.Props market;
        Price.Props collateralTokenPrice;
        uint256 pendingBorrowingFeeUsd;
        int256 latestLongTokenFundingAmountPerSize;
        int256 latestShortTokenFundingAmountPerSize;
    }

    function getNextBorrowingFees(
        DataStore dataStore,
        Position.Props memory position,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) internal view returns (uint256) {
        return MarketUtils.getNextBorrowingFees(
            dataStore,
            position,
            market,
            prices
        );
    }

    function getBorrowingFees(
        DataStore dataStore,
        Price.Props memory collateralTokenPrice,
        uint256 borrowingFeeUsd
    ) internal view returns (PositionPricingUtils.PositionBorrowingFees memory) {
        return PositionPricingUtils.getBorrowingFees(
            dataStore,
            collateralTokenPrice,
            borrowingFeeUsd
        );
    }

    function getNextFundingAmountPerSize(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) public view returns (MarketUtils.GetNextFundingAmountPerSizeResult memory) {
        return MarketUtils.getNextFundingAmountPerSize(
            dataStore,
            market,
            prices
        );
    }

    function getFundingFees(
        Position.Props memory position,
        address longToken,
        address shortToken,
        int256 latestLongTokenFundingAmountPerSize,
        int256 latestShortTokenFundingAmountPerSize
    ) internal pure returns (PositionPricingUtils.PositionFundingFees memory) {
        return PositionPricingUtils.getFundingFees(
            position,
            longToken,
            shortToken,
            latestLongTokenFundingAmountPerSize,
            latestShortTokenFundingAmountPerSize
        );
    }

    function getPositionInfo(
        DataStore dataStore,
        IReferralStorage referralStorage,
        bytes32 positionKey,
        MarketUtils.MarketPrices memory prices,
        uint256 sizeDeltaUsd,
        address uiFeeReceiver,
        bool usePositionSizeAsSizeDeltaUsd
    ) external view returns (PositionInfo memory) {
        GetPositionInfoCache memory cache;

        cache.position = PositionStoreUtils.get(dataStore, positionKey);
        cache.market = MarketStoreUtils.get(dataStore, cache.position.market());
        cache.collateralTokenPrice = MarketUtils.getCachedTokenPrice(cache.position.collateralToken(), cache.market, prices);

        if (usePositionSizeAsSizeDeltaUsd) {
            sizeDeltaUsd = cache.position.sizeInUsd();
        }

        PositionPricingUtils.GetPositionFeesParams memory getPositionFeesParams = PositionPricingUtils.GetPositionFeesParams(
            dataStore,
            referralStorage,
            cache.position,
            cache.collateralTokenPrice,
            cache.market.longToken,
            cache.market.shortToken,
            sizeDeltaUsd,
            uiFeeReceiver
        );

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(getPositionFeesParams);

        // borrowing and funding fees need to be overwritten with pending values otherwise they
        // would be using storage values that have not yet been updated
        cache.pendingBorrowingFeeUsd = getNextBorrowingFees(dataStore, cache.position, cache.market, prices);

        fees.borrowing = getBorrowingFees(
            dataStore,
            cache.collateralTokenPrice,
            cache.pendingBorrowingFeeUsd
        );

        MarketUtils.GetNextFundingAmountPerSizeResult memory nextFundingAmountResult = getNextFundingAmountPerSize(dataStore, cache.market, prices);

        if (cache.position.isLong()) {
            cache.latestLongTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_LongCollateral_LongPosition;
            cache.latestShortTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_ShortCollateral_LongPosition;
        } else {
            cache.latestLongTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_LongCollateral_ShortPosition;
            cache.latestShortTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_ShortCollateral_ShortPosition;
        }

        fees.funding = getFundingFees(
            cache.position,
            cache.market.longToken,
            cache.market.shortToken,
            cache.latestLongTokenFundingAmountPerSize,
            cache.latestShortTokenFundingAmountPerSize
        );

        return PositionInfo(cache.position, fees);
    }

    // returns amountOut, price impact, fees
    function getSwapAmountOut(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        address tokenIn,
        uint256 amountIn,
        address uiFeeReceiver
    ) external view returns (uint256, int256, SwapPricingUtils.SwapFees memory) {
        SwapUtils.SwapCache memory cache;

        if (tokenIn != market.longToken && tokenIn != market.shortToken) {
            revert Errors.InvalidTokenIn(tokenIn, market.marketToken);
        }

        MarketUtils.validateSwapMarket(market);

        cache.tokenOut = MarketUtils.getOppositeToken(tokenIn, market);
        cache.tokenInPrice = MarketUtils.getCachedTokenPrice(tokenIn, market, prices);
        cache.tokenOutPrice = MarketUtils.getCachedTokenPrice(cache.tokenOut, market, prices);

        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            dataStore,
            market.marketToken,
            amountIn,
            uiFeeReceiver
        );

        int256 priceImpactUsd = SwapPricingUtils.getPriceImpactUsd(
            SwapPricingUtils.GetPriceImpactUsdParams(
                dataStore,
                market,
                tokenIn,
                cache.tokenOut,
                cache.tokenInPrice.midPrice(),
                cache.tokenOutPrice.midPrice(),
                (fees.amountAfterFees * cache.tokenInPrice.midPrice()).toInt256(),
                -(fees.amountAfterFees * cache.tokenInPrice.midPrice()).toInt256()
            )
        );

        int256 impactAmount;

        if (priceImpactUsd > 0) {
            // when there is a positive price impact factor, additional tokens from the swap impact pool
            // are withdrawn for the user
            // for example, if 50,000 USDC is swapped out and there is a positive price impact
            // an additional 100 USDC may be sent to the user
            // the swap impact pool is decreased by the used amount

            cache.amountIn = fees.amountAfterFees;
            // round amountOut down
            cache.amountOut = cache.amountIn * cache.tokenInPrice.min / cache.tokenOutPrice.max;
            cache.poolAmountOut = cache.amountOut;

            impactAmount = MarketUtils.getSwapImpactAmountWithCap(
                dataStore,
                market.marketToken,
                cache.tokenOut,
                cache.tokenOutPrice,
                priceImpactUsd
            );

            cache.amountOut += impactAmount.toUint256();
        } else {
            // when there is a negative price impact factor,
            // less of the input amount is sent to the pool
            // for example, if 10 ETH is swapped in and there is a negative price impact
            // only 9.995 ETH may be swapped in
            // the remaining 0.005 ETH will be stored in the swap impact pool

            impactAmount = MarketUtils.getSwapImpactAmountWithCap(
                dataStore,
                market.marketToken,
                tokenIn,
                cache.tokenInPrice,
                priceImpactUsd
            );

            cache.amountIn = fees.amountAfterFees - (-impactAmount).toUint256();
            cache.amountOut = cache.amountIn * cache.tokenInPrice.min / cache.tokenOutPrice.max;
            cache.poolAmountOut = cache.amountOut;
        }

        return (cache.amountOut, impactAmount, fees);
    }

    struct ExecutionPriceResult {
        int256 priceImpactUsdBeforeCap;
        int256 priceImpactUsdAfterCap;
        int256 priceImpactUsd;
        uint256 priceImpactDiffUsd;
        uint256 executionPrice;
    }

    function getExecutionPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory indexTokenPrice,
        uint256 positionSizeInUsd,
        uint256 positionSizeInTokens,
        int256 sizeDeltaUsd,
        bool isLong
    ) external view returns (ExecutionPriceResult memory result) {
        result.priceImpactUsdBeforeCap = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                dataStore,
                market,
                sizeDeltaUsd,
                isLong
            )
        );
        result.priceImpactUsdAfterCap = MarketUtils.getCappedPositionImpactUsd(
            dataStore,
            market.marketToken,
            indexTokenPrice,
            result.priceImpactUsdBeforeCap,
            (sizeDeltaUsd < 0 ? -sizeDeltaUsd : sizeDeltaUsd).toUint256()
        );

        result.priceImpactUsd = result.priceImpactUsdAfterCap;
        if (result.priceImpactUsd < 0) {
            uint256 maxPriceImpactFactor = MarketUtils.getMaxPositionImpactFactor(
                dataStore,
                market.marketToken,
                false
            );

            // convert the max price impact to the min negative value
            int256 minPriceImpactUsd = -Precision.applyFactor(
                (sizeDeltaUsd < 0 ? -sizeDeltaUsd : sizeDeltaUsd).toUint256(),
                maxPriceImpactFactor
            ).toInt256();

            if (result.priceImpactUsd < minPriceImpactUsd) {
                result.priceImpactDiffUsd = (minPriceImpactUsd - result.priceImpactUsd).toUint256();
                result.priceImpactUsd = minPriceImpactUsd;
            }
        }

        bool isIncrease = sizeDeltaUsd > 0;
        bool shouldPriceBeSmaller = isIncrease ? isLong : !isLong;
        result.executionPrice = BaseOrderUtils.getExecutionPrice(
            indexTokenPrice,
            positionSizeInUsd,
            positionSizeInTokens,
            (sizeDeltaUsd < 0 ? -sizeDeltaUsd : sizeDeltaUsd).toUint256(),
            result.priceImpactUsd,
            shouldPriceBeSmaller ? type(uint256).max : 0,
            isLong,
            isIncrease
        );

        return result;
    }

    function getSwapPriceImpact(
        DataStore dataStore,
        Market.Props memory market,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        Price.Props memory tokenInPrice,
        Price.Props memory tokenOutPrice
    ) external view returns (int256 priceImpactUsdBeforeCap, int256 priceImpactAmount) {
        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            dataStore,
            market.marketToken,
            amountIn,
            address(0)
        );

        priceImpactUsdBeforeCap = SwapPricingUtils.getPriceImpactUsd(
            SwapPricingUtils.GetPriceImpactUsdParams(
                dataStore,
                market,
                tokenIn,
                tokenOut,
                tokenInPrice.midPrice(),
                tokenOutPrice.midPrice(),
                (fees.amountAfterFees * tokenInPrice.midPrice()).toInt256(),
                -(fees.amountAfterFees * tokenInPrice.midPrice()).toInt256()
            )
        );

        if (priceImpactUsdBeforeCap > 0) {
            priceImpactAmount = MarketUtils.getSwapImpactAmountWithCap(
                dataStore,
                market.marketToken,
                tokenOut,
                tokenOutPrice,
                priceImpactUsdBeforeCap
            );
        } else {
            priceImpactAmount = MarketUtils.getSwapImpactAmountWithCap(
                dataStore,
                market.marketToken,
                tokenIn,
                tokenInPrice,
                priceImpactUsdBeforeCap
            );
        }

        return (priceImpactUsdBeforeCap, priceImpactAmount);
    }
}
