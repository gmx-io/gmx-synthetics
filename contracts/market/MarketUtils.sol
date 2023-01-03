// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../bank/StrictBank.sol";

import "../deposit/Deposit.sol";
import "../deposit/DepositStore.sol";
import "../withdrawal/Withdrawal.sol";

import "../market/Market.sol";
import "../market/MarketToken.sol";
import "../market/MarketStore.sol";
import "../position/Position.sol";
import "../order/Order.sol";

import "../oracle/Oracle.sol";
import "../price/Price.sol";

import "../fee/FeeReceiver.sol";
import "../fee/FeeUtils.sol";

import "../utils/Calc.sol";
import "../utils/Precision.sol";

// @title MarketUtils
// @dev Library for market functions
library MarketUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    using Deposit for Deposit.Props;
    using Market for Market.Props;
    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    uint256 public constant CLAIMABLE_COLLATERAL_AMOUNT_TIME_DIVISOR = 1 hours;

    // @dev struct to store the prices of tokens of a market
    // @param indexTokenPrice price of the market's index token
    // @param longTokenPrice price of the market's long token
    // @param shortTokenPrice price of the market's short token
    struct MarketPrices {
        Price.Props indexTokenPrice;
        Price.Props longTokenPrice;
        Price.Props shortTokenPrice;
    }

    struct GetNextFundingAmountPerSizeResult {
        uint256 fundingPerSecond;
        bool longsPayShorts;
        int256 fundingAmountPerSize_LongCollateral_LongPosition;
        int256 fundingAmountPerSize_LongCollateral_ShortPosition;
        int256 fundingAmountPerSize_ShortCollateral_LongPosition;
        int256 fundingAmountPerSize_ShortCollateral_ShortPosition;
    }

    // @dev _GetNextFundingAmountPerSizeCache struct used in getNextFundingAmountPerSize
    // to avoid stack too deep errors
    //
    // @param durationInSeconds duration in seconds since the last funding update
    // @param fundingFactor the funding factor for the market
    //
    // @param diffUsd the absolute difference in long and short open interest for the market
    // @param totalOpenInterest the total long and short open interest for the market
    // @param fundingUsd the funding amount in USD
    //
    // @param fundingUsdForLongCollateral the funding amount in USD for positions using the long token as collateral
    // @param fundingUsdForShortCollateral the funding amount in USD for positions using the short token as collateral
    struct _GetNextFundingAmountPerSizeCache {
        _GetNextFundingAmountPerSizeOpenInterestCache oi;
        _GetNextFundingAmountPerSizeFundingPerSizeCache fps;

        uint256 durationInSeconds;
        uint256 fundingFactor;

        uint256 diffUsd;
        uint256 totalOpenInterest;
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
    struct _GetNextFundingAmountPerSizeOpenInterestCache {
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
    struct _GetNextFundingAmountPerSizeFundingPerSizeCache {
        int256 fundingAmountPerSize_LongCollateral_LongPosition;
        int256 fundingAmountPerSize_LongCollateral_ShortPosition;
        int256 fundingAmountPerSize_ShortCollateral_LongPosition;
        int256 fundingAmountPerSize_ShortCollateral_ShortPosition;

        uint256 fundingAmountPerSizePortion_LongCollateral_LongPosition;
        uint256 fundingAmountPerSizePortion_ShortCollateral_LongPosition;
        uint256 fundingAmountPerSizePortion_LongCollateral_ShortPosition;
        uint256 fundingAmountPerSizePortion_ShortCollateral_ShortPosition;
    }


    // the first item of the swap path indicates if
    // any pre-swap is needed to unify the pnlToken and collateralToken for decrease positions
    address public constant NO_SWAP = address(1);
    address public constant SWAP_PNL_TOKEN_TO_COLLATERAL_TOKEN = address(2);
    address public constant SWAP_COLLATERAL_TOKEN_TO_PNL_TOKEN = address(3);

    error EmptyMarket();
    error DisabledMarket(address market);
    error InsufficientPoolAmount(uint256 poolAmount, uint256 amount);
    error InsufficientReserve(uint256 reservedUsd, uint256 maxReservedUsd);

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
        bool maximize
    ) internal view returns (int256) {
        int256 poolValue = getPoolValue(dataStore, market, longTokenPrice, shortTokenPrice, indexTokenPrice, maximize);
        if (poolValue == 0) { return 0; }

        uint256 supply = getMarketTokenSupply(MarketToken(payable(market.marketToken)));

        if (supply == 0) {
            revert("getMarketTokenPrice: unexpected state, supply is zero");
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

        revert("MarketUtils: invalid inputToken");
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

        revert("MarketUtils: invalid token");
    }

    // @dev return the latest prices for the market tokens
    // the secondary price for market.indexToken is overwritten for certain order
    // types, use this value instead of the primary price for positions
    // @param market the market values
    // @param oracle Oracle
    function getMarketPricesForPosition(Oracle oracle, Market.Props memory market) internal view returns (MarketPrices memory) {
        return MarketPrices(
            oracle.getLatestPrice(market.indexToken),
            oracle.getLatestPrice(market.longToken),
            oracle.getLatestPrice(market.shortToken)
        );
    }

    function getMarketPrices(Oracle oracle, Market.Props memory market) internal view returns (MarketPrices memory) {
        return MarketUtils.MarketPrices(
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
        bool maximize
    ) internal view returns (int256) {
        uint256 longTokenAmount = getPoolAmount(dataStore, market.marketToken, market.longToken);
        uint256 shortTokenAmount = getPoolAmount(dataStore, market.marketToken, market.shortToken);

        uint256 value;

        value = longTokenAmount * longTokenPrice.pickPrice(maximize);
        value += shortTokenAmount * shortTokenPrice.pickPrice(maximize);

        value += getTotalBorrowingFees(dataStore, market.marketToken, market.longToken, market.shortToken, true);
        value += getTotalBorrowingFees(dataStore, market.marketToken, market.longToken, market.shortToken, false);

        uint256 impactPoolAmount = getPositionImpactPoolAmount(dataStore, market.marketToken);
        value += impactPoolAmount * indexTokenPrice.pickPrice(maximize);

        // !maximize should be used for net pnl as a larger pnl leads to a smaller pool value
        // and a smaller pnl leads to a larger pool value
        int256 pnl = getNetPnl(dataStore, market.marketToken, market.longToken, market.shortToken, indexTokenPrice, !maximize);

        return Calc.sumReturnInt256(value, -pnl);
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

    function incrementClaimableCollateralAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        address account,
        uint256 delta
    ) internal {
        uint256 timeKey = block.timestamp / CLAIMABLE_COLLATERAL_AMOUNT_TIME_DIVISOR;

        uint256 nextValue = dataStore.incrementUint(
            Keys.claimableCollateralAmountKey(market, token, timeKey, account),
            delta
        );

        eventEmitter.emitClaimableCollateralUpdated(market, token, timeKey, account, delta, nextValue);
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

        eventEmitter.emitClaimableFundingUpdated(market, token, account, delta, nextValue);
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

        eventEmitter.emitFundingFeesClaimed(
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
        if (adjustedClaimableAmount <= claimedAmount) {
            revert("Collateral already claimed");
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

        eventEmitter.emitCollateralClaimed(
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
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.poolAmountKey(market, token),
            delta,
            "Invalid state, negative poolAmount"
        );

        eventEmitter.emitPoolAmountUpdated(market, token, delta, nextValue);
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
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.swapImpactPoolAmountKey(market, token),
            delta,
            "Invalid state: negative swapImpactPoolAmount"
        );

        eventEmitter.emitSwapImpactPoolAmountUpdated(market, token, delta, nextValue);
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
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.positionImpactPoolAmountKey(market),
            delta,
            "Invalid state: negative positionImpactPoolAmount"
        );

        eventEmitter.emitPositionImpactPoolAmountUpdated(market, delta, nextValue);
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
        address collateralToken,
        bool isLong,
        int256 delta
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.openInterestKey(market, collateralToken, isLong),
            delta,
            "Invalid state: negative open interest"
        );

        eventEmitter.emitOpenInterestUpdated(market, collateralToken, isLong, delta, nextValue);
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
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.openInterestInTokensKey(market, collateralToken, isLong),
            delta,
            "Invalid state: negative open interest in tokens"
        );

        eventEmitter.emitOpenInterestInTokensUpdated(market, collateralToken, isLong, delta, nextValue);
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
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.collateralSumKey(market, collateralToken, isLong),
            delta,
            "Invalid state: negative collateralSum"
        );

        eventEmitter.emitCollateralSumUpdated(market, collateralToken, isLong, delta, nextValue);
    }

    // @dev update the funding amount per size values
    // @param dataStore DataStore
    // @param prices the prices of the market tokens
    // @param market the market to update
    // @param longToken the market's long token
    // @param shortToken the market's short token
    function updateFundingAmountPerSize(
        DataStore dataStore,
        MarketPrices memory prices,
        address market,
        address longToken,
        address shortToken
    ) external {
        GetNextFundingAmountPerSizeResult memory result = getNextFundingAmountPerSize(dataStore, prices, market, longToken, shortToken);

        setFundingAmountPerSize(dataStore, market, longToken, true, result.fundingAmountPerSize_LongCollateral_LongPosition);
        setFundingAmountPerSize(dataStore, market, longToken, false, result.fundingAmountPerSize_LongCollateral_ShortPosition);
        setFundingAmountPerSize(dataStore, market, shortToken, true, result.fundingAmountPerSize_ShortCollateral_LongPosition);
        setFundingAmountPerSize(dataStore, market, shortToken, false, result.fundingAmountPerSize_ShortCollateral_ShortPosition);

        dataStore.setUint(Keys.fundingUpdatedAtKey(market), block.timestamp);
    }

    // @dev get the next funding amount per size values
    // @param dataStore DataStore
    // @param prices the prices of the market tokens
    // @param market the market to update
    // @param longToken the market's long token
    // @param shortToken the market's short token
    function getNextFundingAmountPerSize(
        DataStore dataStore,
        MarketPrices memory prices,
        address market,
        address longToken,
        address shortToken
    ) internal view returns (GetNextFundingAmountPerSizeResult memory) {
        GetNextFundingAmountPerSizeResult memory result;
        _GetNextFundingAmountPerSizeCache memory cache;

        cache.oi.longOpenInterestWithLongCollateral = getOpenInterest(dataStore, market, longToken, true);
        cache.oi.longOpenInterestWithShortCollateral = getOpenInterest(dataStore, market, shortToken, true);
        cache.oi.shortOpenInterestWithLongCollateral = getOpenInterest(dataStore, market, longToken, false);
        cache.oi.shortOpenInterestWithShortCollateral = getOpenInterest(dataStore, market, shortToken, false);

        cache.oi.longOpenInterest = cache.oi.longOpenInterestWithLongCollateral + cache.oi.longOpenInterestWithShortCollateral;
        cache.oi.shortOpenInterest = cache.oi.shortOpenInterestWithLongCollateral + cache.oi.shortOpenInterestWithShortCollateral;

        result.fundingAmountPerSize_LongCollateral_LongPosition = getFundingAmountPerSize(dataStore, market, longToken, true);
        result.fundingAmountPerSize_LongCollateral_ShortPosition = getFundingAmountPerSize(dataStore, market, longToken, false);
        result.fundingAmountPerSize_ShortCollateral_LongPosition = getFundingAmountPerSize(dataStore, market, shortToken, true);
        result.fundingAmountPerSize_ShortCollateral_ShortPosition = getFundingAmountPerSize(dataStore, market, shortToken, false);

        if (cache.oi.longOpenInterest == 0 || cache.oi.shortOpenInterest == 0) {
            return result;
        }

        cache.durationInSeconds = getSecondsSinceFundingUpdated(dataStore, market);
        cache.fundingFactor = getFundingFactor(dataStore, market);

        cache.diffUsd = Calc.diff(cache.oi.longOpenInterest, cache.oi.shortOpenInterest);
        cache.totalOpenInterest = cache.oi.longOpenInterest + cache.oi.shortOpenInterest;
        result.fundingPerSecond = cache.fundingFactor * cache.diffUsd / cache.totalOpenInterest;
        result.longsPayShorts = cache.oi.longOpenInterest > cache.oi.shortOpenInterest;
        cache.fundingUsd = cache.durationInSeconds * result.fundingPerSecond;

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
        MarketPrices memory prices,
        address market,
        address longToken,
        address shortToken,
        bool isLong
    ) external {
        uint256 borrowingFactor = getNextCumulativeBorrowingFactor(dataStore, prices, market, longToken, shortToken, isLong);
        setCumulativeBorrowingFactor(dataStore, market, isLong, borrowingFactor);
        dataStore.setUint(Keys.cumulativeBorrowingFactorUpdatedAtKey(market, isLong), block.timestamp);
    }

    // @dev calculate the per size value based on the amount and totalSize
    // @param amount the amount
    // @param totalSize the total size
    // @return the per size value
    function getPerSizeValue(uint256 amount, uint256 totalSize) internal pure returns (uint256) {
        return (amount * Precision.FLOAT_PRECISION) / (totalSize / Precision.FLOAT_PRECISION);
    }

    // @dev get the ratio of pnl to pool value
    // @param dataStore DataStore
    // @param marketStore MarketStore
    // @param oracle Oracle
    // @param market the trading market
    // @param isLong whether to get the value for the long or short side
    // @param maximize whether to maximize the factor
    // @return (pnl of positions) / (long or short pool value)
    function getPnlToPoolFactor(
        DataStore dataStore,
        MarketStore marketStore,
        Oracle oracle,
        address market,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        Market.Props memory _market = getEnabledMarket(dataStore, marketStore, market);
        MarketUtils.MarketPrices memory prices = MarketUtils.MarketPrices(
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

        return pnl * Precision.FLOAT_PRECISION.toInt256() / poolUsd.toInt256();
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
        uint256 poolUsd = getPoolUsdWithoutPnl(dataStore, market, prices, isLong);

        uint256 reserveFactor = getReserveFactor(dataStore, market.marketToken, isLong);
        uint256 maxReservedUsd = Precision.applyFactor(poolUsd, reserveFactor);

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
        // the position is just being opened, so there are no funding fees
        if (positionFundingAmountPerSize == 0) {
            return (false, 0);
        }

        int256 diff = (latestFundingAmountPerSize - positionFundingAmountPerSize);
        int256 amount = diff * (positionSizeInUsd.toInt256() / Precision.FLOAT_PRECISION.toInt256()) / Precision.FLOAT_PRECISION.toInt256();

        return (amount == 0, amount);
    }

    // @dev get the borrowing fees for a position
    // @param dataStore DataStore
    // @param position Position.Props
    // @return the borrowing fees for a position
    function getBorrowingFees(DataStore dataStore, Position.Props memory position) internal view returns (uint256) {
        uint256 cumulativeBorrowingFactor = getCumulativeBorrowingFactor(dataStore, position.market(), position.isLong());
        if (position.borrowingFactor() > cumulativeBorrowingFactor) {
            revert("getBorrowingFees: unexpected state");
        }
        uint256 diffFactor = cumulativeBorrowingFactor - position.borrowingFactor();
        return Precision.applyFactor(position.sizeInUsd(), diffFactor);
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

    function getMaxPositionImpactFactor(DataStore dataStore, address market, bool isPositive) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPositionImpactFactorKey(market, isPositive));
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
    // @param market the market to check
    // @param isLong whether to get the value for longs or shorts
    // @return the max pnl factor for a market
    function getMaxPnlFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPnlFactorKey(market, isLong));
    }

    // @dev get the max pnl factor for withdrawals a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to get the value for longs or shorts
    // @return the max pnl factor for withdrawals for a market
    function getMaxPnlFactorForWithdrawals(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPnlFactorForWithdrawalsKey(market, isLong));
    }

    // @dev get the funding factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @return the funding factor for a market
    function getFundingFactor(DataStore dataStore, address market) internal view returns (uint256) {
        return dataStore.getUint(Keys.fundingFactorKey(market));
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
    function setFundingAmountPerSize(DataStore dataStore, address market, address collateralToken, bool isLong, int256 value) internal returns (int256) {
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

    // @dev get the borrowing factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @return the borrowing factor for a market
    function getBorrowingFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.borrowingFactorKey(market, isLong));
    }

    // @dev get the cumulative borrowing factor for a market
    // @param dataStore DataStore
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @return the cumulative borrowing factor for a market
    function getCumulativeBorrowingFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.cumulativeBorrowingFactorKey(market, isLong));
    }

    // @dev set the cumulative borrowing factor for a market
    // @param dataStore DataStore
    // @param market the market to set
    // @param isLong whether to set the long or short side
    // @param value the value to set the cumulative borrowing factor to
    function setCumulativeBorrowingFactor(DataStore dataStore, address market, bool isLong, uint256 value) internal {
        dataStore.setUint(Keys.cumulativeBorrowingFactorKey(market, isLong), value);
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
        MarketPrices memory prices,
        address market,
        address longToken,
        address shortToken,
        bool isLong
    ) internal view returns (uint256) {
        uint256 durationInSeconds = getSecondsSinceCumulativeBorrowingFactorUpdated(dataStore, market, isLong);
        uint256 borrowingFactorPerSecond = getBorrowingFactorPerSecond(
            dataStore,
            prices,
            market,
            longToken,
            shortToken,
            isLong
        );

        uint256 cumulativeBorrowingFactor = getCumulativeBorrowingFactor(dataStore, market, isLong);

        return cumulativeBorrowingFactor + durationInSeconds * borrowingFactorPerSecond;
    }

    function getBorrowingFactorPerSecond(
        DataStore dataStore,
        MarketPrices memory prices,
        address market,
        address longToken,
        address shortToken,
        bool isLong
    ) internal view returns (uint256) {
        uint256 borrowingFactor = getBorrowingFactor(dataStore, market, isLong);

        int256 openInterestWithPnl = getOpenInterestWithPnl(dataStore, market, longToken, shortToken, prices.indexTokenPrice, isLong, true);
        if (openInterestWithPnl <= 0) {
            return 0;
        }

        uint256 poolAmount = getPoolAmount(dataStore, market, isLong ? longToken : shortToken);
        uint256 poolTokenPrice = isLong ? prices.longTokenPrice.min : prices.shortTokenPrice.min;
        uint256 poolUsd = poolAmount * poolTokenPrice;

        if (poolUsd == 0) {
            revert("getBorrowingFactorPerSecond: unexpected state, poolUsd is zero");
        }

        return borrowingFactor * openInterestWithPnl.toUint256() / poolUsd;
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

    // @dev validate that a market exists
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

    function getEnabledMarket(DataStore dataStore, MarketStore marketStore, address marketAddress) internal view returns (Market.Props memory) {
        Market.Props memory market = marketStore.get(marketAddress);
        validateEnabledMarket(dataStore, market);
        return market;
    }

    // @dev get a list of market values based on an input array of market addresses
    // @param marketStore MarketStore
    // @param swapPath list of market addresses
    function getEnabledMarkets(DataStore dataStore, MarketStore marketStore, address[] memory swapPath, bool allowSwapPathFlag) internal view returns (Market.Props[] memory) {
        Market.Props[] memory markets = new Market.Props[](swapPath.length);

        for (uint256 i = 0; i < swapPath.length; i++) {
            address marketAddress = swapPath[i];
            if (
                i == 0 &&
                allowSwapPathFlag &&
                (marketAddress == NO_SWAP ||
                marketAddress == SWAP_PNL_TOKEN_TO_COLLATERAL_TOKEN ||
                marketAddress == SWAP_COLLATERAL_TOKEN_TO_PNL_TOKEN)
            ) {
                    continue;
            }

            markets[i] = getEnabledMarket(dataStore, marketStore, marketAddress);
        }

        return markets;
    }
}
