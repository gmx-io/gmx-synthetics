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

    struct VirtualInventory {
        uint256 virtualPoolAmountForLongToken;
        uint256 virtualPoolAmountForShortToken;
        int256 virtualInventoryForPositions;
    }

    struct MarketInfo {
        Market.Props market;
        uint256 borrowingFactorPerSecondForLongs;
        uint256 borrowingFactorPerSecondForShorts;
        BaseFundingValues baseFunding;
        MarketUtils.GetNextFundingAmountPerSizeResult nextFunding;
        VirtualInventory virtualInventory;
        bool isDisabled;
    }

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

        values.claimableFundingAmountPerSize.long.longToken = MarketUtils.getClaimableFundingAmountPerSize(
            dataStore,
            market.marketToken,
            market.longToken,
            true // isLong
        );

        values.claimableFundingAmountPerSize.long.shortToken = MarketUtils.getClaimableFundingAmountPerSize(
            dataStore,
            market.marketToken,
            market.shortToken,
            true // isLong
        );

        values.claimableFundingAmountPerSize.short.longToken = MarketUtils.getClaimableFundingAmountPerSize(
            dataStore,
            market.marketToken,
            market.longToken,
            false // isLong
        );

        values.claimableFundingAmountPerSize.short.shortToken = MarketUtils.getClaimableFundingAmountPerSize(
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

    function getMarketInfo(
        DataStore dataStore,
        MarketUtils.MarketPrices memory prices,
        address marketKey
    ) external view returns (MarketInfo memory) {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketKey);

        uint256 borrowingFactorPerSecondForLongs = MarketUtils.getBorrowingFactorPerSecond(
            dataStore,
            market,
            prices,
            true
        );

        uint256 borrowingFactorPerSecondForShorts = MarketUtils.getBorrowingFactorPerSecond(
            dataStore,
            market,
            prices,
            false
        );

        BaseFundingValues memory baseFunding = getBaseFundingValues(dataStore, market);

        MarketUtils.GetNextFundingAmountPerSizeResult memory nextFunding = getNextFundingAmountPerSize(
            dataStore,
            market,
            prices
        );

        VirtualInventory memory virtualInventory = getVirtualInventory(dataStore, market);

        bool isMarketDisabled = dataStore.getBool(Keys.isMarketDisabledKey(market.marketToken));

        return
            MarketInfo(
                market,
                borrowingFactorPerSecondForLongs,
                borrowingFactorPerSecondForShorts,
                baseFunding,
                nextFunding,
                virtualInventory,
                isMarketDisabled
            );
    }

    function getVirtualInventory(
        DataStore dataStore,
        Market.Props memory market
    ) internal view returns (VirtualInventory memory) {
        (, uint256 virtualPoolAmountForLongToken, uint256 virtualPoolAmountForShortToken) = MarketUtils
            .getVirtualInventoryForSwaps(dataStore, market.marketToken);
        (, int256 virtualInventoryForPositions) = MarketUtils.getVirtualInventoryForPositions(
            dataStore,
            market.indexToken
        );

        return
            VirtualInventory(
                virtualPoolAmountForLongToken,
                virtualPoolAmountForShortToken,
                virtualInventoryForPositions
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

        // see MarketUtils.getNextFundingAmountPerSize for more info on why this multiplier is needed
        // a short summary:
        // - funding values are split based on long and short token
        // - for single token markets, these tokens are the same
        // - so when the funding values are applied in updateFundingState, they are applied twice
        // - e.g.
        //     - increase fundingFeeAmountPerSize(market, collateralToken: token0, isLong: true) by 10
        //     - increase fundingFeeAmountPerSize(market, collateralToken: token1, isLong: true) by 10
        //     - for a single token market, token0 is the same as token1, so the value would be increased by 20
        // - to avoid costs being doubled, these values are halved in MarketUtils.getNextFundingAmountPerSize
        // - the reader code needs to double the values, because in the code below the nextFundingAmountResult
        // values are applied virtually instead of the DataStore values being updated
        uint256 multiplier = cache.market.longToken == cache.market.shortToken ? 2 : 1;

        if (positionInfo.position.isLong()) {
            positionInfo.fees.funding.latestLongTokenClaimableFundingAmountPerSize += nextFundingAmountResult.claimableFundingAmountPerSizeDelta.long.longToken * multiplier;
            positionInfo.fees.funding.latestShortTokenClaimableFundingAmountPerSize += nextFundingAmountResult.claimableFundingAmountPerSizeDelta.long.shortToken * multiplier;

            if (positionInfo.position.collateralToken() == cache.market.longToken) {
                positionInfo.fees.funding.latestFundingFeeAmountPerSize += nextFundingAmountResult.fundingFeeAmountPerSizeDelta.long.longToken * multiplier;
            } else {
                positionInfo.fees.funding.latestFundingFeeAmountPerSize += nextFundingAmountResult.fundingFeeAmountPerSizeDelta.long.shortToken * multiplier;
            }
        } else {
            positionInfo.fees.funding.latestLongTokenClaimableFundingAmountPerSize += nextFundingAmountResult.claimableFundingAmountPerSizeDelta.short.longToken * multiplier;
            positionInfo.fees.funding.latestShortTokenClaimableFundingAmountPerSize += nextFundingAmountResult.claimableFundingAmountPerSizeDelta.short.shortToken * multiplier;

            if (positionInfo.position.collateralToken() == cache.market.longToken) {
                positionInfo.fees.funding.latestFundingFeeAmountPerSize += nextFundingAmountResult.fundingFeeAmountPerSizeDelta.short.longToken * multiplier;
            } else {
                positionInfo.fees.funding.latestFundingFeeAmountPerSize += nextFundingAmountResult.fundingFeeAmountPerSizeDelta.short.shortToken * multiplier;
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

        positionInfo.fees.totalCostAmountExcludingFunding =
            positionInfo.fees.positionFeeAmount
            + positionInfo.fees.borrowing.borrowingFeeAmount
            + positionInfo.fees.ui.uiFeeAmount
            - positionInfo.fees.referral.traderDiscountAmount;

        positionInfo.fees.totalCostAmount =
            positionInfo.fees.totalCostAmountExcludingFunding
            + positionInfo.fees.funding.fundingFeeAmount;

        return positionInfo;
    }
}
