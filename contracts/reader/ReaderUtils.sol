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

// @title ReaderUtils
// @dev Library for read utils functions
// convers some internal library functions into external functions to reduce
// the Reader contract size
library ReaderUtils {
    using SignedMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using Price for Price.Props;
    using Position for Position.Props;
    using Order for Order.Props;

    struct PositionInfo {
        Position.Props position;
        PositionPricingUtils.PositionFees fees;
        ReaderPricingUtils.ExecutionPriceResult executionPriceResult;
        int256 basePnlUsd;
        int256 uncappedBasePnlUsd;
        int256 pnlAfterPriceImpactUsd;
    }

    struct GetPositionInfoCache {
        Market.Props market;
        Price.Props collateralTokenPrice;
        uint256 pendingBorrowingFeeUsd;
    }

    struct BaseFundingValues {
        MarketUtils.PositionType fundingFeeAmountPerSize;
        MarketUtils.PositionType claimableFundingAmountPerSize;
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

    function getBaseFundingValues(DataStore dataStore, Market.Props memory market) public view returns (BaseFundingValues memory) {
        BaseFundingValues memory values;

        values.fundingFeeAmountPerSize.long.longToken = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            market.marketToken,
            market.longToken,
            true // isLong
        );

        values.fundingFeeAmountPerSize.long.shortToken = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            market.marketToken,
            market.shortToken,
            true // isLong
        );

        values.fundingFeeAmountPerSize.short.longToken = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            market.marketToken,
            market.longToken,
            false // isLong
        );

        values.fundingFeeAmountPerSize.short.shortToken = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            market.marketToken,
            market.shortToken,
            false // isLong
        );

        values.claimableFundingAmountPerSize.long.longToken = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            market.marketToken,
            market.longToken,
            true // isLong
        );

        values.claimableFundingAmountPerSize.long.shortToken = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            market.marketToken,
            market.shortToken,
            true // isLong
        );

        values.claimableFundingAmountPerSize.short.longToken = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            market.marketToken,
            market.longToken,
            false // isLong
        );

        values.claimableFundingAmountPerSize.short.shortToken = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            market.marketToken,
            market.shortToken,
            false // isLong
        );

        return values;
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

    function getPositionInfo(
        DataStore dataStore,
        IReferralStorage referralStorage,
        bytes32 positionKey,
        MarketUtils.MarketPrices memory prices,
        uint256 sizeDeltaUsd,
        address uiFeeReceiver,
        bool usePositionSizeAsSizeDeltaUsd
    ) external view returns (PositionInfo memory) {
        PositionInfo memory positionInfo;
        GetPositionInfoCache memory cache;

        positionInfo.position = PositionStoreUtils.get(dataStore, positionKey);
        cache.market = MarketStoreUtils.get(dataStore, positionInfo.position.market());
        cache.collateralTokenPrice = MarketUtils.getCachedTokenPrice(positionInfo.position.collateralToken(), cache.market, prices);

        if (usePositionSizeAsSizeDeltaUsd) {
            sizeDeltaUsd = positionInfo.position.sizeInUsd();
        }

        positionInfo.executionPriceResult = ReaderPricingUtils.getExecutionPrice(
            dataStore,
            cache.market,
            prices.indexTokenPrice,
            positionInfo.position.sizeInUsd(),
            positionInfo.position.sizeInTokens(),
            -sizeDeltaUsd.toInt256(),
            positionInfo.position.isLong()
        );

        PositionPricingUtils.GetPositionFeesParams memory getPositionFeesParams = PositionPricingUtils.GetPositionFeesParams(
            dataStore, // dataStore
            referralStorage, // referralStorage
            positionInfo.position, // position
            cache.collateralTokenPrice, // collateralTokenPrice
            positionInfo.executionPriceResult.priceImpactUsd > 0, // forPositiveImpact
            cache.market.longToken, // longToken
            cache.market.shortToken, // shortToken
            sizeDeltaUsd, // sizeDeltaUsd
            uiFeeReceiver // uiFeeReceiver
        );

        positionInfo.fees = PositionPricingUtils.getPositionFees(getPositionFeesParams);

        // borrowing and funding fees need to be overwritten with pending values otherwise they
        // would be using storage values that have not yet been updated
        cache.pendingBorrowingFeeUsd = getNextBorrowingFees(dataStore, positionInfo.position, cache.market, prices);

        positionInfo.fees.borrowing = getBorrowingFees(
            dataStore,
            cache.collateralTokenPrice,
            cache.pendingBorrowingFeeUsd
        );

        MarketUtils.GetNextFundingAmountPerSizeResult memory nextFundingAmountResult = getNextFundingAmountPerSize(dataStore, cache.market, prices);

        positionInfo.fees.funding.latestFundingFeeAmountPerSize = MarketUtils.getFundingFeeAmountPerSize(
            dataStore,
            positionInfo.position.market(),
            positionInfo.position.collateralToken(),
            positionInfo.position.isLong()
        );

        positionInfo.fees.funding.latestLongTokenClaimableFundingAmountPerSize = MarketUtils.getClaimableFundingAmountPerSize(
            dataStore,
            positionInfo.position.market(),
            cache.market.longToken,
            positionInfo.position.isLong()
        );

        positionInfo.fees.funding.latestShortTokenClaimableFundingAmountPerSize = MarketUtils.getClaimableFundingAmountPerSize(
            dataStore,
            positionInfo.position.market(),
            cache.market.shortToken,
            positionInfo.position.isLong()
        );

        if (positionInfo.position.isLong()) {
            positionInfo.fees.funding.latestLongTokenClaimableFundingAmountPerSize += nextFundingAmountResult.claimableFundingAmountPerSizeDelta.long.longToken;
            positionInfo.fees.funding.latestShortTokenClaimableFundingAmountPerSize += nextFundingAmountResult.claimableFundingAmountPerSizeDelta.long.shortToken;

            if (positionInfo.position.collateralToken() == cache.market.longToken) {
                positionInfo.fees.funding.latestFundingFeeAmountPerSize += nextFundingAmountResult.fundingFeeAmountPerSizeDelta.long.longToken;
            } else {
                positionInfo.fees.funding.latestFundingFeeAmountPerSize += nextFundingAmountResult.fundingFeeAmountPerSizeDelta.long.shortToken;
            }
        } else {
            positionInfo.fees.funding.latestLongTokenClaimableFundingAmountPerSize += nextFundingAmountResult.claimableFundingAmountPerSizeDelta.short.longToken;
            positionInfo.fees.funding.latestShortTokenClaimableFundingAmountPerSize += nextFundingAmountResult.claimableFundingAmountPerSizeDelta.short.shortToken;

            if (positionInfo.position.collateralToken() == cache.market.longToken) {
                positionInfo.fees.funding.latestFundingFeeAmountPerSize += nextFundingAmountResult.fundingFeeAmountPerSizeDelta.short.longToken;
            } else {
                positionInfo.fees.funding.latestFundingFeeAmountPerSize += nextFundingAmountResult.fundingFeeAmountPerSizeDelta.short.shortToken;
            }
        }

        positionInfo.fees.funding = PositionPricingUtils.getFundingFees(
            positionInfo.fees.funding,
            positionInfo.position
        );

        (positionInfo.basePnlUsd, positionInfo.uncappedBasePnlUsd, /* sizeDeltaInTokens */) = PositionUtils.getPositionPnlUsd(
            dataStore,
            cache.market,
            prices,
            positionInfo.position,
            sizeDeltaUsd
        );

        positionInfo.pnlAfterPriceImpactUsd = positionInfo.executionPriceResult.priceImpactUsd + positionInfo.basePnlUsd;

        return positionInfo;
    }
}
