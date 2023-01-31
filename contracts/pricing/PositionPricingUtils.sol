// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SignedMath.sol";

import "../market/MarketUtils.sol";

import "../utils/Precision.sol";
import "../utils/Calc.sol";

import "./PricingUtils.sol";

import "../referral/IReferralStorage.sol";
import "../referral/ReferralUtils.sol";

// @title PositionPricingUtils
// @dev Library for position pricing functions
library PositionPricingUtils {
    using SignedMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using Position for Position.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // @dev GetPriceImpactUsdParams struct used in getPriceImpactUsd to avoid stack
    // too deep errors
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the longToken of the market
    // @param shortToken the shortToken of the market
    // @param usdDelta the change in position size in USD
    // @param isLong whether the position is long or short
    struct GetPriceImpactUsdParams {
        DataStore dataStore;
        address market;
        address indexToken;
        address longToken;
        address shortToken;
        int256 usdDelta;
        bool isLong;
    }

    // @dev OpenInterestParams struct to contain open interest values
    // @param longOpenInterest the amount of long open interest
    // @param shortOpenInterest the amount of short open interest
    // @param nextLongOpenInterest the updated amount of long open interest
    // @param nextShortOpenInterest the updated amount of short open interest
    struct OpenInterestParams {
        uint256 longOpenInterest;
        uint256 shortOpenInterest;
        uint256 nextLongOpenInterest;
        uint256 nextShortOpenInterest;
    }

    // @dev PositionFees struct to contain fee values
    // @param feeReceiverAmount the amount for the fee receiver
    // @param feeAmountForPool the amount of fees for the pool
    // @param positionFeeAmountForPool the position fee amount for the pool
    // @param positionFeeAmount the fee amount for increasing / decreasing the position
    // @param borrowingFeeAmount the borrowing fee amount
    // @param totalNetCostAmount the total net cost amount in tokens
    // @param totalNetCostUsd the total net cost in USD
    struct PositionFees {
        PositionReferralFees referral;
        PositionFundingFees funding;
        uint256 feeReceiverAmount;
        uint256 feeAmountForPool;
        uint256 positionFeeAmountForPool;
        uint256 positionFeeAmount;
        uint256 borrowingFeeAmount;
        uint256 totalNetCostAmount;
        uint256 totalNetCostUsd;
    }

    // @param affiliate the referral affiliate of the trader
    // @param traderDiscountAmount the discount amount for the trader
    // @param affiliateRewardAmount the affiliate reward amount
    struct PositionReferralFees {
        address affiliate;
        uint256 traderDiscountAmount;
        uint256 affiliateRewardAmount;
    }

    // @param fundingFeeAmount the position's funding fee amount
    // @param claimableLongTokenAmount the negative funding fee in long token that is claimable
    // @param claimableShortTokenAmount the negative funding fee in short token that is claimable
    // @param latestLongTokenFundingAmountPerSize the latest long token funding
    // amount per size for the market
    // @param latestShortTokenFundingAmountPerSize the latest short token funding
    // amount per size for the market
    // @param hasPendingLongTokenFundingFee whether there is a pending long token funding fee
    // @param hasPendingShortTokenFundingFee whether there is a pending short token funding fee
    struct PositionFundingFees {
        uint256 fundingFeeAmount;
        uint256 claimableLongTokenAmount;
        uint256 claimableShortTokenAmount;
        int256 latestLongTokenFundingAmountPerSize;
        int256 latestShortTokenFundingAmountPerSize;
        bool hasPendingLongTokenFundingFee;
        bool hasPendingShortTokenFundingFee;
    }

    // @dev GetPositionFeesAfterReferralCache struct used in getPositionFees
    // to avoid stack too deep errors
    // @param feeFactor the fee factor
    // @param positionFeeAmount the fee amount for increasing / decreasing the position
    // @param protocolFeeAmount the protocol fee
    // @param feeReceiverAmount the amount for the fee receiver
    // @param positionFeeAmountForPool the position fee amount for the pool in tokens
    struct GetPositionFeesAfterReferralCache {
        GetPositionFeesAfterReferralCacheReferral referral;
        uint256 feeFactor;
        uint256 positionFeeAmount;
        uint256 protocolFeeAmount;
        uint256 positionFeeReceiverFactor;
        uint256 feeReceiverAmount;
        uint256 positionFeeAmountForPool;
    }

    // @param affiliate the referral affiliate
    // @param totalRebateFactor the total referral rebate factor
    // @param traderDiscountFactor the trader referral discount factor
    // @param totalRebateAmount the total referral rebate amount in tokens
    // @param traderDiscountAmount the trader discount amount in tokens
    // @param affiliateRewardAmount the affiliate reward amount in tokens
    struct GetPositionFeesAfterReferralCacheReferral {
        address affiliate;
        uint256 totalRebateFactor;
        uint256 traderDiscountFactor;
        uint256 totalRebateAmount;
        uint256 traderDiscountAmount;
        uint256 affiliateRewardAmount;
    }


    error UsdDeltaExceedsLongOpenInterest(int256 usdDelta, uint256 longOpenInterest);
    error UsdDeltaExceedsShortOpenInterest(int256 usdDelta, uint256 shortOpenInterest);

    // @dev get the price impact amount for a position increase / decrease
    // @param size the change in position size
    // @param executionPrice the execution price of the index token
    // @param latestPrice the latest price of the index token
    // @param isLong whether the position is long or short
    // @param isIncrease whether it is an increase or decrease position
    // @return the price impact amount for a position increase / decrease
    function getPriceImpactAmount(
        uint256 size,
        uint256 executionPrice,
        Price.Props memory latestPrice,
        bool isLong,
        bool isIncrease
    ) internal pure returns (int256) {
        uint256 _latestPrice;
        if (isIncrease) {
            _latestPrice = isLong ? latestPrice.max : latestPrice.min;
        } else {
            _latestPrice = isLong ? latestPrice.min : latestPrice.max;
        }

        // increase order:
        //     - long: price impact is size * (_latestPrice - executionPrice) / _latestPrice
        //             when executionPrice is smaller than _latestPrice there is a positive price impact
        //     - short: price impact is size * (executionPrice - _latestPrice) / _latestPrice
        //              when executionPrice is larger than _latestPrice there is a positive price impact
        // decrease order:
        //     - long: price impact is size * (executionPrice - _latestPrice) / _latestPrice
        //             when executionPrice is larger than _latestPrice there is a positive price impact
        //     - short: price impact is size * (_latestPrice - executionPrice) / _latestPrice
        //              when executionPrice is smaller than _latestPrice there is a positive price impact
        int256 priceDiff = _latestPrice.toInt256() - executionPrice.toInt256();
        bool shouldFlipPriceDiff = isIncrease ? !isLong : isLong;
        if (shouldFlipPriceDiff) { priceDiff = -priceDiff; }

        int256 priceImpactUsd = size.toInt256() * priceDiff / _latestPrice.toInt256();

        // round positive price impact up, this will be deducted from the position impact pool
        if (priceImpactUsd > 0) {
            return Calc.roundUpDivision(priceImpactUsd, _latestPrice);
        }

        // round negative price impact down, this will be stored in the position impact pool
        return priceImpactUsd / _latestPrice.toInt256();
    }

    // @dev get the price impact in USD for a position increase / decrease
    // @param params GetPriceImpactUsdParams
    function getPriceImpactUsd(GetPriceImpactUsdParams memory params) internal view returns (int256) {
        OpenInterestParams memory openInterestParams = getNextOpenInterest(params);

        int256 priceImpactUsd = _getPriceImpactUsd(params.dataStore, params.market, openInterestParams);

        if (priceImpactUsd >= 0) {
            return priceImpactUsd;
        }

        (bool hasVirtualInventory, int256 thresholdImpactFactorForVirtualInventory) = MarketUtils.getThresholdPositionImpactFactorForVirtualInventory(
            params.dataStore,
            params.indexToken
        );

        if (!hasVirtualInventory) {
            return priceImpactUsd;
        }

        OpenInterestParams memory openInterestParamsForVirtualInventory = getNextOpenInterestForVirtualInventory(params);
        int256 priceImpactUsdForVirtualInventory = _getPriceImpactUsd(params.dataStore, params.market, openInterestParamsForVirtualInventory);
        int256 thresholdPriceImpactUsd = Precision.applyFactor(params.usdDelta.abs(), thresholdImpactFactorForVirtualInventory);

        if (priceImpactUsdForVirtualInventory > thresholdPriceImpactUsd) {
            return priceImpactUsd;
        }

        return priceImpactUsdForVirtualInventory < priceImpactUsd ? priceImpactUsdForVirtualInventory : priceImpactUsd;
    }

    // @dev get the price impact in USD for a position increase / decrease
    // @param dataStore DataStore
    // @param market the trading market
    // @param openInterestParams OpenInterestParams
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

    // @dev get the next open interest values
    // @param params GetPriceImpactUsdParams
    // @return OpenInterestParams
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

        return getNextOpenInterestParams(params, longOpenInterest, shortOpenInterest);
    }

    function getNextOpenInterestForVirtualInventory(
        GetPriceImpactUsdParams memory params
    ) internal view returns (OpenInterestParams memory) {
        (/* bool hasVirtualInventory */, int256 virtualInventory) = MarketUtils.getVirtualInventoryForPositions(params.dataStore, params.indexToken);

        uint256 longOpenInterest;
        uint256 shortOpenInterest;

        // if virtualInventory is more than zero it means that
        // tokens were virtually sold to the pool, so set shortOpenInterest
        // to the virtualInventory value
        // if virtualInventory is less than zero it means that
        // tokens were virtually bought from the pool, so set longOpenInterest
        // to the virtualInventory value
        if (virtualInventory > 0) {
            shortOpenInterest = virtualInventory.toUint256();
        } else {
            longOpenInterest = (-virtualInventory).toUint256();
        }

        return getNextOpenInterestParams(params, longOpenInterest, shortOpenInterest);
    }

    function getNextOpenInterestParams(
        GetPriceImpactUsdParams memory params,
        uint256 longOpenInterest,
        uint256 shortOpenInterest
    ) internal pure returns (OpenInterestParams memory) {
        uint256 nextLongOpenInterest;
        uint256 nextShortOpenInterest;

        if (params.isLong) {
            if (params.usdDelta < 0 && (-params.usdDelta).toUint256() > longOpenInterest) {
                revert UsdDeltaExceedsLongOpenInterest(params.usdDelta, longOpenInterest);
            }

            nextLongOpenInterest = Calc.sumReturnUint256(longOpenInterest, params.usdDelta);
        } else {
            if (params.usdDelta < 0 && (-params.usdDelta).toUint256() > shortOpenInterest) {
                revert UsdDeltaExceedsShortOpenInterest(params.usdDelta, shortOpenInterest);
            }

            nextShortOpenInterest = Calc.sumReturnUint256(shortOpenInterest, params.usdDelta);
        }

        OpenInterestParams memory openInterestParams = OpenInterestParams(
            longOpenInterest,
            shortOpenInterest,
            nextLongOpenInterest,
            nextShortOpenInterest
        );

        return openInterestParams;
    }

    // @dev get position fees
    // @param dataStore DataStore
    // @param referralStorage IReferralStorage
    // @param position the position values
    // @param collateralTokenPrice the price of the position's collateralToken
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param sizeDeltaUsd the change in position size
    // @return PositionFees
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
            fees.referral.affiliate,
            fees.referral.traderDiscountAmount,
            fees.referral.affiliateRewardAmount,
            fees.feeReceiverAmount,
            fees.positionFeeAmountForPool
        ) = getPositionFeesAfterReferral(
            dataStore,
            referralStorage,
            collateralTokenPrice,
            position.account(),
            position.market(),
            sizeDeltaUsd
        );

        fees.borrowingFeeAmount = MarketUtils.getBorrowingFees(dataStore, position) / collateralTokenPrice.min;

        uint256 borrowingFeeReceiverFactor = dataStore.getUint(Keys.BORROWING_FEE_RECEIVER_FACTOR);
        uint256 borrowingFeeAmountForFeeReceiver = Precision.applyFactor(fees.borrowingFeeAmount, borrowingFeeReceiverFactor);

        fees.feeAmountForPool = fees.positionFeeAmountForPool + fees.borrowingFeeAmount - borrowingFeeAmountForFeeReceiver;
        fees.feeReceiverAmount += borrowingFeeAmountForFeeReceiver;

        int256 latestLongTokenFundingAmountPerSize = MarketUtils.getFundingAmountPerSize(dataStore, position.market(), longToken, position.isLong());
        int256 latestShortTokenFundingAmountPerSize = MarketUtils.getFundingAmountPerSize(dataStore, position.market(), shortToken, position.isLong());

        fees.funding = getFundingFees(
            position,
            longToken,
            shortToken,
            latestLongTokenFundingAmountPerSize,
            latestShortTokenFundingAmountPerSize
        );

        fees.totalNetCostAmount = fees.referral.affiliateRewardAmount + fees.feeReceiverAmount + fees.positionFeeAmountForPool + fees.funding.fundingFeeAmount + fees.borrowingFeeAmount;
        fees.totalNetCostUsd = fees.totalNetCostAmount * collateralTokenPrice.max;

        return fees;
    }

    function getFundingFees(
        Position.Props memory position,
        address longToken,
        address shortToken,
        int256 latestLongTokenFundingAmountPerSize,
        int256 latestShortTokenFundingAmountPerSize
    ) internal pure returns (PositionFundingFees memory) {
        PositionFundingFees memory fundingFees;

        fundingFees.latestLongTokenFundingAmountPerSize = latestLongTokenFundingAmountPerSize;
        fundingFees.latestShortTokenFundingAmountPerSize = latestShortTokenFundingAmountPerSize;

        int256 longTokenFundingFeeAmount;
        int256 shortTokenFundingFeeAmount;

        (fundingFees.hasPendingLongTokenFundingFee, longTokenFundingFeeAmount) = MarketUtils.getFundingFeeAmount(
            fundingFees.latestLongTokenFundingAmountPerSize,
            position.longTokenFundingAmountPerSize(),
            position.sizeInUsd()
        );

        (fundingFees.hasPendingShortTokenFundingFee, shortTokenFundingFeeAmount) = MarketUtils.getFundingFeeAmount(
            fundingFees.latestShortTokenFundingAmountPerSize,
            position.shortTokenFundingAmountPerSize(),
            position.sizeInUsd()
        );

        // if the position has negative funding fees, distribute it to allow it to be claimable
        if (longTokenFundingFeeAmount < 0) {
            fundingFees.claimableLongTokenAmount = (-longTokenFundingFeeAmount).toUint256();
        }

        if (shortTokenFundingFeeAmount < 0) {
            fundingFees.claimableShortTokenAmount = (-shortTokenFundingFeeAmount).toUint256();
        }

        if (position.collateralToken() == longToken && longTokenFundingFeeAmount > 0) {
            fundingFees.fundingFeeAmount = longTokenFundingFeeAmount.toUint256();
        }

        if (position.collateralToken() == shortToken && shortTokenFundingFeeAmount > 0) {
            fundingFees.fundingFeeAmount = shortTokenFundingFeeAmount.toUint256();
        }

        return fundingFees;
    }


    // @dev get position fees after applying referral rebates / discounts
    // @param dataStore DataStore
    // @param referralStorage IReferralStorage
    // @param collateralTokenPrice the price of the position's collateralToken
    // @param the position's account
    // @param market the position's market
    // @param sizeDeltaUsd the change in position size
    // @return (affiliate, traderDiscountAmount, affiliateRewardAmount, feeReceiverAmount, positionFeeAmountForPool)
    function getPositionFeesAfterReferral(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Price.Props memory collateralTokenPrice,
        address account,
        address market,
        uint256 sizeDeltaUsd
    ) internal view returns (address, uint256, uint256, uint256, uint256) {
        GetPositionFeesAfterReferralCache memory cache;

        (cache.referral.affiliate, cache.referral.totalRebateFactor, cache.referral.traderDiscountFactor) = ReferralUtils.getReferralInfo(referralStorage, account);

        cache.feeFactor = dataStore.getUint(Keys.positionFeeFactorKey(market));
        cache.positionFeeAmount = Precision.applyFactor(sizeDeltaUsd, cache.feeFactor) / collateralTokenPrice.min;

        cache.referral.totalRebateAmount = Precision.applyFactor(cache.positionFeeAmount, cache.referral.totalRebateFactor);
        cache.referral.traderDiscountAmount = Precision.applyFactor(cache.referral.totalRebateAmount, cache.referral.traderDiscountFactor);
        cache.referral.affiliateRewardAmount = cache.referral.totalRebateAmount - cache.referral.traderDiscountAmount;

        cache.protocolFeeAmount = cache.positionFeeAmount - cache.referral.totalRebateAmount;

        cache.positionFeeReceiverFactor = dataStore.getUint(Keys.POSITION_FEE_RECEIVER_FACTOR);
        cache.feeReceiverAmount = Precision.applyFactor(cache.protocolFeeAmount, cache.positionFeeReceiverFactor);
        cache.positionFeeAmountForPool = cache.protocolFeeAmount - cache.feeReceiverAmount;

        return (cache.referral.affiliate, cache.referral.traderDiscountAmount, cache.referral.affiliateRewardAmount, cache.feeReceiverAmount, cache.positionFeeAmountForPool);
    }

    function emitPositionFeesCollected(
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isIncrease,
        PositionFees memory fees
    ) external {
        _emitPositionFees(
            eventEmitter,
            market,
            collateralToken,
            isIncrease,
            fees,
            "PositionFeesCollected"
        );
    }

    function emitPositionFeesInfo(
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isIncrease,
        PositionFees memory fees
    ) external {
        _emitPositionFees(
            eventEmitter,
            market,
            collateralToken,
            isIncrease,
            fees,
            "PositionFeesInfo"
        );
    }

    function _emitPositionFees(
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isIncrease,
        PositionFees memory fees,
        string memory eventName
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "collateralToken", collateralToken);
        eventData.addressItems.setItem(2, "affiliate", fees.referral.affiliate);

        eventData.uintItems.initItems(13);
        eventData.uintItems.setItem(0, "traderDiscountAmount", fees.referral.traderDiscountAmount);
        eventData.uintItems.setItem(1, "affiliateRewardAmount", fees.referral.affiliateRewardAmount);
        eventData.uintItems.setItem(3, "fundingFeeAmount", fees.funding.fundingFeeAmount);
        eventData.uintItems.setItem(4, "claimableLongTokenAmount", fees.funding.claimableLongTokenAmount);
        eventData.uintItems.setItem(5, "claimableShortTokenAmount", fees.funding.claimableShortTokenAmount);
        eventData.uintItems.setItem(6, "feeReceiverAmount", fees.feeReceiverAmount);
        eventData.uintItems.setItem(7, "feeAmountForPool", fees.feeAmountForPool);
        eventData.uintItems.setItem(8, "positionFeeAmountForPool", fees.positionFeeAmountForPool);
        eventData.uintItems.setItem(9, "positionFeeAmount", fees.positionFeeAmount);
        eventData.uintItems.setItem(10, "borrowingFeeAmount", fees.borrowingFeeAmount);
        eventData.uintItems.setItem(11, "totalNetCostAmount", fees.totalNetCostAmount);
        eventData.uintItems.setItem(12, "totalNetCostUsd", fees.totalNetCostUsd);

        eventData.intItems.initItems(2);
        eventData.intItems.setItem(0, "latestLongTokenFundingAmountPerSize", fees.funding.latestLongTokenFundingAmountPerSize);
        eventData.intItems.setItem(1, "latestShortTokenFundingAmountPerSize", fees.funding.latestShortTokenFundingAmountPerSize);

        eventData.boolItems.initItems(3);
        eventData.boolItems.setItem(0, "hasPendingLongTokenFundingFee", fees.funding.hasPendingLongTokenFundingFee);
        eventData.boolItems.setItem(1, "hasPendingShortTokenFundingFee", fees.funding.hasPendingShortTokenFundingFee);
        eventData.boolItems.setItem(2, "isIncrease", isIncrease);

        eventEmitter.emitEventLog1(
            eventName,
            Cast.toBytes32(market),
            eventData
        );
    }
}
