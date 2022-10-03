// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../pricing/SwapPricingUtils.sol";

library SwapUtils {
    using SafeCast for uint256;

    struct SwapParams {
        DataStore dataStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        address tokenIn;
        uint256 amountIn;
        Market.Props[] markets;
        uint256 minOutputAmount;
        address receiver;
    }

    struct _SwapParams {
        Market.Props market;
        address tokenIn;
        uint256 amountIn;
        address receiver;
    }

    struct _SwapCache {
        address tokenOut;
        uint256 tokenInPrice;
        uint256 tokenOutPrice;
        uint256 amountIn;
        uint256 amountOut;
        uint256 poolAmountOut;
    }

    // returns tokenOut, outputAmount
    function swap(SwapParams memory params) external returns (address, uint256) {
        address tokenOut = params.tokenIn;
        uint256 outputAmount = params.amountIn;

        for (uint256 i = 0; i < params.markets.length; i++) {
            Market.Props memory market = params.markets[i];
            uint256 nextIndex = i + 1;
            address receiver;
            if (nextIndex < params.markets.length) {
                receiver = params.markets[nextIndex].marketToken;
            } else {
                receiver = params.receiver;
            }

            _SwapParams memory _params = _SwapParams(
                market,
                tokenOut,
                outputAmount,
                receiver
            );
            (tokenOut, outputAmount) = _swap(params, _params);
        }

        if (outputAmount < params.minOutputAmount) {
            revert(Keys.INSUFFICIENT_SWAP_OUTPUT_AMOUNT_ERROR);
        }

        return (tokenOut, outputAmount);
    }

    function _swap(SwapParams memory params, _SwapParams memory _params) internal returns (address, uint256) {
        _SwapCache memory cache;

        cache.tokenOut = MarketUtils.getOutputToken(_params.tokenIn, _params.market);
        cache.tokenInPrice = params.oracle.getPrimaryPrice(_params.tokenIn);
        cache.tokenOutPrice = params.oracle.getPrimaryPrice(cache.tokenOut);

        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            _params.market.marketToken,
            _params.amountIn,
            Keys.FEE_RECEIVER_SWAP_FACTOR
        );

        PricingUtils.transferFees(
            params.feeReceiver,
            _params.market.marketToken,
            _params.tokenIn,
            fees.feeReceiverAmount,
            FeeUtils.SWAP_FEE
        );

        int256 usdAdjustment = SwapPricingUtils.getSwapPricing(SwapPricingUtils.GetSwapPricingParams(
            params.dataStore,
            _params.market.marketToken,
            _params.tokenIn,
            cache.tokenOut,
            cache.tokenInPrice,
            cache.tokenOutPrice,
            (fees.amountAfterFees * cache.tokenInPrice).toInt256(),
            -(fees.amountAfterFees * cache.tokenInPrice).toInt256()
        ));

        if (usdAdjustment > 0) {
            cache.amountIn = fees.amountAfterFees;
            cache.amountOut = cache.amountIn * cache.tokenInPrice / cache.tokenOutPrice;
            cache.poolAmountOut = cache.amountOut;

            // when there is a positive price impact factor, additional tokens from the swap impact pool
            // are withdrawn for the user
            // for example, if 50,000 USDC is swapped out and there is a positive price impact
            // an additional 100 USDC may be sent to the user
            // the swap impact pool is decreased by the used amount
            uint256 positiveImpactAmount = MarketUtils.applyPositiveImpact(
                params.dataStore,
                _params.market.marketToken,
                cache.tokenOut,
                cache.tokenOutPrice,
                usdAdjustment
            );

            cache.amountOut += positiveImpactAmount;
        } else {
            // when there is a negative price impact factor,
            // less of the input amount is sent to the pool
            // for example, if 10 ETH is swapped in and there is a negative price impact
            // only 9.995 ETH may be swapped in
            // the remaining 0.005 ETH will be stored in the swap impact pool
            uint256 negativeImpactAmount = MarketUtils.applyNegativeImpact(
                params.dataStore,
                _params.market.marketToken,
                _params.tokenIn,
                cache.tokenInPrice,
                usdAdjustment
            );

            cache.amountIn = fees.amountAfterFees - negativeImpactAmount;
            cache.amountOut = cache.amountIn * cache.tokenInPrice / cache.tokenOutPrice;
            cache.poolAmountOut = cache.amountOut;
        }

        if (_params.receiver != address(0)) {
            MarketToken(_params.market.marketToken).transferOut(cache.tokenOut, cache.poolAmountOut, _params.receiver);
        }

        MarketUtils.increasePoolAmount(params.dataStore, _params.market.marketToken, _params.tokenIn, cache.amountIn + fees.feesForPool);
        MarketUtils.decreasePoolAmount(params.dataStore, _params.market.marketToken, cache.tokenOut, cache.poolAmountOut);
        MarketUtils.validateReserve(
            params.dataStore,
            _params.market,
            MarketUtils.MarketPrices(
                params.oracle.getPrimaryPrice(_params.market.indexToken),
                _params.tokenIn == _params.market.longToken ? cache.tokenInPrice : cache.tokenOutPrice,
                _params.tokenIn == _params.market.shortToken ? cache.tokenInPrice : cache.tokenOutPrice
            ),
            cache.tokenOut == _params.market.longToken
        );

        return (cache.tokenOut, cache.amountOut);
    }
}
