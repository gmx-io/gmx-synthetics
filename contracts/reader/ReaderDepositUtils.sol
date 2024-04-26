// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SignedMath.sol";

import "../data/Keys.sol";

import "../market/MarketStoreUtils.sol";

import "../deposit/DepositStoreUtils.sol";
import "../withdrawal/WithdrawalStoreUtils.sol";

import "../position/Position.sol";
import "../position/PositionUtils.sol";
import "../position/PositionStoreUtils.sol";
import "../position/IncreasePositionUtils.sol";
import "../position/DecreasePositionUtils.sol";

import "../order/OrderStoreUtils.sol";

import "../market/MarketUtils.sol";
import "../market/Market.sol";
import "./ReaderPricingUtils.sol";

library ReaderDepositUtils {
    using SignedMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using Price for Price.Props;
    using Position for Position.Props;
    using Order for Order.Props;

    struct GetDepositAmountOutForSingleTokenParams {
        DataStore dataStore;
        Market.Props market;
        MarketUtils.MarketPrices prices;
        address tokenIn;
        Price.Props tokenInPrice;
        address tokenOut;
        Price.Props tokenOutPrice;
        uint256 amount;
        int256 priceImpactUsd;
        address uiFeeReceiver;
        bool forShift;
    }

    function getDepositAmountOut(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        uint256 longTokenAmount,
        uint256 shortTokenAmount,
        address uiFeeReceiver,
        bool forShift
    ) external view returns (uint256) {
        uint256 longTokenUsd = longTokenAmount * prices.longTokenPrice.midPrice();
        uint256 shortTokenUsd = shortTokenAmount * prices.shortTokenPrice.midPrice();
        int256 priceImpactUsd = SwapPricingUtils.getPriceImpactUsd(
            SwapPricingUtils.GetPriceImpactUsdParams(
                dataStore,
                market,
                market.longToken,
                market.shortToken,
                prices.longTokenPrice.midPrice(),
                prices.shortTokenPrice.midPrice(),
                longTokenUsd.toInt256(),
                shortTokenUsd.toInt256()
            )
        );

        uint256 mintAmount;

        mintAmount += getDepositAmountOutForSingleToken(
            GetDepositAmountOutForSingleTokenParams(
                dataStore,
                market,
                prices,
                market.longToken,
                prices.longTokenPrice,
                market.shortToken,
                prices.shortTokenPrice,
                longTokenAmount,
                Precision.mulDiv(priceImpactUsd, longTokenUsd, longTokenUsd + shortTokenUsd),
                uiFeeReceiver,
                forShift
            )
        );

        mintAmount += getDepositAmountOutForSingleToken(
            GetDepositAmountOutForSingleTokenParams(
                dataStore,
                market,
                prices,
                market.shortToken,
                prices.shortTokenPrice,
                market.longToken,
                prices.longTokenPrice,
                shortTokenAmount,
                Precision.mulDiv(priceImpactUsd, shortTokenUsd, longTokenUsd + shortTokenUsd),
                uiFeeReceiver,
                forShift
            )
        );

        return mintAmount;
    }

    function getDepositAmountOutForSingleToken(
        GetDepositAmountOutForSingleTokenParams memory params
    ) public view returns (uint256) {
        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            params.market.marketToken,
            params.amount,
            params.priceImpactUsd > 0, // forPositiveImpact
            params.uiFeeReceiver, // uiFeeReceiver
            params.forShift
        );

        uint256 mintAmount;

        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            params.market,
            params.prices.indexTokenPrice,
            params.prices.longTokenPrice,
            params.prices.shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true
        );

        if (poolValueInfo.poolValue < 0) {
            revert Errors.InvalidPoolValueForDeposit(poolValueInfo.poolValue);
        }

        uint256 poolValue = poolValueInfo.poolValue.toUint256();

        uint256 marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(params.market.marketToken)));

        if (poolValueInfo.poolValue == 0 && marketTokensSupply > 0) {
            revert Errors.InvalidPoolValueForDeposit(poolValueInfo.poolValue);
        }

        if (params.priceImpactUsd > 0 && marketTokensSupply == 0) {
            params.priceImpactUsd = 0;
        }

        if (params.priceImpactUsd > 0) {
            int256 positiveImpactAmount = MarketUtils.getSwapImpactAmountWithCap(
                params.dataStore,
                params.market.marketToken,
                params.tokenOut,
                params.tokenOutPrice,
                params.priceImpactUsd
            );

            mintAmount += MarketUtils.usdToMarketTokenAmount(
                positiveImpactAmount.toUint256() * params.tokenOutPrice.max,
                poolValue,
                marketTokensSupply
            );
        }

        if (params.priceImpactUsd < 0) {
            int256 negativeImpactAmount = MarketUtils.getSwapImpactAmountWithCap(
                params.dataStore,
                params.market.marketToken,
                params.tokenIn,
                params.tokenInPrice,
                params.priceImpactUsd
            );

            fees.amountAfterFees -= (-negativeImpactAmount).toUint256();
        }

        mintAmount += MarketUtils.usdToMarketTokenAmount(
            fees.amountAfterFees * params.tokenInPrice.min,
            poolValue,
            marketTokensSupply
        );

        return mintAmount;
    }
}
