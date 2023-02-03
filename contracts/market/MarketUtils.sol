// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../bank/StrictBank.sol";

import "./Market.sol";
import "./MarketToken.sol";
import "./MarketEventUtils.sol";
import "./MarketStoreUtils.sol";

import "../position/Position.sol";
import "../order/Order.sol";

import "../oracle/Oracle.sol";
import "../price/Price.sol";

import "../utils/Calc.sol";
import "../utils/Precision.sol";

// @title MarketUtils
// @dev Library for market functions
library MarketUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    using Market for Market.Props;
    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    // @dev struct to store the prices of tokens of a market
    // @param indexTokenPrice price of the market's index token
    // @param longTokenPrice price of the market's long token
    // @param shortTokenPrice price of the market's short token
    struct MarketPrices {
        Price.Props indexTokenPrice;
        Price.Props longTokenPrice;
        Price.Props shortTokenPrice;
    }

    // @dev struct for the result of the getNextFundingAmountPerSize call
    // @param longsPayShorts whether longs pay shorts or shorts pay longs
    // @param fundingAmountPerSize_LongCollateral_LongPosition funding amount per
    // size for users with a long position using long collateral
    // @param fundingAmountPerSize_LongCollateral_ShortPosition funding amount per
    // size for users with a short position using long collateral
    // @param fundingAmountPerSize_ShortCollateral_LongPosition funding amount per
    // size for users with a long position using short collateral
    // @param fundingAmountPerSize_ShortCollateral_ShortPosition funding amount per
    // size for users with a short position using short collateral
    struct GetNextFundingAmountPerSizeResult {
        bool longsPayShorts;
        int256 fundingAmountPerSize_LongCollateral_LongPosition;
        int256 fundingAmountPerSize_LongCollateral_ShortPosition;
        int256 fundingAmountPerSize_ShortCollateral_LongPosition;
        int256 fundingAmountPerSize_ShortCollateral_ShortPosition;
    }

    // @dev struct to avoid stack too deep errors for the getPoolValue call
    // @param value the pool value
    // @param longTokenAmount the amount of long token in the pool
    // @param shortTokenAmount the amount of short token in the pool
    // @param longTokenUsd the USD value of the long tokens in the pool
    // @param shortTokenUsd the USD value of the short tokens in the pool
    // @param totalBorrowingFees the total pending borrowing fees for the market
    // @param borrowingFeeReceiverFactor the fee receiver factor for borrowing fees
    // @param impactPoolAmount the amount of tokens in the impact pool
    // @param longPnl the pending pnl of long positions
    // @param shortPnl the pending pnl of short positions
    // @param netPnl the net pnl of long and short positions
    struct GetPoolValueCache {
        uint256 value;

        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        uint256 longTokenUsd;
        uint256 shortTokenUsd;

        uint256 totalBorrowingFees;
        uint256 borrowingFeeReceiverFactor;

        uint256 impactPoolAmount;
        int256 longPnl;
        int256 shortPnl;
        int256 netPnl;
    }

    // @dev GetNextFundingAmountPerSizeCache struct used in getNextFundingAmountPerSize
    // to avoid stack too deep errors
    //
    // @param durationInSeconds duration in seconds since the last funding update
    //
    // @param diffUsd the absolute difference in long and short open interest for the market
    // @param totalOpenInterest the total long and short open interest for the market
    // @param fundingUsd the funding amount in USD
    //
    // @param fundingUsdForLongCollateral the funding amount in USD for positions using the long token as collateral
    // @param fundingUsdForShortCollateral the funding amount in USD for positions using the short token as collateral
    struct GetNextFundingAmountPerSizeCache {
        GetNextFundingAmountPerSizeOpenInterestCache oi;
        GetNextFundingAmountPerSizeFundingPerSizeCache fps;

        uint256 durationInSeconds;

        uint256 diffUsd;
        uint256 totalOpenInterest;
        uint256 sizeOfLargerSide;
        uint256 fundingFactorPerSecond;
        uint256 fundingUsd;

        uint256 fundingUsdForLongCollateral;
        uint256 fundingUsdForShortCollateral;
    }

    // @param longOpenInterestWithLongCollateral amount of long open interest using the long token as collateral
    // @param longOpenInterestWithShortCollateral amount of long open interest using the short token as collateral
    // @param shortOpenInterestWithLongCollateral amount of short open interest using the long token as collateral
    // @param shortOpenInterestWithShortCollateral amount of short open interest using the short token as collateral
    //
    // @param longOpenInterest total long open interest for the market
    // @param shortOpenInterest total short open interest for the market
    struct GetNextFundingAmountPerSizeOpenInterestCache {
        uint256 longOpenInterestWithLongCollateral;
        uint256 longOpenInterestWithShortCollateral;
        uint256 shortOpenInterestWithLongCollateral;
        uint256 shortOpenInterestWithShortCollateral;

        uint256 longOpenInterest;
        uint256 shortOpenInterest;
    }

    // @param fundingAmountPerSize_LongCollateral_LongPosition funding per size for longs using the long token as collateral
    // @param fundingAmountPerSize_LongCollateral_ShortPosition funding per size for shorts using the long token as collateral
    // @param fundingAmountPerSize_ShortCollateral_LongPosition funding per size for longs using the short token as collateral
    // @param fundingAmountPerSize_ShortCollateral_ShortPosition funding per size for shorts using the short token as collateral
    //
    // @param fundingAmountPerSizePortion_LongCollateral_LongPosition the next funding amount per size for longs using the long token as collateral
    // @param fundingAmountPerSizePortion_LongCollateral_ShortPosition the next funding amount per size for longs using the short token as collateral
    // @param fundingAmountPerSizePortion_ShortCollateral_LongPosition the next funding amount per size for shorts using the long token as collateral
    // @param fundingAmountPerSizePortion_ShortCollateral_ShortPosition the next funding amount per size for shorts using the short token as collateral
    struct GetNextFundingAmountPerSizeFundingPerSizeCache {
        int256 fundingAmountPerSize_LongCollateral_LongPosition;
        int256 fundingAmountPerSize_LongCollateral_ShortPosition;
        int256 fundingAmountPerSize_ShortCollateral_LongPosition;
        int256 fundingAmountPerSize_ShortCollateral_ShortPosition;

        uint256 fundingAmountPerSizePortion_LongCollateral_LongPosition;
        uint256 fundingAmountPerSizePortion_ShortCollateral_LongPosition;
        uint256 fundingAmountPerSizePortion_LongCollateral_ShortPosition;
        uint256 fundingAmountPerSizePortion_ShortCollateral_ShortPosition;
    }

    error EmptyMarket();
    error DisabledMarket(address market);
    error InsufficientPoolAmount(uint256 poolAmount, uint256 amount);
    error InsufficientReserve(uint256 reservedUsd, uint256 maxReservedUsd);
    error UnexpectedPoolValueForTokenPriceCalculation(int256 poolValue);
    error UnexpectedSupplyForTokenPriceCalculation();
    error UnableToGetOppositeToken(address inputToken, address market);
    error UnableToGetCachedTokenPrice(address token, address market);
    error CollateralAlreadyClaimed(uint256 adjustedClaimableAmount, uint256 claimedAmount);
    error OpenInterestCannotBeUpdatedForSwapOnlyMarket(address market);
    error MaxOpenInterestExceeded(uint256 openInterest, uint256 maxOpenInterest);
    error MaxPoolAmountExceeded(uint256 poolAmount, uint256 maxPoolAmount);
    error UnexpectedBorrowingFactor(uint256 positionBorrowingFactor, uint256 cumulativeBorrowingFactor);
    error UnableToGetBorrowingFactorEmptyPoolUsd();
    error UnableToGetFundingFactorEmptyOpenInterest();
    error InvalidPositionMarket(address market);
    error InvalidCollateralTokenForMarket(address market, address token);
    error PnlFactorExceededForLongs(int256 pnlToPoolFactor, uint256 maxPnlFactor);
    error PnlFactorExceededForShorts(int256 pnlToPoolFactor, uint256 maxPnlFactor);

    // @dev get the market token's price
    // @param dataStore DataStore
    // @param market the market to check
    // @param longTokenPrice the price of the long token
    // @param shortTokenPrice the price of the short token
    // @param indexTokenPrice the price of the index token
    // @param maximize whether to maximize or minimize the market token price
    // @return returns the market token's price
    function getMarketTokenPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        Price.Props memory indexTokenPrice,
        bytes32 pnlFactorType,
        bool maximize
    ) internal view returns (int256) {
        int256 poolValue = getPoolValue(
            dataStore,
            market,
            longTokenPrice,
            shortTokenPrice,
            indexTokenPrice,
            pnlFactorType,
            maximize
        );

        if (poolValue == 0) { return 0; }

        if (poolValue < 0) {
            revert UnexpectedPoolValueForTokenPriceCalculation(poolValue);
        }

        uint256 supply = getMarketTokenSupply(MarketToken(payable(market.marketToken)));

        if (supply == 0) {
            revert UnexpectedSupplyForTokenPriceCalculation();
        }

        return poolValue * Precision.WEI_PRECISION.toInt256() / supply.toInt256();
    }

    // @dev get the total supply of the marketToken
    // @param marketToken the marketToken
    // @return the total supply of the marketToken
    function getMarketTokenSupply(MarketToken marketToken) internal view returns (uint256) {
        return marketToken.totalSupply();
    }

    // @dev get the opposite token of the market
    // if the inputToken is the longToken return the shortToken and vice versa
    // @param inputToken the input token
    // @param market the market values
    // @return the opposite token
    function getOppositeToken(address inputToken, Market.Props memory market) internal pure returns (address) {
        if (inputToken == market.longToken) {
            return market.shortToken;
        }

        if (inputToken == market.shortToken) {
            return market.longToken;
        }

        revert UnableToGetOppositeToken(inputToken, market.marketToken);
    }

    // @dev get the token price from the stored MarketPrices
    // @param token the token to get the price for
    // @param the market values
    // @param the market token prices
    // @return the token price from the stored MarketPrices
    function getCachedTokenPrice(address token, Market.Props memory market, MarketPrices memory prices) internal pure returns (Price.Props memory) {
        if (token == market.longToken) {
            return prices.longTokenPrice;
        }
        if (token == market.shortToken) {
            return prices.shortTokenPrice;
        }
        if (token == market.indexToken) {
            return prices.indexTokenPrice;
        }

        revert UnableToGetCachedTokenPrice(token, market.marketToken);
    }

    // @dev return the latest prices for the market tokens
    // the secondary price for market.indexToken is overwritten for certain order
    // types, use this value instead of the primary price for positions
    // @param oracle Oracle
    // @param market the market values
    function getMarketPricesForPosition(Oracle oracle, Market.Props memory market) internal view returns (MarketPrices memory) {
        return MarketPrices(
            oracle.getLatestPrice(market.indexToken),
            oracle.getLatestPrice(market.longToken),
            oracle.getLatestPrice(market.shortToken)
        );
    }

    // @dev return the primary prices for the market tokens
    // @param oracle Oracle
    // @param market the market values
    function getMarketPrices(Oracle oracle, Market.Props memory market) internal view returns (MarketPrices memory) {
        return MarketPrices(
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken)
        );
    }

    // @dev get the usd value of either the long or short tokens in the pool
    // without accounting for the pnl of open positions
    // @param dataStore DataStore
    // @param market the market values
    // @param prices the prices of the market tokens
    // @param whether to return the value for the long or short token
    // @return the usd value of either the long or short tokens in the pool
    function getPoolUsdWithoutPnl(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong
    ) internal view returns (uint256) {
        address token = isLong ? market.longToken : market.shortToken;
        uint256 poolAmount = getPoolAmount(dataStore, market.marketToken, token);
        uint256 tokenPrice = isLong ? prices.longTokenPrice.min : prices.shortTokenPrice.min;
        return poolAmount * tokenPrice;
    }

    // @dev get the USD value of a pool
    // the value of a pool is the worth of the liquidity provider tokens in the pool - pending trader pnl
    // we use the token index prices to calculate this and ignore price impact since if all positions were closed the
    // net price impact should be zero
    // @param dataStore DataStore
    // @param market the market values
    // @param longTokenPrice price of the long token
    // @param shortTokenPrice price of the short token
    // @param indexTokenPrice price of the index token
    // @param maximize whether to maximize or minimize the pool value
    // @return the USD value of a pool
    function getPoolValue(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        Price.Props memory indexTokenPrice,
        bytes32 pnlFactorType,
        bool maximize
    ) internal view returns (int256) {
        GetPoolValueCache memory cache;

        cache.longTokenAmount = getPoolAmount(dataStore, market.marketToken, market.longToken);
        cache.shortTokenAmount = getPoolAmount(dataStore, market.marketToken, market.shortToken);

        cache.longTokenUsd = cache.longTokenAmount * longTokenPrice.pickPrice(maximize);
        cache.shortTokenUsd = cache.shortTokenAmount * shortTokenPrice.pickPrice(maximize);

        cache.value = cache.longTokenUsd + cache.shortTokenUsd;

        cache.totalBorrowingFees = getTotalBorrowingFees(dataStore, market.marketToken, market.longToken, market.shortToken, true);
        cache.totalBorrowingFees += getTotalBorrowingFees(dataStore, market.marketToken, market.longToken, market.shortToken, false);

        cache.borrowingFeeReceiverFactor = dataStore.getUint(Keys.BORROWING_FEE_RECEIVER_FACTOR);
        cache.value += Precision.applyFactor(cache.totalBorrowingFees, cache.borrowingFeeReceiverFactor);

        cache.impactPoolAmount = getPositionImpactPoolAmount(dataStore, market.marketToken);
        cache.value += cache.impactPoolAmount * indexTokenPrice.pickPrice(maximize);

        // !maximize should be used for net pnl as a larger pnl leads to a smaller pool value
        // and a smaller pnl leads to a larger pool value

        cache.longPnl = getPnl(
            dataStore,
            market.marketToken,
            market.longToken,
            market.shortToken,
            indexTokenPrice,
            true,
            !maximize
        );

        cache.longPnl = getCappedPnl(
            dataStore,
            market.marketToken,
            true,
            cache.longPnl,
            cache.longTokenUsd,
            pnlFactorType
        );

        cache.shortPnl = getPnl(
            dataStore,
            market.marketToken,
            market.longToken,
            market.shortToken,
            indexTokenPrice,
            false,
            !maximize
        );

        cache.shortPnl = getCappedPnl(
            dataStore,
            market.marketToken,
            false,
            cache.shortPnl,
            cache.shortTokenUsd,
            pnlFactorType
        );

        cache.netPnl = cache.longPnl + cache.shortPnl;

        return Calc.sumReturnInt256(cache.value, -cache.netPnl);
    }

    // @dev get the net pending pnl for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param indexTokenPrice the price of the index token
    // @param maximize whether to maximize or minimize the net pnl
    // @return the net pending pnl for a market
    function getNetPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) internal view returns (int256) {
        int256 longPnl = getPnl(dataStore, market, longToken, shortToken, indexTokenPrice, true, maximize);
        int256 shortPnl = getPnl(dataStore, market, longToken, shortToken, indexTokenPrice, false, maximize);

        return longPnl + shortPnl;
    }

    // @dev get the capped pending pnl for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check for the long or short side
    // @param pnl the uncapped pnl of the market
    // @param poolUsd the USD value of the pool
    // @param pnlFactorType the pnl factor type to use
    function getCappedPnl(
        DataStore dataStore,
        address market,
        bool isLong,
        int256 pnl,
        uint256 poolUsd,
        bytes32 pnlFactorType
    ) internal view returns (int256) {
        if (pnl < 0) { return pnl; }

        uint256 maxPnlFactor = getMaxPnlFactor(dataStore, pnlFactorType, market, isLong);
        int256 maxPnl = Precision.applyFactor(poolUsd, maxPnlFactor).toInt256();

        return pnl > maxPnl ? maxPnl : pnl;
    }

    // @dev get the pending pnl for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param indexTokenPrice the price of the index token
    // @param isLong whether to check for the long or short side
    // @param maximize whether to maximize or minimize the pnl
    function getPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        uint256 indexTokenPrice,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        Price.Props memory _indexTokenPrice = Price.Props(indexTokenPrice, indexTokenPrice);

        return getPnl(
            dataStore,
            market,
            longToken,
            shortToken,
            _indexTokenPrice,
            isLong,
            maximize
        );
    }

    // @dev get the pending pnl for a market for either longs or shorts
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param indexTokenPrice the price of the index token
    // @param isLong whether to get the pnl for longs or shorts
    // @param maximize whether to maximize or minimize the net pnl
    // @return the pending pnl for a market for either longs or shorts
    function getPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        int256 openInterest = getOpenInterest(dataStore, market, longToken, shortToken, isLong).toInt256();
        uint256 openInterestInTokens = getOpenInterestInTokens(dataStore, market, longToken, shortToken, isLong);
        if (openInterest == 0 || openInterestInTokens == 0) {
            return 0;
        }

        uint256 price = indexTokenPrice.pickPriceForPnl(isLong, maximize);

        // openInterest is the cost of all positions, openInterestValue is the current worth of all positions
        int256 openInterestValue = (openInterestInTokens * price).toInt256();
        int256 pnl = isLong ? openInterestValue - openInterest : openInterest - openInterestValue;

        return pnl;
    }

    // @dev get the amount of tokens in the pool
    // @param dataStore DataStore
    // @param market the market to check
    // @param token the token to check
    // @return the amount of tokens in the pool
    function getPoolAmount(DataStore dataStore, address market, address token) internal view returns (uint256) {
        return dataStore.getUint(Keys.poolAmountKey(market, token));
    }

    // @dev get the max amount of tokens allowed to be in the pool
    // @param dataStore DataStore
    // @param market the market to check
    // @param token the token to check
    // @return the max amount of tokens that are allowed in the pool
    function getMaxPoolAmount(DataStore dataStore, address market, address token) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPoolAmountKey(market, token));
    }

    // @dev get the max open interest allowed for the market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether this is for the long or short side
    // @return the max open interest allowed for the market
    function getMaxOpenInterest(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxOpenInterestKey(market, isLong));
    }

    // @dev increment the claimable collateral amount
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to increment the claimable collateral for
    // @param token the claimable token
    // @param account the account to increment the claimable collateral for
    // @param delta the amount to increment
    function incrementClaimableCollateralAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        address account,
        uint256 delta
    ) internal {
        uint256 divisor = dataStore.getUint(Keys.CLAIMABLE_COLLATERAL_TIME_DIVISOR);
        uint256 timeKey = block.timestamp / divisor;

        uint256 nextValue = dataStore.incrementUint(
            Keys.claimableCollateralAmountKey(market, token, timeKey, account),
            delta
        );

        MarketEventUtils.emitClaimableCollateralUpdated(eventEmitter, market, token, timeKey, account, delta, nextValue);
    }

    // @dev increment the claimable funding amount
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the trading market
    // @param token the claimable token
    // @param account the account to increment for
    // @param delta the amount to increment
    function incrementClaimableFundingAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        address account,
        uint256 delta
    ) internal {
        uint256 nextValue = dataStore.incrementUint(
            Keys.claimableFundingAmountKey(market, token, account),
            delta
        );

        MarketEventUtils.emitClaimableFundingUpdated(eventEmitter, market, token, account, delta, nextValue);
    }

    // @dev claim funding fees
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to claim for
    // @param token the token to claim
    // @param account the account to claim for
    // @param receiver the receiver to send the amount to
    function claimFundingFees(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        address account,
        address receiver
    ) internal {
        bytes32 key = Keys.claimableFundingAmountKey(market, token, account);

        uint256 claimableAmount = dataStore.getUint(key);
        dataStore.setUint(key, 0);

        MarketToken(payable(market)).transferOut(
            token,
            receiver,
            claimableAmount
        );

        MarketEventUtils.emitFundingFeesClaimed(
            eventEmitter,
            market,
            token,
            account,
            receiver,
            claimableAmount
        );
    }

    // @dev claim collateral
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to claim for
    // @param token the token to claim
    // @param account the account to claim for
    // @param receiver the receiver to send the amount to
    function claimCollateral(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        address account,
        address receiver
    ) internal {
        uint256 claimableAmount = dataStore.getUint(Keys.claimableCollateralAmountKey(market, token, timeKey, account));
        uint256 claimableFactor = dataStore.getUint(Keys.claimableCollateralFactorKey(market, token, timeKey, account));
        uint256 claimedAmount = dataStore.getUint(Keys.claimedCollateralAmountKey(market, token, timeKey, account));

        uint256 adjustedClaimableAmount = Precision.applyFactor(claimableAmount, claimableFactor);
        if (adjustedClaimableAmount >= claimedAmount) {
            revert CollateralAlreadyClaimed(adjustedClaimableAmount, claimedAmount);
        }

        uint256 remainingClaimableAmount = adjustedClaimableAmount - claimedAmount;

        dataStore.setUint(
            Keys.claimedCollateralAmountKey(market, token, timeKey, account),
            adjustedClaimableAmount
        );

        MarketToken(payable(market)).transferOut(
            token,
            receiver,
            remainingClaimableAmount
        );

        MarketEventUtils.emitCollateralClaimed(
            eventEmitter,
            market,
            token,
            timeKey,
            account,
            receiver,
            remainingClaimableAmount
        );
    }

    // @dev apply a delta to the pool amount
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to apply to
    // @param token the token to apply to
    // @param delta the delta amount
    function applyDeltaToPoolAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        int256 delta
    ) internal returns (uint256) {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.poolAmountKey(market, token),
            delta,
            "Invalid state, negative poolAmount"
        );

        applyDeltaToVirtualInventoryForSwaps(
            dataStore,
            market,
            token,
            delta
        );

        MarketEventUtils.emitPoolAmountUpdated(eventEmitter, market, token, delta, nextValue);

        return nextValue;
    }

    // @dev cap the input priceImpactUsd by the available amount in the position impact pool
    // @param dataStore DataStore
    // @param market the trading market
    // @param tokenPrice the price of the token
    // @param priceImpactUsd the calculated USD price impact
    // @return the capped priceImpactUsd
    function getCappedPositionImpactUsd(
        DataStore dataStore,
        address market,
        Price.Props memory tokenPrice,
        int256 priceImpactUsd,
        uint256 sizeDeltaUsd
    ) internal view returns (int256) {
        if (priceImpactUsd < 0) {
            return priceImpactUsd;
        }

        uint256 impactPoolAmount = getPositionImpactPoolAmount(dataStore, market);
        int256 maxPriceImpactUsdBasedOnImpactPool = (impactPoolAmount * tokenPrice.min).toInt256();

        if (priceImpactUsd > maxPriceImpactUsdBasedOnImpactPool) {
            priceImpactUsd = maxPriceImpactUsdBasedOnImpactPool;
        }

        uint256 maxPriceImpactFactor = getMaxPositionImpactFactor(dataStore, market, true);
        int256 maxPriceImpactUsdBasedOnMaxPriceImpactFactor = Precision.applyFactor(sizeDeltaUsd, maxPriceImpactFactor).toInt256();

        if (priceImpactUsd > maxPriceImpactUsdBasedOnMaxPriceImpactFactor) {
            priceImpactUsd = maxPriceImpactUsdBasedOnMaxPriceImpactFactor;
        }

        return priceImpactUsd;
    }

    // @dev get the position impact pool amount
    // @param dataStore DataStore
    // @param market the market to check
    // @return the position impact pool amount
    function getPositionImpactPoolAmount(DataStore dataStore, address market) internal view returns (uint256) {
        return dataStore.getUint(Keys.positionImpactPoolAmountKey(market));
    }

    // @dev get the swap impact pool amount
    // @param dataStore DataStore
    // @param market the market to check
    // @param token the token to check
    // @return the swap impact pool amount
    function getSwapImpactPoolAmount(DataStore dataStore, address market, address token) internal view returns (uint256) {
        return dataStore.getUint(Keys.swapImpactPoolAmountKey(market, token));
    }

    // @dev apply a delta to the swap impact pool
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to apply to
    // @param token the token to apply to
    // @param delta the delta amount
    function applyDeltaToSwapImpactPool(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        int256 delta
    ) internal returns (uint256) {
        uint256 nextValue = dataStore.applyBoundedDeltaToUint(
            Keys.swapImpactPoolAmountKey(market, token),
            delta
        );

        MarketEventUtils.emitSwapImpactPoolAmountUpdated(eventEmitter, market, token, delta, nextValue);

        return nextValue;
    }

    // @dev apply a delta to the position impact pool
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to apply to
    // @param delta the delta amount
    function applyDeltaToPositionImpactPool(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        int256 delta
    ) internal returns (uint256) {
        uint256 nextValue = dataStore.applyBoundedDeltaToUint(
            Keys.positionImpactPoolAmountKey(market),
            delta
        );

        MarketEventUtils.emitPositionImpactPoolAmountUpdated(eventEmitter, market, delta, nextValue);

        return nextValue;
    }

    // @dev apply a delta to the open interest
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to apply to
    // @param collateralToken the collateralToken to apply to
    // @param isLong whether to apply to the long or short side
    // @param delta the delta amount
    function applyDeltaToOpenInterest(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address indexToken,
        address collateralToken,
        bool isLong,
        int256 delta
    ) internal returns (uint256) {
        if (indexToken == address(0)) {
            revert OpenInterestCannotBeUpdatedForSwapOnlyMarket(market);
        }

        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.openInterestKey(market, collateralToken, isLong),
            delta,
            "Invalid state: negative open interest"
        );

        // if the open interest for longs is increased then tokens were virtually bought from the pool
        // so the virtual inventory should be decreased
        // if the open interest for longs is decreased then tokens were virtually sold to the pool
        // so the virtual inventory should be increased
        // if the open interest for shorts is increased then tokens were virtually sold to the pool
        // so the virtual inventory should be increased
        // if the open interest for shorts is decreased then tokens were virtually bought the pool
        // so the virtual inventory should be decreased
        applyDeltaToVirtualInventoryForPositions(
            dataStore,
            eventEmitter,
            indexToken,
            isLong ? -delta : delta
        );

        MarketEventUtils.emitOpenInterestUpdated(eventEmitter, market, collateralToken, isLong, delta, nextValue);

        return nextValue;
    }

    // @dev apply a delta to the open interest in tokens
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to apply to
    // @param collateralToken the collateralToken to apply to
    // @param isLong whether to apply to the long or short side
    // @param delta the delta amount
    function applyDeltaToOpenInterestInTokens(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 delta
    ) internal returns (uint256) {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.openInterestInTokensKey(market, collateralToken, isLong),
            delta,
            "Invalid state: negative open interest in tokens"
        );

        MarketEventUtils.emitOpenInterestInTokensUpdated(eventEmitter, market, collateralToken, isLong, delta, nextValue);

        return nextValue;
    }

    // @dev apply a delta to the collateral sum
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to apply to
    // @param collateralToken the collateralToken to apply to
    // @param isLong whether to apply to the long or short side
    // @param delta the delta amount
    function applyDeltaToCollateralSum(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 delta
    ) internal returns (uint256) {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.collateralSumKey(market, collateralToken, isLong),
            delta,
            "Invalid state: negative collateralSum"
        );

        MarketEventUtils.emitCollateralSumUpdated(eventEmitter, market, collateralToken, isLong, delta, nextValue);

        return nextValue;
    }

    // @dev update the funding amount per size values
    // @param dataStore DataStore
    // @param prices the prices of the market tokens
    // @param market the market to update
    // @param longToken the market's long token
    // @param shortToken the market's short token
    function updateFundingAmountPerSize(
        DataStore dataStore,
        EventEmitter eventEmitter,
        Market.Props memory market,
        MarketPrices memory prices
    ) external {
        GetNextFundingAmountPerSizeResult memory result = getNextFundingAmountPerSize(dataStore, market, prices);

        setFundingAmountPerSize(dataStore, eventEmitter, market.marketToken, market.longToken, true, result.fundingAmountPerSize_LongCollateral_LongPosition);
        setFundingAmountPerSize(dataStore, eventEmitter, market.marketToken, market.longToken, false, result.fundingAmountPerSize_LongCollateral_ShortPosition);
        setFundingAmountPerSize(dataStore, eventEmitter, market.marketToken, market.shortToken, true, result.fundingAmountPerSize_ShortCollateral_LongPosition);
        setFundingAmountPerSize(dataStore, eventEmitter, market.marketToken, market.shortToken, false, result.fundingAmountPerSize_ShortCollateral_ShortPosition);

        dataStore.setUint(Keys.fundingUpdatedAtKey(market.marketToken), block.timestamp);
    }

    // @dev get the next funding amount per size values
    // @param dataStore DataStore
    // @param prices the prices of the market tokens
    // @param market the market to update
    // @param longToken the market's long token
    // @param shortToken the market's short token
    function getNextFundingAmountPerSize(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices
    ) internal view returns (GetNextFundingAmountPerSizeResult memory) {
        GetNextFundingAmountPerSizeResult memory result;
        GetNextFundingAmountPerSizeCache memory cache;

        cache.oi.longOpenInterestWithLongCollateral = getOpenInterest(dataStore, market.marketToken, market.longToken, true);
        cache.oi.longOpenInterestWithShortCollateral = getOpenInterest(dataStore, market.marketToken, market.shortToken, true);
        cache.oi.shortOpenInterestWithLongCollateral = getOpenInterest(dataStore, market.marketToken, market.longToken, false);
        cache.oi.shortOpenInterestWithShortCollateral = getOpenInterest(dataStore, market.marketToken, market.shortToken, false);

        cache.oi.longOpenInterest = cache.oi.longOpenInterestWithLongCollateral + cache.oi.longOpenInterestWithShortCollateral;
        cache.oi.shortOpenInterest = cache.oi.shortOpenInterestWithLongCollateral + cache.oi.shortOpenInterestWithShortCollateral;

        result.fundingAmountPerSize_LongCollateral_LongPosition = getFundingAmountPerSize(dataStore, market.marketToken, market.longToken, true);
        result.fundingAmountPerSize_LongCollateral_ShortPosition = getFundingAmountPerSize(dataStore, market.marketToken, market.longToken, false);
        result.fundingAmountPerSize_ShortCollateral_LongPosition = getFundingAmountPerSize(dataStore, market.marketToken, market.shortToken, true);
        result.fundingAmountPerSize_ShortCollateral_ShortPosition = getFundingAmountPerSize(dataStore, market.marketToken, market.shortToken, false);

        if (cache.oi.longOpenInterest == 0 || cache.oi.shortOpenInterest == 0) {
            return result;
        }

        cache.durationInSeconds = getSecondsSinceFundingUpdated(dataStore, market.marketToken);

        cache.diffUsd = Calc.diff(cache.oi.longOpenInterest, cache.oi.shortOpenInterest);
        cache.totalOpenInterest = cache.oi.longOpenInterest + cache.oi.shortOpenInterest;
        cache.sizeOfLargerSide = cache.oi.longOpenInterest > cache.oi.shortOpenInterest ? cache.oi.longOpenInterest : cache.oi.shortOpenInterest;
        cache.fundingFactorPerSecond = getFundingFactorPerSecond(
            dataStore,
            market.marketToken,
            cache.diffUsd,
            cache.totalOpenInterest
        );
        cache.fundingUsd = (cache.sizeOfLargerSide / Precision.FLOAT_PRECISION) * cache.durationInSeconds * cache.fundingFactorPerSecond;

        result.longsPayShorts = cache.oi.longOpenInterest > cache.oi.shortOpenInterest;

        if (result.longsPayShorts) {
            cache.fundingUsdForLongCollateral = cache.fundingUsd * cache.oi.longOpenInterestWithLongCollateral / cache.oi.longOpenInterest;
            cache.fundingUsdForShortCollateral = cache.fundingUsd * cache.oi.longOpenInterestWithShortCollateral / cache.oi.longOpenInterest;
        } else {
            cache.fundingUsdForLongCollateral = cache.fundingUsd * cache.oi.shortOpenInterestWithLongCollateral / cache.oi.shortOpenInterest;
            cache.fundingUsdForShortCollateral = cache.fundingUsd * cache.oi.shortOpenInterestWithShortCollateral / cache.oi.shortOpenInterest;
        }

        // use Precision.FLOAT_PRECISION here because fundingUsdForLongCollateral or fundingUsdForShortCollateral divided by longTokenPrice
        // will give an amount in number of tokens which may be quite a small value and could become zero after being divided by longOpenInterest
        // the result will be the amount in number of tokens multiplied by Precision.FLOAT_PRECISION per 1 USD of size
        cache.fps.fundingAmountPerSizePortion_LongCollateral_LongPosition = getPerSizeValue(cache.fundingUsdForLongCollateral / prices.longTokenPrice.max, cache.oi.longOpenInterest);
        cache.fps.fundingAmountPerSizePortion_LongCollateral_ShortPosition = getPerSizeValue(cache.fundingUsdForLongCollateral / prices.longTokenPrice.max, cache.oi.shortOpenInterest);
        cache.fps.fundingAmountPerSizePortion_ShortCollateral_LongPosition = getPerSizeValue(cache.fundingUsdForShortCollateral / prices.shortTokenPrice.max, cache.oi.longOpenInterest);
        cache.fps.fundingAmountPerSizePortion_ShortCollateral_ShortPosition = getPerSizeValue(cache.fundingUsdForShortCollateral / prices.shortTokenPrice.max, cache.oi.shortOpenInterest);

        if (result.longsPayShorts) {
            // longs pay shorts
            result.fundingAmountPerSize_LongCollateral_LongPosition = Calc.boundedAdd(
                result.fundingAmountPerSize_LongCollateral_LongPosition,
                cache.fps.fundingAmountPerSizePortion_LongCollateral_LongPosition.toInt256()
            );

            result.fundingAmountPerSize_LongCollateral_ShortPosition = Calc.boundedSub(
                result.fundingAmountPerSize_LongCollateral_ShortPosition,
                cache.fps.fundingAmountPerSizePortion_LongCollateral_ShortPosition.toInt256()
            );

            result.fundingAmountPerSize_ShortCollateral_LongPosition = Calc.boundedAdd(
                result.fundingAmountPerSize_ShortCollateral_LongPosition,
                cache.fps.fundingAmountPerSizePortion_ShortCollateral_LongPosition.toInt256()
            );

            result.fundingAmountPerSize_ShortCollateral_ShortPosition = Calc.boundedSub(
                result.fundingAmountPerSize_ShortCollateral_ShortPosition,
                cache.fps.fundingAmountPerSizePortion_ShortCollateral_ShortPosition.toInt256()
            );
        } else {
            // shorts pay longs
            result.fundingAmountPerSize_LongCollateral_LongPosition = Calc.boundedSub(
                result.fundingAmountPerSize_LongCollateral_LongPosition,
                cache.fps.fundingAmountPerSizePortion_LongCollateral_LongPosition.toInt256()
            );

            result.fundingAmountPerSize_LongCollateral_ShortPosition = Calc.boundedAdd(
                result.fundingAmountPerSize_LongCollateral_ShortPosition,
                cache.fps.fundingAmountPerSizePortion_LongCollateral_ShortPosition.toInt256()
            );

            result.fundingAmountPerSize_ShortCollateral_LongPosition = Calc.boundedSub(
                result.fundingAmountPerSize_ShortCollateral_LongPosition,
                cache.fps.fundingAmountPerSizePortion_ShortCollateral_LongPosition.toInt256()
            );

            result.fundingAmountPerSize_ShortCollateral_ShortPosition = Calc.boundedAdd(
                result.fundingAmountPerSize_ShortCollateral_ShortPosition,
                cache.fps.fundingAmountPerSizePortion_ShortCollateral_ShortPosition.toInt256()
            );
        }

        return result;
    }

    // @dev update the cumulative borrowing factor for a market
    // @param dataStore DataStore
    // @param market the market to update
    // @param longToken the market's long token
    // @param shortToken the market's short token
    // @param prices the prices of the market tokens
    // @param isLong whether to update the long or short side
    function updateCumulativeBorrowingFactor(
        DataStore dataStore,
        EventEmitter eventEmitter,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong
    ) external {
        (/* uint256 nextCumulativeBorrowingFactor */, uint256 delta) = getNextCumulativeBorrowingFactor(
            dataStore,
            market,
            prices,
            isLong
        );

        incrementCumulativeBorrowingFactor(
            dataStore,
            eventEmitter,
            market.marketToken,
            isLong,
            delta
        );

        dataStore.setUint(Keys.cumulativeBorrowingFactorUpdatedAtKey(market.marketToken, isLong), block.timestamp);
    }

    // @dev calculate the per size value based on the amount and totalSize
    // @param amount the amount
    // @param totalSize the total size
    // @return the per size value
    function getPerSizeValue(uint256 amount, uint256 totalSize) internal pure returns (uint256) {
        return Precision.toFactor(amount, totalSize);
    }

    // @dev get the ratio of pnl to pool value
    // @param dataStore DataStore
    // @param oracle Oracle
    // @param market the trading market
    // @param isLong whether to get the value for the long or short side
    // @param maximize whether to maximize the factor
    // @return (pnl of positions) / (long or short pool value)
    function getPnlToPoolFactor(
        DataStore dataStore,
        Oracle oracle,
        address market,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        Market.Props memory _market = getEnabledMarket(dataStore, market);
        MarketPrices memory prices = MarketPrices(
            oracle.getPrimaryPrice(_market.indexToken),
            oracle.getPrimaryPrice(_market.longToken),
            oracle.getPrimaryPrice(_market.shortToken)
        );

        return getPnlToPoolFactor(dataStore, _market, prices, isLong, maximize);
    }

    // @dev get the ratio of pnl to pool value
    // @param dataStore DataStore
    // @param market the market values
    // @param prices the prices of the market tokens
    // @param isLong whether to get the value for the long or short side
    // @param maximize whether to maximize the factor
    // @return (pnl of positions) / (long or short pool value)
    function getPnlToPoolFactor(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        uint256 poolUsd = getPoolUsdWithoutPnl(dataStore, market, prices, isLong);

        if (poolUsd == 0) {
            return 0;
        }

        int256 pnl = getPnl(
            dataStore,
            market.marketToken,
            market.longToken,
            market.shortToken,
            prices.indexTokenPrice,
            isLong,
            maximize
        );

        return Precision.toFactor(pnl, poolUsd);
    }

    function validateOpenInterest(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        bool isLong
    ) internal view {
        uint256 openInterest = getOpenInterest(dataStore, market, longToken, shortToken, isLong);
        uint256 maxOpenInterest = getMaxOpenInterest(dataStore, market, isLong);

        if (openInterest > maxOpenInterest) {
            revert MaxOpenInterestExceeded(openInterest, maxOpenInterest);
        }
    }

    // @dev validate that the pool amount is within the max allowed amount
    // @param dataStore DataStore
    // @param market the market to check
    // @param token the token to check
    function validatePoolAmount(
        DataStore dataStore,
        address market,
        address token
    ) internal view {
        uint256 poolAmount = getPoolAmount(dataStore, market, token);
        uint256 maxPoolAmount = getMaxPoolAmount(dataStore, market, token);

        if (poolAmount > maxPoolAmount) {
            revert MaxPoolAmountExceeded(poolAmount, maxPoolAmount);
        }
    }

    // @dev validate that the amount of tokens required to be reserved for positions
    // is below the configured threshold
    // @param dataStore DataStore
    // @param market the market values
    // @param prices the prices of the market tokens
    // @param isLong whether to check the long or short side
    function validateReserve(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong
    ) internal view {
        // poolUsd is used instead of pool amount as the indexToken may not match the longToken
        // additionally, the shortToken may not be a stablecoin
        uint256 poolUsd = getPoolUsdWithoutPnl(dataStore, market, prices, isLong);
        uint256 reserveFactor = getReserveFactor(dataStore, market.marketToken, isLong);
        uint256 maxReservedUsd = Precision.applyFactor(poolUsd, reserveFactor);

        uint256 reservedUsd = getReservedUsd(
            dataStore,
            market,
            prices,
            isLong
        );

        if (reservedUsd > maxReservedUsd) {
            revert InsufficientReserve(reservedUsd, maxReservedUsd);
        }
    }

    // @dev update the swap impact pool amount, if it is a positive impact amount
    // cap the impact amount to the amount available in the swap impact pool
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to apply to
    // @param token the token to apply to
    // @param tokenPrice the price of the token
    // @param priceImpactUsd the USD price impact
    function applySwapImpactWithCap(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        Price.Props memory tokenPrice,
        int256 priceImpactUsd
    ) internal returns (int256) {
        // positive impact: minimize impactAmount, use tokenPrice.max
        // negative impact: maximize impactAmount, use tokenPrice.min
        uint256 price = priceImpactUsd > 0 ? tokenPrice.max : tokenPrice.min;

        int256 impactAmount;

        if (priceImpactUsd > 0) {
            // round positive impactAmount down, this will be deducted from the swap impact pool for the user
            impactAmount = priceImpactUsd / price.toInt256();

            int256 maxImpactAmount = getSwapImpactPoolAmount(dataStore, market, token).toInt256();
            if (impactAmount > maxImpactAmount) {
                impactAmount = maxImpactAmount;
            }
        } else {
            // round negative impactAmount up, this will be deducted from the user
            impactAmount = Calc.roundUpDivision(priceImpactUsd, price);
        }

        // if there is a positive impact, the impact pool amount should be reduced
        // if there is a negative impact, the impact pool amount should be increased
        applyDeltaToSwapImpactPool(
            dataStore,
            eventEmitter,
            market,
            token,
            -impactAmount
        );

        return impactAmount;
    }

    // @dev get the funding fee amount to be deducted or distributed
    //
    // a hasPendingFundingFee value is returned to indicate if there is a non-zero
    // pending funding fee even though the current funding fee is zero
    // this is because it is possible for there to be a funding fee that is too small
    // resulting in the fundingFeeAmount being zero after rounding
    // in this case the position's fundingAmountPerSize should not be updated, otherwise
    // a user could avoid paying funding fees by continually updating the position
    // before the funding fee becomes large enough to be chargeable
    //
    // @param latestFundingAmountPerSize the latest funding amount per size
    // @param positionFundingAmountPerSize the funding amount per size for the position
    // @param positionSizeInUsd the position size in USD
    //
    // @return (hasPendingFundingFee, fundingFeeAmount)
    function getFundingFeeAmount(
        int256 latestFundingAmountPerSize,
        int256 positionFundingAmountPerSize,
        uint256 positionSizeInUsd
    ) internal pure returns (bool, int256) {
        int256 fundingDiffFactor = (latestFundingAmountPerSize - positionFundingAmountPerSize);
        int256 amount = Precision.applyFactor(positionSizeInUsd, fundingDiffFactor);

        return (fundingDiffFactor != 0 && amount == 0, amount);
    }

    // @dev get the borrowing fees for a position, assumes that cumulativeBorrowingFactor
    // has already been updated to the latest value
    // @param dataStore DataStore
    // @param position Position.Props
    // @return the borrowing fees for a position
    function getBorrowingFees(DataStore dataStore, Position.Props memory position) internal view returns (uint256) {
        uint256 cumulativeBorrowingFactor = getCumulativeBorrowingFactor(dataStore, position.market(), position.isLong());
        if (position.borrowingFactor() > cumulativeBorrowingFactor) {
            revert UnexpectedBorrowingFactor(position.borrowingFactor(), cumulativeBorrowingFactor);
        }
        uint256 diffFactor = cumulativeBorrowingFactor - position.borrowingFactor();
        return Precision.applyFactor(position.sizeInUsd(), diffFactor);
    }

    // @dev get the borrowing fees for a position by calculating the latest cumulativeBorrowingFactor
    // @param dataStore DataStore
    // @param position Position.Props
    // @param market the position's market
    // @param prices the prices of the market tokens
    // @return the borrowing fees for a position
    function getNextBorrowingFees(DataStore dataStore, Position.Props memory position, Market.Props memory market, MarketPrices memory prices) internal view returns (uint256) {
        (uint256 nextCumulativeBorrowingFactor, /* uint256 delta */) = getNextCumulativeBorrowingFactor(
            dataStore,
            market,
            prices,
            position.isLong()
        );

        if (position.borrowingFactor() > nextCumulativeBorrowingFactor) {
            revert UnexpectedBorrowingFactor(position.borrowingFactor(), nextCumulativeBorrowingFactor);
        }
        uint256 diffFactor = nextCumulativeBorrowingFactor - position.borrowingFactor();
        return Precision.applyFactor(position.sizeInUsd(), diffFactor);
    }

    // @dev get the total reserved USD required for positions
    // @param market the market to check
    // @param prices the prices of the market tokens
    // @param isLong whether to get the value for the long or short side
    function getReservedUsd(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong
    ) internal view returns (uint256) {
        uint256 reservedUsd;
        if (isLong) {
            // for longs calculate the reserved USD based on the open interest and current indexTokenPrice
            // this works well for e.g. an ETH / USD market with long collateral token as WETH
            // the available amount to be reserved would scale with the price of ETH
            // this also works for e.g. a SOL / USD market with long collateral token as WETH
            // if the price of SOL increases more than the price of ETH, additional amounts would be
            // automatically reserved
            uint256 openInterestInTokens = getOpenInterestInTokens(dataStore, market.marketToken, market.longToken, market.shortToken, isLong);
            reservedUsd = openInterestInTokens * prices.indexTokenPrice.max;
        } else {
            // for shorts use the open interest as the reserved USD value
            // this works well for e.g. an ETH / USD market with short collateral token as USDC
            // the available amount to be reserved would not change with the price of ETH
            reservedUsd = getOpenInterest(dataStore, market.marketToken, market.longToken, market.shortToken, isLong);
        }

        return reservedUsd;
    }

    // @dev get the virtual inventory for swaps
    // @param dataStore DataStore
    // @param market the market to check
    // @param token the token to check
    function getVirtualInventoryForSwaps(DataStore dataStore, address market, address token) internal view returns (bool, uint256) {
        bytes32 marketId = dataStore.getBytes32(Keys.virtualMarketIdKey(market));
        if (marketId == bytes32(0)) {
            return (false, 0);
        }

        return (true, dataStore.getUint(Keys.virtualInventoryForSwapsKey(marketId, token)));
    }

    // @dev get the virtual inventory for positions
    // @param dataStore DataStore
    // @param token the token to check
    function getVirtualInventoryForPositions(DataStore dataStore, address token) internal view returns (bool, int256) {
        bytes32 tokenId = dataStore.getBytes32(Keys.virtualTokenIdKey(token));
        if (tokenId == bytes32(0)) {
            return (false, 0);
        }

        return (true, dataStore.getInt(Keys.virtualInventoryForPositionsKey(tokenId)));
    }

    // @dev get the threshold position impact for virtual inventory
    // @param dataStore DataStore
    // @param token the token to check
    function getThresholdPositionImpactFactorForVirtualInventory(DataStore dataStore, address token) internal view returns (bool, int256) {
        bytes32 tokenId = dataStore.getBytes32(Keys.virtualTokenIdKey(token));
        if (tokenId == bytes32(0)) {
            return (false, 0);
        }

        return (true, dataStore.getInt(Keys.thresholdPositionImpactFactorForVirtualInventoryKey(tokenId)));
    }

    // @dev get the threshold swap impact for virtual inventory
    // @param dataStore DataStore
    // @param token the token to check
    function getThresholdSwapImpactFactorForVirtualInventory(DataStore dataStore, address market) internal view returns (bool, int256) {
        bytes32 marketId = dataStore.getBytes32(Keys.virtualMarketIdKey(market));
        if (marketId == bytes32(0)) {
            return (false, 0);
        }

        return (true, dataStore.getInt(Keys.thresholdSwapImpactFactorForVirtualInventoryKey(marketId)));
    }

    // @dev update the virtual inventory for swaps
    // @param dataStore DataStore
    // @param market the market to update
    // @param token the token to update
    // @param delta the update amount
    function applyDeltaToVirtualInventoryForSwaps(DataStore dataStore, address market, address token, int256 delta) internal returns (bool, uint256) {
        bytes32 marketId = dataStore.getBytes32(Keys.virtualMarketIdKey(market));
        if (marketId == bytes32(0)) {
            return (false, 0);
        }

        uint256 nextValue = dataStore.applyBoundedDeltaToUint(
            Keys.virtualInventoryForSwapsKey(marketId, token),
            delta
        );

        return (true, nextValue);
    }

    // @dev update the virtual inventory for positions
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param token the token to update
    // @param delta the update amount
    function applyDeltaToVirtualInventoryForPositions(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address token,
        int256 delta
    ) internal returns (bool, int256) {
        bytes32 tokenId = dataStore.getBytes32(Keys.virtualTokenIdKey(token));
        if (tokenId == bytes32(0)) {
            return (false, 0);
        }

        int256 nextValue = dataStore.applyDeltaToInt(
            Keys.virtualInventoryForPositionsKey(tokenId),
            delta
        );

        MarketEventUtils.emitVirtualPositionInventoryUpdated(eventEmitter, token, tokenId, delta, nextValue);

        return (true, nextValue);
    }

    // @dev get the open interest of a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    function getOpenInterest(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken
    ) internal view returns (uint256) {
        uint256 longOpenInterest = getOpenInterest(dataStore, market, longToken, shortToken, true);
        uint256 shortOpenInterest = getOpenInterest(dataStore, market, longToken, shortToken, false);

        return longOpenInterest + shortOpenInterest;
    }

    // @dev get either the long or short open interest for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param isLong whether to get the long or short open interest
    // @return the long or short open interest for a market
    function getOpenInterest(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        bool isLong
    ) internal view returns (uint256) {
        uint256 openInterestUsingLongTokenAsCollateral = getOpenInterest(dataStore, market, longToken, isLong);
        uint256 openInterestUsingShortTokenAsCollateral = getOpenInterest(dataStore, market, shortToken, isLong);

        return openInterestUsingLongTokenAsCollateral + openInterestUsingShortTokenAsCollateral;
    }

    // @dev the long and short open interest for a market based on the collateral token used
    // @param dataStore DataStore
    // @param market the market to check
    // @param collateralToken the collateral token to check
    // @param isLong whether to check the long or short side
    function getOpenInterest(
        DataStore dataStore,
        address market,
        address collateralToken,
        bool isLong
    ) internal view returns (uint256) {
        return dataStore.getUint(Keys.openInterestKey(market, collateralToken, isLong));
    }

    // @dev the long and short open interest in tokens for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param isLong whether to check the long or short side
    function getOpenInterestInTokens(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        bool isLong
    ) internal view returns (uint256) {
        uint256 openInterestUsingLongTokenAsCollateral = getOpenInterestInTokens(dataStore, market, longToken, isLong);
        uint256 openInterestUsingShortTokenAsCollateral = getOpenInterestInTokens(dataStore, market, shortToken, isLong);

        return openInterestUsingLongTokenAsCollateral + openInterestUsingShortTokenAsCollateral;
    }

    // @dev the long and short open interest in tokens for a market based on the collateral token used
    // @param dataStore DataStore
    // @param market the market to check
    // @param collateralToken the collateral token to check
    // @param isLong whether to check the long or short side
    function getOpenInterestInTokens(
        DataStore dataStore,
        address market,
        address collateralToken,
        bool isLong
    ) internal view returns (uint256) {
        return dataStore.getUint(Keys.openInterestInTokensKey(market, collateralToken, isLong));
    }

    // @dev get the sum of open interest and pnl for a market
    // getOpenInterestInTokens * tokenPrice would not reflect pending positive pnl
    // for short positions, so getOpenInterestWithPnl should be used if that info is needed
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param indexTokenPrice the price of the index token
    // @param isLong whether to check the long or short side
    // @param maximize whether to maximize or minimize the value
    // @return the sum of open interest and pnl for a market
    function getOpenInterestWithPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        uint256 openInterest = getOpenInterest(dataStore, market, longToken, shortToken, isLong);
        int256 pnl = getPnl(dataStore, market, longToken, shortToken, indexTokenPrice, isLong, maximize);
        return Calc.sumReturnInt256(openInterest, pnl);
    }

    // @dev get the max position impact factor for decreasing position
    // @param dataStore DataStore
    // @param market the market to check
    // @param isPositive whether the price impact is positive or negative
    function getMaxPositionImpactFactor(DataStore dataStore, address market, bool isPositive) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPositionImpactFactorKey(market, isPositive));
    }

    // @dev get the max position impact factor for liquidations
    // @param dataStore DataStore
    // @param market the market to check
    function getMaxPositionImpactFactorForLiquidations(DataStore dataStore, address market) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPositionImpactFactorForLiquidationsKey(market));
    }

    // @dev get the min collateral factor
    // @param dataStore DataStore
    // @param market the market to check
    function getMinCollateralFactor(DataStore dataStore, address market) internal view returns (uint256) {
        return dataStore.getUint(Keys.minCollateralFactorKey(market));
    }

    // @dev get the min collateral factor for open interest multiplier
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether it is for the long or short side
    function getMinCollateralFactorForOpenInterestMultiplier(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.minCollateralFactorForOpenInterestMultiplierKey(market, isLong));
    }

    // @dev get the min collateral factor for open interest
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param openInterestDelta the change in open interest
    // @param isLong whether it is for the long or short side
    function getMinCollateralFactorForOpenInterest(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        int256 openInterestDelta,
        bool isLong
    ) internal view returns (uint256) {
        uint256 openInterest = getOpenInterest(dataStore, market, longToken, shortToken, isLong);
        openInterest = Calc.sumReturnUint256(openInterest, openInterestDelta);
        uint256 multiplierFactor = getMinCollateralFactorForOpenInterestMultiplier(dataStore, market, isLong);
        return Precision.applyFactor(openInterest, multiplierFactor);
    }

    // @dev get the total amount of position collateral for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param collateralToken the collateralToken to check
    // @param isLong whether to get the value for longs or shorts
    // @return the total amount of position collateral for a market
    function getCollateralSum(DataStore dataStore, address market, address collateralToken, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.collateralSumKey(market, collateralToken, isLong));
    }

    // @dev get the reserve factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to get the value for longs or shorts
    // @return the reserve factor for a market
    function getReserveFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.reserveFactorKey(market, isLong));
    }

    // @dev get the max pnl factor for a market
    // @param dataStore DataStore
    // @param pnlFactorType the type of the pnl factor
    // @param market the market to check
    // @param isLong whether to get the value for longs or shorts
    // @return the max pnl factor for a market
    function getMaxPnlFactor(DataStore dataStore, bytes32 pnlFactorType, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPnlFactorKey(pnlFactorType, market, isLong));
    }

    // @dev get the min pnl factor after ADL
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    function getMinPnlFactorAfterAdl(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.minPnlFactorAfterAdlKey(market, isLong));
    }

    // @dev get the funding factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @return the funding factor for a market
    function getFundingFactor(DataStore dataStore, address market) internal view returns (uint256) {
        return dataStore.getUint(Keys.fundingFactorKey(market));
    }

    // @dev get the funding exponent factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @return the funding exponent factor for a market
    function getFundingExponentFactor(DataStore dataStore, address market) internal view returns (uint256) {
        return dataStore.getUint(Keys.fundingExponentFactorKey(market));
    }

    // @dev get the funding amount per size for a market based on collateralToken
    // @param dataStore DataStore
    // @param market the market to check
    // @param collateralToken the collateralToken to check
    // @param isLong whether to check the long or short size
    // @return the funding amount per size for a market based on collateralToken
    function getFundingAmountPerSize(DataStore dataStore, address market, address collateralToken, bool isLong) internal view returns (int256) {
        return dataStore.getInt(Keys.fundingAmountPerSizeKey(market, collateralToken, isLong));
    }

    // @dev set the funding amount per size for a market based on collateralToken
    // @param dataStore DataStore
    // @param market the market to set
    // @param collateralToken the collateralToken to set
    // @param isLong whether to set it for the long or short side
    // @param value the value to set the funding amount per size to
    function setFundingAmountPerSize(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 value
    ) internal returns (int256) {
        MarketEventUtils.emitFundingAmountPerSizeUpdated(
            eventEmitter,
            market,
            collateralToken,
            isLong,
            value
        );

        return dataStore.setInt(Keys.fundingAmountPerSizeKey(market, collateralToken, isLong), value);
    }

    // @dev get the number of seconds since funding was updated for a market
    // @param market the market to check
    // @return the number of seconds since funding was updated for a market
    function getSecondsSinceFundingUpdated(DataStore dataStore, address market) internal view returns (uint256) {
        uint256 updatedAt = dataStore.getUint(Keys.fundingUpdatedAtKey(market));
        if (updatedAt == 0) { return 0; }
        return block.timestamp - updatedAt;
    }

    // @dev get the funding factor per second
    // @param dataStore DataStore
    // @param market the market to check
    // @param diffUsd the difference between the long and short open interest
    // @param totalOpenInterest the total open interest
    function getFundingFactorPerSecond(
        DataStore dataStore,
        address market,
        uint256 diffUsd,
        uint256 totalOpenInterest
    ) internal view returns (uint256) {
        if (diffUsd == 0) { return 0; }

        if (totalOpenInterest == 0) {
            revert UnableToGetFundingFactorEmptyOpenInterest();
        }

        uint256 fundingFactor = getFundingFactor(dataStore, market);

        uint256 fundingExponentFactor = getFundingExponentFactor(dataStore, market);
        uint256 diffUsdAfterExponent = Precision.applyExponentFactor(diffUsd, fundingExponentFactor);

        uint256 diffUsdToOpenInterestFactor = Precision.toFactor(diffUsdAfterExponent, totalOpenInterest);

        return Precision.applyFactor(diffUsdToOpenInterestFactor, fundingFactor);
    }

    // @dev get the borrowing factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @return the borrowing factor for a market
    function getBorrowingFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.borrowingFactorKey(market, isLong));
    }

    // @dev get the borrowing exponent factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @return the borrowing exponent factor for a market
    function getBorrowingExponentFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.borrowingExponentFactorKey(market, isLong));
    }

    // @dev get the cumulative borrowing factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @return the cumulative borrowing factor for a market
    function getCumulativeBorrowingFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.cumulativeBorrowingFactorKey(market, isLong));
    }

    // @dev increase the cumulative borrowing factor
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to increment the borrowing factor for
    // @param isLong whether to increment the long or short side
    // @param delta the increase amount
    function incrementCumulativeBorrowingFactor(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        bool isLong,
        uint256 delta
    ) internal {
        uint256 nextCumulativeBorrowingFactor = dataStore.incrementUint(
            Keys.cumulativeBorrowingFactorKey(market, isLong),
            delta
        );

        MarketEventUtils.emitBorrowingFactorUpdated(
            eventEmitter,
            market,
            isLong,
            delta,
            nextCumulativeBorrowingFactor
        );
    }

    // @dev get the timestamp of when the cumulative borrowing factor was last updated
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @return the timestamp of when the cumulative borrowing factor was last updated
    function getCumulativeBorrowingFactorUpdatedAt(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.cumulativeBorrowingFactorUpdatedAtKey(market, isLong));
    }

    // @dev get the number of seconds since the cumulative borrowing factor was last updated
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @return the number of seconds since the cumulative borrowing factor was last updated
    function getSecondsSinceCumulativeBorrowingFactorUpdated(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        uint256 updatedAt = getCumulativeBorrowingFactorUpdatedAt(dataStore, market, isLong);
        if (updatedAt == 0) { return 0; }
        return block.timestamp - updatedAt;
    }

    // @dev update the total borrowing amount after a position changes size
    // @param dataStore DataStore
    // @param market the market to update
    // @param isLong whether to update the long or short side
    // @param prevPositionSizeInUsd the previous position size in USD
    // @param prevPositionBorrowingFactor the previous position borrowing factor
    // @param nextPositionSizeInUsd the next position size in USD
    // @param nextPositionBorrowingFactor the next position borrowing factor
    function updateTotalBorrowing(
        DataStore dataStore,
        address market,
        bool isLong,
        uint256 prevPositionSizeInUsd,
        uint256 prevPositionBorrowingFactor,
        uint256 nextPositionSizeInUsd,
        uint256 nextPositionBorrowingFactor
    ) external {
        uint256 totalBorrowing = getNextTotalBorrowing(
            dataStore,
            market,
            isLong,
            prevPositionSizeInUsd,
            prevPositionBorrowingFactor,
            nextPositionSizeInUsd,
            nextPositionBorrowingFactor
        );

        setTotalBorrowing(dataStore, market, isLong, totalBorrowing);
    }

    // @dev get the next total borrowing amount after a position changes size
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @param prevPositionSizeInUsd the previous position size in USD
    // @param prevPositionBorrowingFactor the previous position borrowing factor
    // @param nextPositionSizeInUsd the next position size in USD
    // @param nextPositionBorrowingFactor the next position borrowing factor
    function getNextTotalBorrowing(
        DataStore dataStore,
        address market,
        bool isLong,
        uint256 prevPositionSizeInUsd,
        uint256 prevPositionBorrowingFactor,
        uint256 nextPositionSizeInUsd,
        uint256 nextPositionBorrowingFactor
    ) internal view returns (uint256) {
        uint256 totalBorrowing = getTotalBorrowing(dataStore, market, isLong);
        totalBorrowing -= prevPositionSizeInUsd * prevPositionBorrowingFactor;
        totalBorrowing += nextPositionSizeInUsd * nextPositionBorrowingFactor;

        return totalBorrowing;
    }

    // @dev get the next cumulative borrowing factor
    // @param dataStore DataStore
    // @param prices the prices of the market tokens
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param isLong whether to check the long or short side
    function getNextCumulativeBorrowingFactor(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong
    ) internal view returns (uint256, uint256) {
        uint256 durationInSeconds = getSecondsSinceCumulativeBorrowingFactorUpdated(dataStore, market.marketToken, isLong);
        uint256 borrowingFactorPerSecond = getBorrowingFactorPerSecond(
            dataStore,
            market,
            prices,
            isLong
        );

        uint256 cumulativeBorrowingFactor = getCumulativeBorrowingFactor(dataStore, market.marketToken, isLong);

        uint256 delta = durationInSeconds * borrowingFactorPerSecond;
        uint256 nextCumulativeBorrowingFactor = cumulativeBorrowingFactor + delta;
        return (nextCumulativeBorrowingFactor, delta);
    }

    // @dev get the borrowing factor per second
    // @param dataStore DataStore
    // @param market the market to get the borrowing factor per second for
    // @param prices the prices of the market tokens
    // @param isLong whether to get the factor for the long or short side
    function getBorrowingFactorPerSecond(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong
    ) internal view returns (uint256) {
        uint256 borrowingFactor = getBorrowingFactor(dataStore, market.marketToken, isLong);

        uint256 reservedUsd = getReservedUsd(
            dataStore,
            market,
            prices,
            isLong
        );

        if (reservedUsd == 0) { return 0; }

        uint256 poolUsd = getPoolUsdWithoutPnl(dataStore, market, prices, isLong);

        if (poolUsd == 0) {
            revert UnableToGetBorrowingFactorEmptyPoolUsd();
        }

        uint256 borrowingExponentFactor = getBorrowingExponentFactor(dataStore, market.marketToken, isLong);
        uint256 reservedUsdAfterExponent = Precision.applyExponentFactor(reservedUsd, borrowingExponentFactor);

        uint256 reservedUsdToPoolFactor = Precision.toFactor(reservedUsdAfterExponent, poolUsd);
        return Precision.applyFactor(reservedUsdToPoolFactor, borrowingFactor);
    }

    // @dev get the total borrowing fees
    // @param dataStore DataStore
    // @param market the market to check
    // @param longToken the long token of the market
    // @param shortToken the short token of the market
    // @param isLong whether to check the long or short side
    function getTotalBorrowingFees(DataStore dataStore, address market, address longToken, address shortToken, bool isLong) internal view returns (uint256) {
        uint256 openInterest = getOpenInterest(dataStore, market, longToken, shortToken, isLong);
        uint256 cumulativeBorrowingFactor = getCumulativeBorrowingFactor(dataStore, market, isLong);
        uint256 totalBorrowing = getTotalBorrowing(dataStore, market, isLong);
        return openInterest * cumulativeBorrowingFactor - totalBorrowing;
    }

    // @dev get the total borrowing value
    // the total borrowing value is the sum of position.borrowingFactor * position.size
    // for all positions of the market
    // if borrowing APR is 1000% for 100 years, the cumulativeBorrowingFactor could be as high as 100 * 1000 * (10 ** 30)
    // since position.size is a USD value with 30 decimals, under this scenario, there may be overflow issues
    // if open interest exceeds (2 ** 256) / (10 ** 30) / (100 * 1000 * (10 ** 30)) => 1,157,920,900,000 USD
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @return the total borrowing value
    function getTotalBorrowing(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.totalBorrowingKey(market, isLong));
    }

    // @dev set the total borrowing value
    // @param dataStore DataStore
    // @param market the market to set
    // @param isLong whether to set the long or short side
    // @param value the value to set to
    function setTotalBorrowing(DataStore dataStore, address market, bool isLong, uint256 value) internal returns (uint256) {
        return dataStore.setUint(Keys.totalBorrowingKey(market, isLong), value);
    }

    // @dev convert a USD value to number of market tokens
    // @param usdValue the input USD value
    // @param poolValue the value of the pool
    // @param supply the supply of market tokens
    // @return the number of market tokens
    function usdToMarketTokenAmount(
        uint256 usdValue,
        uint256 poolValue,
        uint256 supply
    ) internal pure returns (uint256) {
        if (supply == 0 || poolValue == 0) {
            return Precision.floatToWei(usdValue);
        }

        // round market tokens down
        return supply * usdValue / poolValue;
    }

    // @dev convert a number of market tokens to its USD value
    // @param marketTokenAmount the input number of market tokens
    // @param poolValue the value of the pool
    // @param supply the supply of market tokens
    // @return the USD value of the market tokens
    function marketTokenAmountToUsd(
        uint256 marketTokenAmount,
        uint256 poolValue,
        uint256 supply
    ) internal pure returns (uint256) {
        if (supply == 0 || poolValue == 0) {
            return 0;
        }

        return marketTokenAmount * poolValue / supply;
    }

    // @dev validate that the specified market exists and is enabled
    // @param dataStore DataStore
    // @param marketAddress the address of the market
    function validateEnabledMarket(DataStore dataStore, address marketAddress) internal view {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);

        if (market.marketToken == address(0)) {
            revert EmptyMarket();
        }

        bool isMarketDisabled = dataStore.getBool(Keys.isMarketDisabledKey(market.marketToken));
        if (isMarketDisabled) {
            revert DisabledMarket(market.marketToken);
        }
    }

    // @dev validate that the specified market exists and is enabled
    // @param dataStore DataStore
    // @param market the market to check
    function validateEnabledMarket(DataStore dataStore, Market.Props memory market) internal view {
        if (market.marketToken == address(0)) {
            revert EmptyMarket();
        }

        bool isMarketDisabled = dataStore.getBool(Keys.isMarketDisabledKey(market.marketToken));
        if (isMarketDisabled) {
            revert DisabledMarket(market.marketToken);
        }
    }

    // @dev validate that the positions can be opened in the given market
    // @param market the market to check
    function validatePositionMarket(Market.Props memory market) internal pure {
        if (isSwapOnlyMarket(market)) {
            revert InvalidPositionMarket(market.marketToken);
        }
    }

    // @dev check if a market only supports swaps and not positions
    // @param market the market to check
    function isSwapOnlyMarket(Market.Props memory market) internal pure returns (bool) {
        return market.indexToken == address(0);
    }

    // @dev check if the given token is a collateral token of the market
    // @param market the market to check
    // @param token the token to check
    function isMarketCollateralToken(Market.Props memory market, address token) internal pure returns (bool) {
        return token == market.longToken || token == market.shortToken;
    }

    // @dev validate if the given token is a collateral token of the market
    // @param market the market to check
    // @param token the token to check
    function validateMarketCollateralToken(Market.Props memory market, address token) internal pure {
        if (!isMarketCollateralToken(market, token)) {
            revert InvalidCollateralTokenForMarket(market.marketToken, token);
        }
    }

    // @dev get the enabled market, revert if the market does not exist or is not enabled
    // @param dataStore DataStore
    // @param marketAddress the address of the market
    function getEnabledMarket(DataStore dataStore, address marketAddress) internal view returns (Market.Props memory) {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);
        validateEnabledMarket(dataStore, market);
        return market;
    }

    // @dev get a list of market values based on an input array of market addresses
    // @param swapPath list of market addresses
    function getEnabledMarkets(DataStore dataStore, address[] memory swapPath) internal view returns (Market.Props[] memory) {
        Market.Props[] memory markets = new Market.Props[](swapPath.length);

        for (uint256 i = 0; i < swapPath.length; i++) {
            address marketAddress = swapPath[i];
            markets[i] = getEnabledMarket(dataStore, marketAddress);
        }

        return markets;
    }

    // @dev validate that the pending pnl is below the allowed amount
    // @param dataStore DataStore
    // @param market the market to check
    // @param prices the prices of the market tokens
    // @param pnlFactorType the pnl factor type to check
    function validateMaxPnl(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bytes32 pnlFactorType
    ) internal view {
        (bool isPnlFactorExceededForLongs, int256 pnlToPoolFactorForLongs, uint256 maxPnlFactorForLongs) = isPnlFactorExceeded(
            dataStore,
            market,
            prices,
            true,
            pnlFactorType
        );

        if (isPnlFactorExceededForLongs) {
            revert PnlFactorExceededForLongs(pnlToPoolFactorForLongs, maxPnlFactorForLongs);
        }

        (bool isPnlFactorExceededForShorts, int256 pnlToPoolFactorForShorts, uint256 maxPnlFactorForShorts) = isPnlFactorExceeded(
            dataStore,
            market,
            prices,
            false,
            pnlFactorType
        );

        if (isPnlFactorExceededForShorts) {
            revert PnlFactorExceededForShorts(pnlToPoolFactorForShorts, maxPnlFactorForShorts);
        }
    }

    // @dev check if the pending pnl exceeds the allowed amount
    // @param dataStore DataStore
    // @param oracle Oracle
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @param pnlFactorType the pnl factor type to check
    function isPnlFactorExceeded(
        DataStore dataStore,
        Oracle oracle,
        address market,
        bool isLong,
        bytes32 pnlFactorType
    ) internal view returns (bool, int256, uint256) {
        Market.Props memory _market = getEnabledMarket(dataStore, market);
        MarketPrices memory prices = getMarketPrices(oracle, _market);

        return isPnlFactorExceeded(
            dataStore,
            _market,
            prices,
            isLong,
            pnlFactorType
        );
    }

    // @dev check if the pending pnl exceeds the allowed amount
    // @param dataStore DataStore
    // @param _market the market to check
    // @param prices the prices of the market tokens
    // @param isLong whether to check the long or short side
    // @param pnlFactorType the pnl factor type to check
    function isPnlFactorExceeded(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong,
        bytes32 pnlFactorType
    ) internal view returns (bool, int256, uint256) {
        int256 pnlToPoolFactor = getPnlToPoolFactor(dataStore, market, prices, isLong, true);
        uint256 maxPnlFactor = getMaxPnlFactor(dataStore, pnlFactorType, market.marketToken, isLong);

        bool isExceeded = pnlToPoolFactor > 0 && pnlToPoolFactor.toUint256() > maxPnlFactor;

        return (isExceeded, pnlToPoolFactor, maxPnlFactor);
    }
}
