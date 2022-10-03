// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";

import "../data/DataStore.sol";
import "../fee/FeeReceiver.sol";

import "../oracle/Oracle.sol";
import "../pricing/PositionPricingUtils.sol";

import "./Position.sol";
import "./PositionStore.sol";
import "./PositionUtils.sol";

library IncreasePositionUtils {
    using Position for Position.Props;
    using Order for Order.Props;
    using SafeCast for uint256;
    using SafeCast for int256;

    struct IncreasePositionParams {
        DataStore dataStore;
        PositionStore positionStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        Market.Props market;
        Order.Props order;
        Position.Props position;
        bytes32 positionKey;
        address collateralToken;
        uint256 collateralDeltaAmount;
    }

    error InsufficientCollateralAmount();

    function increasePosition(IncreasePositionParams memory params) internal {
        Position.Props memory position = params.position;
        position.account = params.order.account();
        position.market = params.order.market();
        position.collateralToken = params.collateralToken;
        position.isLong = params.order.isLong();

        MarketUtils.MarketPrices memory prices = MarketUtils.getPricesForPosition(
            params.market,
            params.oracle
        );

        MarketUtils.updateCumulativeFundingFactors(params.dataStore, params.market.marketToken);
        MarketUtils.updateCumulativeBorrowingFactor(
            params.dataStore,
            params.market,
            prices,
            position.isLong
        );

        int256 collateralDeltaAmount = processCollateral(params, prices, position, params.collateralDeltaAmount.toInt256());

        if (collateralDeltaAmount < 0 && position.collateralAmount < SafeCast.toUint256(-collateralDeltaAmount)) {
            revert InsufficientCollateralAmount();
        }
        position.collateralAmount = Calc.sum(position.collateralAmount, collateralDeltaAmount);

        // round sizeDeltaInTokens down
        uint256 sizeDeltaInTokens = params.order.sizeDeltaUsd() / prices.indexTokenPrice;
        uint256 nextPositionSizeInUsd = position.sizeInUsd + params.order.sizeDeltaUsd();
        uint256 nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(params.dataStore, params.market.marketToken, position.isLong);

        MarketUtils.updateTotalBorrowing(
            params.dataStore,
            params.market.marketToken,
            position.isLong,
            position.borrowingFactor,
            position.sizeInUsd,
            nextPositionSizeInUsd,
            nextPositionBorrowingFactor
        );

        position.sizeInUsd = nextPositionSizeInUsd;
        position.sizeInTokens += sizeDeltaInTokens;
        position.fundingFactor = MarketUtils.getCumulativeFundingFactor(params.dataStore, params.market.marketToken, position.isLong);
        position.borrowingFactor = nextPositionBorrowingFactor;
        position.increasedAtBlock = block.number;

        params.positionStore.set(params.positionKey, params.order.account(), position);

        if (params.order.sizeDeltaUsd() > 0) {
            MarketUtils.updateOpenInterestInTokens(
                params.dataStore,
                params.order.market(),
                params.order.isLong(),
                sizeDeltaInTokens.toInt256()
            );
            MarketUtils.increaseOpenInterest(params.dataStore, params.order.market(), params.order.isLong(), params.order.sizeDeltaUsd());
            MarketUtils.validateReserve(params.dataStore, params.market, prices, params.order.isLong());
        }

        PositionUtils.validatePosition(
            params.dataStore,
            position,
            params.market,
            prices
        );
    }

    function processCollateral(
        IncreasePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        Position.Props memory position,
        int256 collateralDeltaAmount
    ) internal returns (int256) {
        uint256 collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.collateralToken, params.market, prices);

        int256 usdAdjustment = PositionPricingUtils.getPositionPricing(
            PositionPricingUtils.GetPositionPricingParams(
                params.dataStore,
                params.market.marketToken,
                params.market.longToken,
                params.market.shortToken,
                prices.longTokenPrice,
                prices.shortTokenPrice,
                params.order.sizeDeltaUsd().toInt256(),
                params.order.isLong()
            )
        );

        if (usdAdjustment < params.order.acceptableUsdAdjustment()) {
            revert(Keys.UNACCEPTABLE_USD_ADJUSTMENT_ERROR);
        }

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            params.dataStore,
            position,
            collateralTokenPrice,
            params.order.sizeDeltaUsd(),
            Keys.FEE_RECEIVER_POSITION_FACTOR
        );

        PricingUtils.transferFees(
            params.feeReceiver,
            params.market.marketToken,
            position.collateralToken,
            fees.feeReceiverAmount,
            FeeUtils.POSITION_FEE
        );

        if (usdAdjustment > 0) {
            // when there is a positive price impact factor, additional tokens from the swap impact pool
            // are withdrawn for the user to be used as additional collateral
            // for example, if 50,000 USDC is withdrawn and there is a positive price impact
            // an additional 100 USDC may be added to the user's collateral
            // the swap impact pool is decreased by the used amount
            uint256 positiveImpactAmount = MarketUtils.applyPositiveImpact(
                params.dataStore,
                params.market.marketToken,
                params.collateralToken,
                collateralTokenPrice,
                usdAdjustment
            );

            fees.totalNetCostAmount += positiveImpactAmount.toInt256();
        } else {
            // when there is a negative price impact factor,
            // less of the collateral amount is sent to the user's position
            // for example, if 10 ETH is sent as collateral and there is a negative price impact
            // only 9.995 ETH may be used for collateral
            // the remaining 0.005 ETH will be stored in the swap impact pool
            uint256 negativeImpactAmount = MarketUtils.applyNegativeImpact(
                params.dataStore,
                params.market.marketToken,
                params.collateralToken,
                collateralTokenPrice,
                usdAdjustment
            );

            fees.totalNetCostAmount -= negativeImpactAmount.toInt256();
        }

        collateralDeltaAmount += fees.totalNetCostAmount;

        if (collateralDeltaAmount > 0) {
            MarketUtils.increaseCollateralSum(params.dataStore, params.order.market(), params.collateralToken, params.order.isLong(), collateralDeltaAmount.toUint256());
        } else {
            MarketUtils.decreaseCollateralSum(params.dataStore, params.order.market(), params.collateralToken, params.order.isLong(), SafeCast.toUint256(-collateralDeltaAmount));
        }

        MarketUtils.increasePoolAmount(params.dataStore, params.market.marketToken, params.collateralToken, fees.feesForPool);

        return collateralDeltaAmount;
    }
}
