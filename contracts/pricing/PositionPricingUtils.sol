// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../market/MarketUtils.sol";

import "../utils/Precision.sol";
import "../utils/Calc.sol";

import "./PricingUtils.sol";

library PositionPricingUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    struct GetPositionPricingParams {
        DataStore dataStore;
        address market;
        address longToken;
        address shortToken;
        uint256 longTokenPrice;
        uint256 shortTokenPrice;
        int256 usdDelta;
        bool isLong;
    }

    struct OpenInterestParams {
        uint256 longOpenInterest;
        uint256 shortOpenInterest;
        uint256 nextLongOpenInterest;
        uint256 nextShortOpenInterest;
    }

    struct PositionFees {
        uint256 feeReceiverAmount;
        uint256 feesForPool;
        uint256 amountForPool;
        uint256 positionFeeAmount;
        uint256 spreadAmount;
        int256 fundingFeeAmount;
        uint256 borrowingFeeAmount;
        int256 totalNetCostAmount;
    }

    // returns (usd adjustment)
    function getPositionPricing(GetPositionPricingParams memory params) internal view returns (int256) {
        OpenInterestParams memory openInterestParams = getNextOpenInterest(params);

        int256 usdAdjustment = getUsdAdjustment(params.dataStore, params.market, openInterestParams);

        return usdAdjustment;
    }

    function getUsdAdjustment(DataStore dataStore, address market, OpenInterestParams memory openInterestParams) internal view returns (int256) {
        uint256 initialDiffUsd = Calc.diff(openInterestParams.longOpenInterest, openInterestParams.shortOpenInterest);
        uint256 nextDiffUsd = Calc.diff(openInterestParams.nextLongOpenInterest, openInterestParams.nextShortOpenInterest);

        // check whether an improvement in balance comes from causing the balance to switch sides
        // for example, if there is $2000 of ETH and $1000 of USDC in the pool
        // adding $1999 USDC into the pool will reduce absolute balance from $1000 to $999 but it does not
        // help rebalance the pool much, the isSameSideRebalance value helps avoid gaming using this case
        bool isSameSideRebalance = openInterestParams.longOpenInterest <= openInterestParams.shortOpenInterest == openInterestParams.nextLongOpenInterest <= openInterestParams.nextShortOpenInterest;
        uint256 impactExponentFactor = dataStore.getUint(Keys.positionImpactExponentFactorKey(market));

        if (isSameSideRebalance) {
            bool hasPositiveImpact = nextDiffUsd < initialDiffUsd;
            uint256 impactFactor = dataStore.getUint(Keys.positionImpactFactorKey(market, hasPositiveImpact));

            return PricingUtils.getUsdAdjustmentForSameSideRebalance(
                initialDiffUsd,
                nextDiffUsd,
                hasPositiveImpact,
                impactFactor,
                impactExponentFactor
            );
        } else {
            uint256 positiveImpactFactor = dataStore.getUint(Keys.positionImpactFactorKey(market, true));
            uint256 negativeImpactFactor = dataStore.getUint(Keys.positionImpactFactorKey(market, false));

            return PricingUtils.getUsdAdjustmentForCrossoverRebalance(
                initialDiffUsd,
                nextDiffUsd,
                positiveImpactFactor,
                negativeImpactFactor,
                impactExponentFactor
            );
        }
    }

    function getNextOpenInterest(
        GetPositionPricingParams memory params
    ) internal view returns (OpenInterestParams memory) {
        uint256 longOpenInterest = MarketUtils.getOpenInterest(params.dataStore, params.market, true);
        uint256 shortOpenInterest = MarketUtils.getOpenInterest(params.dataStore, params.market, false);

        uint256 nextLongOpenInterest;
        uint256 nextShortOpenInterest;

        if (params.isLong) {
            nextLongOpenInterest = Calc.sum(longOpenInterest, params.usdDelta);
        } else {
            nextShortOpenInterest = Calc.sum(shortOpenInterest, params.usdDelta);
        }

        OpenInterestParams memory openInterestParams = OpenInterestParams(
            longOpenInterest,
            shortOpenInterest,
            nextLongOpenInterest,
            nextShortOpenInterest
        );

        return openInterestParams;
    }

    function transferPositionFees(
        FeeReceiver feeReceiver,
        MarketToken marketToken,
        Position.Props memory position,
        bytes32 feeType,
        PositionFees memory fees
    ) internal returns (PositionFees memory) {
        if (fees.feeReceiverAmount > 0) {
            marketToken.transferOut(position.collateralToken, fees.feeReceiverAmount, address(feeReceiver));
            feeReceiver.notifyFeeReceived(feeType, position.collateralToken, fees.feeReceiverAmount);
        }

        return fees;
    }

    function getPositionFees(
        DataStore dataStore,
        Position.Props memory position,
        uint256 collateralTokenPrice,
        uint256 sizeDeltaUsd,
        bytes32 feeReceiverFactorKey
    ) internal view returns (PositionFees memory) {
        PositionFees memory fees;

        uint256 feeFactor = dataStore.getUint(Keys.positionFeeFactorKey(position.market));
        uint256 feeReceiverFactor = dataStore.getUint(feeReceiverFactorKey);
        uint256 spreadFactor = dataStore.getUint(Keys.positionSpreadFactorKey(position.market));

        fees.positionFeeAmount = Precision.applyFactor(sizeDeltaUsd, feeFactor) / collateralTokenPrice;
        fees.spreadAmount = Precision.applyFactor(sizeDeltaUsd, spreadFactor) / collateralTokenPrice;
        fees.fundingFeeAmount = MarketUtils.getFundingFees(dataStore, position) / collateralTokenPrice.toInt256();
        fees.borrowingFeeAmount = MarketUtils.getBorrowingFees(dataStore, position) / collateralTokenPrice;

        fees.feeReceiverAmount = Precision.applyFactor(fees.positionFeeAmount, feeReceiverFactor);
        fees.feesForPool = fees.spreadAmount + fees.positionFeeAmount + fees.borrowingFeeAmount - fees.feeReceiverAmount;
        fees.totalNetCostAmount = fees.fundingFeeAmount - (fees.positionFeeAmount + fees.spreadAmount + fees.borrowingFeeAmount).toInt256();

        return fees;
    }
}
