// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../market/MarketUtils.sol";

import "../utils/Precision.sol";
import "../utils/Calc.sol";

import "./PricingUtils.sol";

import "../referral/IReferralStorage.sol";
import "../referral/ReferralUtils.sol";

library PositionPricingUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    struct GetPriceImpactUsdParams {
        DataStore dataStore;
        address market;
        address longToken;
        address shortToken;
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
        address affiliate;
        uint256 traderDiscountAmount;
        uint256 affiliateRewardAmount;
        uint256 feeReceiverAmount;
        uint256 feesForPool;
        uint256 positionFeeAmountForPool;
        uint256 positionFeeAmount;
        uint256 fundingFeeAmount;
        int256 latestLongTokenFundingAmountPerSize;
        int256 latestShortTokenFundingAmountPerSize;
        int256 longTokenFundingFeeAmount;
        int256 shortTokenFundingFeeAmount;
        uint256 borrowingFeeAmount;
        uint256 totalNetCostAmount;
        uint256 totalNetCostUsd;
        bool hasPendingLongTokenFundingFee;
        bool hasPendingShortTokenFundingFee;
    }

    struct _GetPositionFeesAfterReferralCache {
        address affiliate;
        uint256 totalRebateFactor;
        uint256 traderDiscountFactor;
        uint256 feeFactor;
        uint256 positionFeeAmount;
        uint256 totalRebateAmount;
        uint256 traderDiscountAmount;
        uint256 affiliateRewardAmount;
        uint256 protocolFeeAmount;
        uint256 feeReceiverFactor;
        uint256 feeReceiverAmount;
        uint256 positionFeeAmountForPool;
    }

    function getPriceImpactAmount(
        uint256 size,
        uint256 executionPrice,
        uint256 latestPrice,
        bool isLong,
        bool isIncrease
    ) internal pure returns (int256) {
        // increase order:
        //     - long: price impact is size * (latestPrice - executionPrice) / latestPrice
        //             when executionPrice is smaller than latestPrice there is a positive price impact
        //     - short: price impact is size * (executionPrice - latestPrice) / latestPrice
        //              when executionPrice is larger than latestPrice there is a positive price impact
        // decrease order:
        //     - long: price impact is size * (executionPrice - latestPrice) / latestPrice
        //             when executionPrice is larger than latestPrice there is a positive price impact
        //     - short: price impact is size * (latestPrice - executionPrice) / latestPrice
        //              when executionPrice is smaller than latestPrice there is a positive price impact
        int256 priceDiff = latestPrice.toInt256() - executionPrice.toInt256();
        bool shouldFlipPriceDiff = isIncrease ? !isLong : isLong;
        if (shouldFlipPriceDiff) { priceDiff = -priceDiff; }

        int256 priceImpactUsd = size.toInt256() * priceDiff / latestPrice.toInt256();

        // round positive price impact up, this will be deducted from the position impact pool
        if (priceImpactUsd > 0) {
            return Calc.roundUpDivision(priceImpactUsd, latestPrice);
        }

        // round negative price impact down, this will be stored in the position impact pool
        return priceImpactUsd / latestPrice.toInt256();
    }

    function getPriceImpactUsd(GetPriceImpactUsdParams memory params) internal view returns (int256) {
        OpenInterestParams memory openInterestParams = getNextOpenInterest(params);

        int256 priceImpactUsd = _getPriceImpactUsd(params.dataStore, params.market, openInterestParams);

        return priceImpactUsd;
    }

    function _getPriceImpactUsd(DataStore dataStore, address market, OpenInterestParams memory openInterestParams) internal view returns (int256) {
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

            return PricingUtils.getPriceImpactUsdForSameSideRebalance(
                initialDiffUsd,
                nextDiffUsd,
                hasPositiveImpact,
                impactFactor,
                impactExponentFactor
            );
        } else {
            uint256 positiveImpactFactor = dataStore.getUint(Keys.positionImpactFactorKey(market, true));
            uint256 negativeImpactFactor = dataStore.getUint(Keys.positionImpactFactorKey(market, false));

            return PricingUtils.getPriceImpactUsdForCrossoverRebalance(
                initialDiffUsd,
                nextDiffUsd,
                positiveImpactFactor,
                negativeImpactFactor,
                impactExponentFactor
            );
        }
    }

    function getNextOpenInterest(
        GetPriceImpactUsdParams memory params
    ) internal view returns (OpenInterestParams memory) {
        uint256 longOpenInterest = MarketUtils.getOpenInterest(
            params.dataStore,
            params.market,
            params.longToken,
            params.shortToken,
            true);

        uint256 shortOpenInterest = MarketUtils.getOpenInterest(
            params.dataStore,
            params.market,
            params.longToken,
            params.shortToken,
            false
        );

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
        DataStore dataStore,
        FeeReceiver feeReceiver,
        MarketToken marketToken,
        Position.Props memory position,
        bytes32 feeType,
        PositionFees memory fees
    ) internal returns (PositionFees memory) {
        if (fees.feeReceiverAmount > 0) {
            marketToken.transferOut(
                dataStore,
                position.collateralToken,
                fees.feeReceiverAmount,
                address(feeReceiver)
            );
            feeReceiver.notifyFeeReceived(feeType, position.collateralToken, fees.feeReceiverAmount);
        }

        return fees;
    }

    function getPositionFees(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Position.Props memory position,
        Price.Props memory collateralTokenPrice,
        address longToken,
        address shortToken,
        uint256 sizeDeltaUsd
    ) internal view returns (PositionFees memory) {
        PositionFees memory fees;

        (
            fees.affiliate,
            fees.traderDiscountAmount,
            fees.affiliateRewardAmount,
            fees.feeReceiverAmount,
            fees.positionFeeAmountForPool
        ) = getPositionFeesAfterReferral(
            dataStore,
            referralStorage,
            collateralTokenPrice,
            position.account,
            position.market,
            sizeDeltaUsd
        );

        fees.borrowingFeeAmount = MarketUtils.getBorrowingFees(dataStore, position) / collateralTokenPrice.min;

        fees.feesForPool = fees.positionFeeAmountForPool + fees.borrowingFeeAmount;

        fees.latestLongTokenFundingAmountPerSize = MarketUtils.getFundingAmountPerSize(dataStore, position.market, longToken, position.isLong);
        fees.latestShortTokenFundingAmountPerSize = MarketUtils.getFundingAmountPerSize(dataStore, position.market, shortToken, position.isLong);

        (fees.hasPendingLongTokenFundingFee, fees.longTokenFundingFeeAmount) = MarketUtils.getFundingFeeAmount(fees.latestLongTokenFundingAmountPerSize, position.longTokenFundingAmountPerSize, position.sizeInUsd);
        (fees.hasPendingShortTokenFundingFee, fees.shortTokenFundingFeeAmount) = MarketUtils.getFundingFeeAmount(fees.latestShortTokenFundingAmountPerSize, position.shortTokenFundingAmountPerSize, position.sizeInUsd);

        if (position.collateralToken == longToken && fees.longTokenFundingFeeAmount > 0) {
            fees.fundingFeeAmount = fees.longTokenFundingFeeAmount.toUint256();
        }
        if (position.collateralToken == shortToken && fees.shortTokenFundingFeeAmount > 0) {
            fees.fundingFeeAmount = fees.shortTokenFundingFeeAmount.toUint256();
        }

        fees.totalNetCostAmount = fees.affiliateRewardAmount + fees.feeReceiverAmount + fees.positionFeeAmountForPool + fees.fundingFeeAmount + fees.borrowingFeeAmount;
        fees.totalNetCostUsd = fees.totalNetCostAmount * collateralTokenPrice.max;

        return fees;
    }

    function getPositionFeesAfterReferral(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Price.Props memory collateralTokenPrice,
        address account,
        address market,
        uint256 sizeDeltaUsd
    ) internal view returns (address, uint256, uint256, uint256, uint256) {
        _GetPositionFeesAfterReferralCache memory cache;

        (cache.affiliate, cache.totalRebateFactor, cache.traderDiscountFactor) = ReferralUtils.getReferralInfo(referralStorage, account);

        cache.feeFactor = dataStore.getUint(Keys.positionFeeFactorKey(market));
        cache.positionFeeAmount = Precision.applyFactor(sizeDeltaUsd, cache.feeFactor) / collateralTokenPrice.min;

        cache.totalRebateAmount = Precision.applyFactor(cache.positionFeeAmount, cache.totalRebateFactor);
        cache.traderDiscountAmount = Precision.applyFactor(cache.totalRebateAmount, cache.traderDiscountFactor);
        cache.affiliateRewardAmount = cache.totalRebateAmount - cache.traderDiscountAmount;

        cache.protocolFeeAmount = cache.positionFeeAmount - cache.totalRebateAmount;

        cache.feeReceiverFactor = dataStore.getUint(Keys.FEE_RECEIVER_POSITION_FACTOR);

        cache.feeReceiverAmount = Precision.applyFactor(cache.protocolFeeAmount, cache.feeReceiverFactor);
        cache.positionFeeAmountForPool = cache.protocolFeeAmount - cache.feeReceiverAmount;

        return (cache.affiliate, cache.traderDiscountAmount, cache.affiliateRewardAmount, cache.feeReceiverAmount, cache.positionFeeAmountForPool);
    }
}
