// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../data/DataStore.sol";
import "../events/EventEmitter.sol";
import "../bank/StrictBank.sol";

import "../deposit/Deposit.sol";
import "../deposit/DepositStore.sol";
import "../withdrawal/Withdrawal.sol";

import "../market/Market.sol";
import "../market/MarketToken.sol";
import "../market/MarketStore.sol";
import "../position/Position.sol";
import "../position/PositionStore.sol";
import "../order/Order.sol";

import "../oracle/Oracle.sol";
import "../price/Price.sol";

import "../fee/FeeReceiver.sol";
import "../fee/FeeUtils.sol";

import "../utils/Calc.sol";
import "../utils/Precision.sol";

library MarketUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    using Deposit for Deposit.Props;
    using Market for Market.Props;
    using Position for Position.Props;
    using Order for Order.Props;
    using Price for Price.Props;

    struct MarketPrices {
        Price.Props indexTokenPrice;
        Price.Props longTokenPrice;
        Price.Props shortTokenPrice;
    }

    struct _GetNextFundingAmountPerSizeCache {
        uint256 longOpenInterestWithLongCollateral;
        uint256 longOpenInterestWithShortCollateral;
        uint256 shortOpenInterestWithLongCollateral;
        uint256 shortOpenInterestWithShortCollateral;

        uint256 longOpenInterest;
        uint256 shortOpenInterest;

        int256 longCollateralFundingPerSizeForLongs;
        int256 longCollateralFundingPerSizeForShorts;
        int256 shortCollateralFundingPerSizeForLongs;
        int256 shortCollateralFundingPerSizeForShorts;

        uint256 durationInSeconds;
        uint256 fundingFactor;

        uint256 diffUsd;
        uint256 totalOpenInterest;
        uint256 fundingUsd;

        uint256 fundingUsdForLongCollateral;
        uint256 fundingUsdForShortCollateral;

        uint256 fundingAmountPerSizeForLongCollateralForLongs;
        uint256 fundingAmountPerSizeForShortCollateralForLongs;
        uint256 fundingAmountPerSizeForLongCollateralForShorts;
        uint256 fundingAmountPerSizeForShortCollateralForShorts;
    }

    error EmptyMarket();
    error InsufficientPoolAmount(uint256 poolAmount, uint256 amount);
    error InsufficientReserve(uint256 reservedUsd, uint256 maxReservedUsd);

    function getMarketTokenPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) internal view returns (uint256) {
        uint256 poolValue = getPoolValue(dataStore, market, longTokenPrice, shortTokenPrice, indexTokenPrice, maximize);
        if (poolValue == 0) { return 0; }

        uint256 supply = getMarketTokenSupply(MarketToken(payable(market.marketToken)));

        // it may be possible for supply to be zero here
        return poolValue * Precision.WEI_PRECISION / supply;
    }

    function getMarketTokenSupply(MarketToken marketToken) internal view returns (uint256) {
        return marketToken.totalSupply();
    }

    function getOutputToken(address inputToken, Market.Props memory market) internal pure returns (address) {
        if (inputToken == market.longToken) {
            return market.shortToken;
        }
        if (inputToken == market.shortToken) {
            return market.longToken;
        }

        revert("MarketUtils: invalid inputToken");
    }

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

    // the secondary price for market.indexToken is overwritten for certain order
    // types, use this value instead of the primary price for positions
    function getMarketPricesForPosition(Market.Props memory market, Oracle oracle) internal view returns (MarketPrices memory) {
        return MarketPrices(
            oracle.getLatestPrice(market.indexToken),
            oracle.getLatestPrice(market.longToken),
            oracle.getLatestPrice(market.shortToken)
        );
    }

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

    // the value of a market's liquidity pool is the worth of the liquidity provider tokens in the pool - pending trader pnl
    // we use the token index prices to calculate this and ignore price impact since if all positions were closed the
    // net price impact should be zero
    // when minting liquidity provider tokens, the price impact of the token in should be considered
    // when redeeming liquidity provider tokens, the price impact of the token out should be considered
    function getPoolValue(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) internal view returns (uint256) {
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

        return Calc.sum(value, -pnl);
    }

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

    function getPoolAmount(DataStore dataStore, address market, address token) internal view returns (uint256) {
        return dataStore.getUint(Keys.poolAmountKey(market, token));
    }

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
            claimableAmount,
            receiver
        );

        eventEmitter.emitFundingFeesClaimed(
            market,
            token,
            account,
            receiver,
            claimableAmount
        );
    }

    function applyDeltaToPoolAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        int256 delta
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.poolAmountKey(market, token),
            delta
        );

        eventEmitter.emitPoolAmountUpdated(market, token, delta, nextValue);
    }

    function getCappedPositionImpactUsd(
        DataStore dataStore,
        address market,
        Price.Props memory tokenPrice,
        int256 priceImpactUsd
    ) internal view returns (int256) {
        if (priceImpactUsd < 0) {
            return priceImpactUsd;
        }

        uint256 impactPoolAmount = getPositionImpactPoolAmount(dataStore, market);
        int256 maxPositiveImpactUsd = (impactPoolAmount * tokenPrice.min).toInt256();

        if (priceImpactUsd > maxPositiveImpactUsd) {
            priceImpactUsd = maxPositiveImpactUsd;
        }

        return priceImpactUsd;
    }

    function getPositionImpactPoolAmount(DataStore dataStore, address market) internal view returns (uint256) {
        return dataStore.getUint(Keys.positionImpactPoolAmountKey(market));
    }

    function getSwapImpactPoolAmount(DataStore dataStore, address market, address token) internal view returns (uint256) {
        return dataStore.getUint(Keys.swapImpactPoolAmountKey(market, token));
    }

    function applyDeltaToSwapImpactPool(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        int256 delta
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.swapImpactPoolAmountKey(market, token),
            delta
        );

        eventEmitter.emitSwapImpactPoolAmountUpdated(market, token, delta, nextValue);
    }

    function applyDeltaToPositionImpactPool(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        int256 delta
    ) internal {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.positionImpactPoolAmountKey(market),
            delta,
            true
        );

        eventEmitter.emitPositionImpactPoolAmountUpdated(market, delta, nextValue);
    }

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
            delta
        );

        eventEmitter.emitOpenInterestUpdated(market, collateralToken, isLong, delta, nextValue);
    }

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
            delta
        );

        eventEmitter.emitOpenInterestInTokensUpdated(market, collateralToken, isLong, delta, nextValue);
    }

    function applyDeltaToCollateralSum(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 collateralDeltaAmount
    ) internal {
        dataStore.applyDeltaToUint(
            Keys.collateralSumKey(market, collateralToken, isLong),
            collateralDeltaAmount
        );

        eventEmitter.emitCollateralSumDelta(market, collateralToken, isLong, collateralDeltaAmount);
    }

    function updateFundingAmountPerSize(
        DataStore dataStore,
        MarketPrices memory prices,
        address market,
        address longToken,
        address shortToken
    ) internal {
        (
            int256 longCollateralFundingPerSizeForLongs,
            int256 longCollateralFundingPerSizeForShorts,
            int256 shortCollateralFundingPerSizeForLongs,
            int256 shortCollateralFundingPerSizeForShorts
        ) = getNextFundingAmountPerSize(dataStore, prices, market, longToken, shortToken);

        setFundingAmountPerSize(dataStore, market, longToken, true, longCollateralFundingPerSizeForLongs);
        setFundingAmountPerSize(dataStore, market, longToken, false, longCollateralFundingPerSizeForShorts);
        setFundingAmountPerSize(dataStore, market, shortToken, true, shortCollateralFundingPerSizeForLongs);
        setFundingAmountPerSize(dataStore, market, shortToken, false, shortCollateralFundingPerSizeForShorts);

        dataStore.setUint(Keys.fundingUpdatedAtKey(market), block.timestamp);
    }

    function getNextFundingAmountPerSize(
        DataStore dataStore,
        MarketPrices memory prices,
        address market,
        address longToken,
        address shortToken
    ) internal view returns (int256, int256, int256, int256) {
        _GetNextFundingAmountPerSizeCache memory cache;
        cache.longOpenInterestWithLongCollateral = getOpenInterest(dataStore, market, longToken, true);
        cache.longOpenInterestWithShortCollateral = getOpenInterest(dataStore, market, shortToken, true);
        cache.shortOpenInterestWithLongCollateral = getOpenInterest(dataStore, market, longToken, false);
        cache.shortOpenInterestWithShortCollateral = getOpenInterest(dataStore, market, shortToken, false);

        cache.longOpenInterest = cache.longOpenInterestWithLongCollateral + cache.longOpenInterestWithShortCollateral;
        cache.shortOpenInterest = cache.shortOpenInterestWithLongCollateral + cache.shortOpenInterestWithShortCollateral;

        cache.longCollateralFundingPerSizeForLongs = getFundingAmountPerSize(dataStore, market, longToken, true);
        cache.longCollateralFundingPerSizeForShorts = getFundingAmountPerSize(dataStore, market, longToken, false);
        cache.shortCollateralFundingPerSizeForLongs = getFundingAmountPerSize(dataStore, market, shortToken, true);
        cache.shortCollateralFundingPerSizeForShorts = getFundingAmountPerSize(dataStore, market, shortToken, false);

        if (cache.longOpenInterest == 0 || cache.shortOpenInterest == 0) {
            return (
                cache.longCollateralFundingPerSizeForLongs,
                cache.longCollateralFundingPerSizeForShorts,
                cache.shortCollateralFundingPerSizeForLongs,
                cache.shortCollateralFundingPerSizeForShorts
            );
        }

        cache.durationInSeconds = getSecondsSinceFundingUpdated(dataStore, market);
        cache.fundingFactor = getFundingFactor(dataStore, market);

        cache.diffUsd = Calc.diff(cache.longOpenInterest, cache.shortOpenInterest);
        cache.totalOpenInterest = cache.longOpenInterest + cache.shortOpenInterest;
        cache.fundingUsd = (cache.fundingFactor * cache.diffUsd * cache.durationInSeconds) / cache.totalOpenInterest;

        if (cache.longOpenInterest > cache.shortOpenInterest) {
            cache.fundingUsdForLongCollateral = cache.fundingUsd * cache.longOpenInterestWithLongCollateral / cache.longOpenInterest;
            cache.fundingUsdForShortCollateral = cache.fundingUsd * cache.longOpenInterestWithShortCollateral / cache.longOpenInterest;
        } else {
            cache.fundingUsdForLongCollateral = cache.fundingUsd * cache.shortOpenInterestWithLongCollateral / cache.shortOpenInterest;
            cache.fundingUsdForShortCollateral = cache.fundingUsd * cache.shortOpenInterestWithShortCollateral / cache.shortOpenInterest;
        }

        // use Precision.FLOAT_PRECISION here because fundingUsdForLongCollateral or fundingUsdForShortCollateral divided by longTokenPrice
        // will give an amount in number of tokens which may be quite a small value and could become zero after being divided by longOpenInterest
        // the result will be the amount in number of tokens multiplied by Precision.FLOAT_PRECISION per 1 USD of size
        cache.fundingAmountPerSizeForLongCollateralForLongs = getPerSizeValue(cache.fundingUsdForLongCollateral / prices.longTokenPrice.max, cache.longOpenInterest);
        cache.fundingAmountPerSizeForShortCollateralForLongs = getPerSizeValue(cache.fundingUsdForShortCollateral / prices.shortTokenPrice.max, cache.longOpenInterest);
        cache.fundingAmountPerSizeForLongCollateralForShorts = getPerSizeValue(cache.fundingUsdForLongCollateral / prices.longTokenPrice.max, cache.shortOpenInterest);
        cache.fundingAmountPerSizeForShortCollateralForShorts = getPerSizeValue(cache.fundingUsdForShortCollateral / prices.shortTokenPrice.max, cache.shortOpenInterest);

        if (cache.longOpenInterest > cache.shortOpenInterest) {
            // longs pay shorts
            cache.longCollateralFundingPerSizeForLongs += cache.fundingAmountPerSizeForLongCollateralForLongs.toInt256();
            cache.shortCollateralFundingPerSizeForLongs += cache.fundingAmountPerSizeForShortCollateralForLongs.toInt256();
            cache.shortCollateralFundingPerSizeForLongs -= cache.fundingAmountPerSizeForLongCollateralForShorts.toInt256();
            cache.shortCollateralFundingPerSizeForShorts -= cache.fundingAmountPerSizeForShortCollateralForShorts.toInt256();
        } else {
            // shorts pay longs
            cache.longCollateralFundingPerSizeForLongs -= cache.fundingAmountPerSizeForLongCollateralForLongs.toInt256();
            cache.shortCollateralFundingPerSizeForLongs -= cache.fundingAmountPerSizeForShortCollateralForLongs.toInt256();
            cache.shortCollateralFundingPerSizeForLongs += cache.fundingAmountPerSizeForLongCollateralForShorts.toInt256();
            cache.shortCollateralFundingPerSizeForShorts += cache.fundingAmountPerSizeForShortCollateralForShorts.toInt256();
        }

        return (
            cache.longCollateralFundingPerSizeForLongs,
            cache.longCollateralFundingPerSizeForShorts,
            cache.shortCollateralFundingPerSizeForLongs,
            cache.shortCollateralFundingPerSizeForShorts
        );
    }

    function updateCumulativeBorrowingFactor(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        MarketPrices memory prices,
        bool isLong
    ) internal {
        uint256 borrowingFactor = getNextCumulativeBorrowingFactor(dataStore, market, longToken, shortToken, prices, isLong);
        setCumulativeBorrowingFactor(dataStore, market, isLong, borrowingFactor);
        dataStore.setUint(Keys.cumulativeBorrowingFactorUpdatedAtKey(market, isLong), block.timestamp);
    }

    function getPerSizeValue(uint256 amount, uint256 totalSize) internal pure returns (uint256) {
        return (amount * Precision.FLOAT_PRECISION) / (totalSize / Precision.FLOAT_PRECISION);
    }

    function getPnlToPoolFactor(
        DataStore dataStore,
        MarketStore marketStore,
        Oracle oracle,
        address market,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        Market.Props memory _market = marketStore.get(market);
        MarketUtils.MarketPrices memory prices = MarketUtils.MarketPrices(
            oracle.getPrimaryPrice(_market.indexToken),
            oracle.getPrimaryPrice(_market.longToken),
            oracle.getPrimaryPrice(_market.shortToken)
        );

        return getPnlToPoolFactor(dataStore, _market, prices, isLong, maximize);
    }

    // return factor for (pnl of positions) / (long or short pool value)
    function getPnlToPoolFactor(
        DataStore dataStore,
        Market.Props memory market,
        MarketPrices memory prices,
        bool isLong,
        bool maximize
    ) internal view returns (int256) {
        uint256 poolUsd = getPoolUsdWithoutPnl(dataStore, market, prices, isLong);

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

    // return hasPendingFundingFee because it may be possible for there to be a funding fee but it is too small and the fundingFeeAmount is zero
    // in which case the position's fundingAmountPerSize should not be updated, otherwise a user could avoid paying funding fees by continually
    // updating the position before the funding fee becomes large enough to be chargeable
    // returns (hasPendingFundingFee, fundingFeeAmount)
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

    function getBorrowingFees(DataStore dataStore, Position.Props memory position) internal view returns (uint256) {
        uint256 cumulativeBorrowingFactor = getCumulativeBorrowingFactor(dataStore, position.market, position.isLong);
        uint256 diffFactor = cumulativeBorrowingFactor - position.borrowingFactor;
        return Precision.applyFactor(position.sizeInUsd, diffFactor);
    }

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

    function getOpenInterest(
        DataStore dataStore,
        address market,
        address collateralToken,
        bool isLong
    ) internal view returns (uint256) {
        return dataStore.getUint(Keys.openInterestKey(market, collateralToken, isLong));
    }

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

    function getOpenInterestInTokens(
        DataStore dataStore,
        address market,
        address collateralToken,
        bool isLong
    ) internal view returns (uint256) {
        return dataStore.getUint(Keys.openInterestInTokensKey(market, collateralToken, isLong));
    }

    // getOpenInterestInTokens * tokenPrice would not reflect pending positive pnl
    // from short positions, getOpenInterestWithPnl should be used if that info is needed
    function getOpenInterestWithPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) internal view returns (uint256) {
        uint256 openInterest = getOpenInterest(dataStore, market, longToken, shortToken, isLong);
        int256 pnl = getPnl(dataStore, market, longToken, shortToken, indexTokenPrice, isLong, maximize);
        return Calc.sum(openInterest, pnl);
    }

    function getCollateralSum(DataStore dataStore, address market, address collateralToken,  bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.collateralSumKey(market, collateralToken, isLong));
    }

    function getReserveFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.reserveFactorKey(market, isLong));
    }

    function getMaxPnlFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPnlFactorKey(market, isLong));
    }

    function getMaxPnlFactorForWithdrawals(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.maxPnlFactorForWithdrawalsKey(market, isLong));
    }

    function getFundingFactor(DataStore dataStore, address market) internal view returns (uint256) {
        return dataStore.getUint(Keys.fundingFactorKey(market));
    }

    function getFundingAmountPerSize(DataStore dataStore, address market, address collateralToken, bool isLong) internal view returns (int256) {
        return dataStore.getInt(Keys.fundingAmountPerSizeKey(market, collateralToken, isLong));
    }

    function setFundingAmountPerSize(DataStore dataStore, address market, address collateralToken, bool isLong, int256 value) internal returns (int256) {
        return dataStore.setInt(Keys.fundingAmountPerSizeKey(market, collateralToken, isLong), value);
    }

    function getSecondsSinceFundingUpdated(DataStore dataStore, address market) internal view returns (uint256) {
        uint256 updatedAt = dataStore.getUint(Keys.fundingUpdatedAtKey(market));
        if (updatedAt == 0) { return 0; }
        return block.timestamp - updatedAt;
    }

    function getBorrowingFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.borrowingFactorKey(market, isLong));
    }

    function getCumulativeBorrowingFactor(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.cumulativeBorrowingFactorKey(market, isLong));
    }

    function setCumulativeBorrowingFactor(DataStore dataStore, address market, bool isLong, uint256 value) internal {
        dataStore.setUint(Keys.cumulativeBorrowingFactorKey(market, isLong), value);
    }

    function getCumulativeBorrowingFactorUpdatedAt(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.cumulativeBorrowingFactorUpdatedAtKey(market, isLong));
    }

    function getSecondsSinceCumulativeBorrowingFactorUpdated(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        uint256 updatedAt = getCumulativeBorrowingFactorUpdatedAt(dataStore, market, isLong);
        if (updatedAt == 0) { return 0; }
        return block.timestamp - updatedAt;
    }

    function updateTotalBorrowing(
        DataStore dataStore,
        address market,
        bool isLong,
        uint256 prevPositionSizeInUsd,
        uint256 prevPositionBorrowingFactor,
        uint256 nextPositionSizeInUsd,
        uint256 nextPositionBorrowingFactor
    ) internal {
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

    function getNextCumulativeBorrowingFactor(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        MarketPrices memory prices,
        bool isLong
    ) internal view returns (uint256) {
        uint256 durationInSeconds = getSecondsSinceCumulativeBorrowingFactorUpdated(dataStore, market, isLong);
        uint256 borrowingFactor = getBorrowingFactor(dataStore, market, isLong);

        uint256 openInterestWithPnl = getOpenInterestWithPnl(dataStore, market, longToken, shortToken, prices.indexTokenPrice, isLong, true);

        uint256 poolAmount = getPoolAmount(dataStore, market, isLong ? longToken : shortToken);
        uint256 poolTokenPrice = isLong ? prices.longTokenPrice.min : prices.shortTokenPrice.min;
        uint256 poolUsd = poolAmount * poolTokenPrice;

        uint256 adjustedFactor = durationInSeconds * borrowingFactor * openInterestWithPnl / poolUsd;
        uint256 cumulativeBorrowingFactor = getCumulativeBorrowingFactor(dataStore, market, isLong);

        return cumulativeBorrowingFactor + adjustedFactor;
    }

    function getTotalBorrowingFees(DataStore dataStore, address market, address longToken, address shortToken, bool isLong) internal view returns (uint256) {
        uint256 openInterest = getOpenInterest(dataStore, market, longToken, shortToken, isLong);
        uint256 cumulativeBorrowingFactor = getCumulativeBorrowingFactor(dataStore, market, isLong);
        uint256 totalBorrowing = getTotalBorrowing(dataStore, market, isLong);
        return openInterest * cumulativeBorrowingFactor - totalBorrowing;
    }

    // sum of position.borrowingFactor * position.size for all positions of the market
    // if borrowing APR is 1000% for 100 years, the cumulativeBorrowingFactor could be as high as 100 * 1000 * (10 ** 30)
    // since position.size is a USD value with 30 decimals, under this scenario, there may be overflow issues
    // if open interest exceeds (2 ** 256) / (10 ** 30) / (100 * 1000 * (10 ** 30)) => 1,157,920,900,000 USD
    function getTotalBorrowing(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.totalBorrowingKey(market, isLong));
    }

    function setTotalBorrowing(DataStore dataStore, address market, bool isLong, uint256 value) internal returns (uint256) {
        return dataStore.setUint(Keys.totalBorrowingKey(market, isLong), value);
    }

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

    function validateNonEmptyMarket(Market.Props memory market) internal pure {
        if (market.marketToken == address(0)) {
            revert EmptyMarket();
        }
    }

    function getMarkets(MarketStore marketStore, address[] memory swapPath) internal view returns (Market.Props[] memory) {
        Market.Props[] memory markets = new Market.Props[](swapPath.length);

        for (uint256 i = 0; i < swapPath.length; i++) {
            Market.Props memory market = marketStore.get(swapPath[i]);
            validateNonEmptyMarket(market);
            markets[i] = market;
        }

        return markets;
    }
}
