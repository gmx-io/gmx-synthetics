// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";

import "../data/DataStore.sol";
import "../events/EventEmitter.sol";
import "../fee/FeeReceiver.sol";

import "../oracle/Oracle.sol";
import "../pricing/PositionPricingUtils.sol";

import "./Position.sol";
import "./PositionStore.sol";
import "./PositionUtils.sol";
import "../order/OrderBaseUtils.sol";

library IncreasePositionUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    struct IncreasePositionParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
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

    struct _IncreasePositionCache {
        int256 collateralDeltaAmount;
        int256 priceImpactUsd;
        uint256 customIndexTokenPrice;
        uint256 sizeDeltaInTokens;
        uint256 nextPositionSizeInUsd;
        uint256 nextPositionBorrowingFactor;
    }

    error InsufficientCollateralAmount();

    function increasePosition(IncreasePositionParams memory params) external {
        Position.Props memory position = params.position;
        position.account = params.order.account();
        position.market = params.order.market();
        position.collateralToken = params.collateralToken;
        position.isLong = params.order.isLong();

        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPricesForPosition(
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

        _IncreasePositionCache memory cache;
        cache.collateralDeltaAmount = processCollateral(params, prices, position, params.collateralDeltaAmount.toInt256());

        if (cache.collateralDeltaAmount < 0 && position.collateralAmount < SafeCast.toUint256(-cache.collateralDeltaAmount)) {
            revert InsufficientCollateralAmount();
        }
        position.collateralAmount = Calc.sum(position.collateralAmount, cache.collateralDeltaAmount);

        cache.priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.dataStore,
                params.market.marketToken,
                params.market.longToken,
                params.market.shortToken,
                params.order.sizeDeltaUsd().toInt256(),
                params.order.isLong()
            )
        );

        // round sizeDeltaInTokens down
        cache.customIndexTokenPrice = OrderBaseUtils.getExecutionPrice(
            params.oracle.getCustomPrice(params.market.indexToken),
            params.order.sizeDeltaUsd(),
            cache.priceImpactUsd,
            params.order.acceptablePrice(),
            position.isLong,
            true
        );

        cache.sizeDeltaInTokens = params.order.sizeDeltaUsd() / cache.customIndexTokenPrice;
        cache.nextPositionSizeInUsd = position.sizeInUsd + params.order.sizeDeltaUsd();
        cache.nextPositionBorrowingFactor = MarketUtils.getCumulativeBorrowingFactor(params.dataStore, params.market.marketToken, position.isLong);

        MarketUtils.updateTotalBorrowing(
            params.dataStore,
            params.market.marketToken,
            position.isLong,
            position.borrowingFactor,
            position.sizeInUsd,
            cache.nextPositionSizeInUsd,
            cache.nextPositionBorrowingFactor
        );

        position.sizeInUsd = cache.nextPositionSizeInUsd;
        position.sizeInTokens += cache.sizeDeltaInTokens;
        position.fundingFactor = MarketUtils.getCumulativeFundingFactor(params.dataStore, params.market.marketToken, position.isLong);
        position.borrowingFactor = cache.nextPositionBorrowingFactor;
        position.increasedAtBlock = block.number;

        params.positionStore.set(params.positionKey, params.order.account(), position);

        if (params.order.sizeDeltaUsd() > 0) {
            MarketUtils.updateOpenInterestInTokens(
                params.dataStore,
                params.order.market(),
                params.order.isLong(),
                cache.sizeDeltaInTokens.toInt256()
            );
            MarketUtils.increaseOpenInterest(
                params.dataStore,
                params.eventEmitter,
                params.order.market(),
                params.order.isLong(),
                params.order.sizeDeltaUsd()
            );
            MarketUtils.validateReserve(params.dataStore, params.market, prices, params.order.isLong());
        }

        PositionUtils.validatePosition(
            params.dataStore,
            position,
            params.market,
            prices
        );

        params.eventEmitter.emitPositionIncrease(
            params.positionKey,
            position.account,
            position.market,
            position.collateralToken,
            position.isLong,
            cache.customIndexTokenPrice,
            params.order.sizeDeltaUsd(),
            cache.collateralDeltaAmount
        );
    }

    function processCollateral(
        IncreasePositionParams memory params,
        MarketUtils.MarketPrices memory prices,
        Position.Props memory position,
        int256 collateralDeltaAmount
    ) internal returns (int256) {
        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(params.collateralToken, params.market, prices);

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

        collateralDeltaAmount += fees.totalNetCostAmount;

        if (collateralDeltaAmount > 0) {
            MarketUtils.increaseCollateralSum(
                params.dataStore,
                params.eventEmitter,
                params.order.market(),
                params.collateralToken,
                params.order.isLong(),
                collateralDeltaAmount.toUint256()
            );
        } else {
            MarketUtils.decreaseCollateralSum(
                params.dataStore,
                params.eventEmitter,
                params.order.market(),
                params.collateralToken,
                params.order.isLong(),
                SafeCast.toUint256(-collateralDeltaAmount)
            );
        }

        MarketUtils.increasePoolAmount(
            params.dataStore,
            params.eventEmitter,
            params.market.marketToken,
            params.collateralToken,
            fees.feesForPool
        );

        params.eventEmitter.emitPositionFeesCollected(true, fees);

        return collateralDeltaAmount;
    }
}
