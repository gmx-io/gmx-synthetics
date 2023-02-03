// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../adl/AdlUtils.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "./DepositVault.sol";
import "./DepositStoreUtils.sol";
import "./DepositEventUtils.sol";

import "../pricing/SwapPricingUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";
import "../utils/ErrorUtils.sol";

// @title DepositUtils
// @dev Library for deposit functions, to help with the depositing of liquidity
// into a market in return for market tokens
library ExecuteDepositUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Array for uint256[];

    using Price for Price.Props;
    using Deposit for Deposit.Props;

    // @dev ExecuteDepositParams struct used in executeDeposit to avoid stack
    // too deep errors
    //
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param oracle Oracle
    // @param key the key of the deposit to execute
    // @param oracleBlockNumbers the oracle block numbers for the prices in oracle
    // @param keeper the address of the keeper executing the deposit
    // @param startingGas the starting amount of gas
    struct ExecuteDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        DepositVault depositVault;
        Oracle oracle;
        bytes32 key;
        uint256[] minOracleBlockNumbers;
        uint256[] maxOracleBlockNumbers;
        address keeper;
        uint256 startingGas;
    }

    // @dev _ExecuteDepositParams struct used in executeDeposit to avoid stack
    // too deep errors
    //
    // @param market the market to deposit into
    // @param account the depositing account
    // @param receiver the account to send the market tokens to
    // @param tokenIn the token to deposit, either the market.longToken or
    // market.shortToken
    // @param tokenOut the other token, if tokenIn is market.longToken then
    // tokenOut is market.shortToken and vice versa
    // @param tokenInPrice price of tokenIn
    // @param tokenOutPrice price of tokenOut
    // @param amount amount of tokenIn
    // @param priceImpactUsd price impact in USD
    struct _ExecuteDepositParams {
        Market.Props market;
        address account;
        address receiver;
        address tokenIn;
        address tokenOut;
        Price.Props tokenInPrice;
        Price.Props tokenOutPrice;
        uint256 amount;
        int256 priceImpactUsd;
    }

    struct ExecuteDepositCache {
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        uint256 longTokenUsd;
        uint256 shortTokenUsd;
        uint256 receivedMarketTokens;
        int256 priceImpactUsd;
    }

    error EmptyDeposit();
    error MinMarketTokens(uint256 received, uint256 expected);
    error EmptyDepositAmountsAfterSwap();
    error UnexpectedNonZeroShortAmount();
    error InvalidPoolValueForDeposit(int256 poolValue);
    error InvalidSwapOutputToken(address outputToken, address expectedOutputToken);

    // @dev executes a deposit
    // @param params ExecuteDepositParams
    function executeDeposit(ExecuteDepositParams memory params) external {
        Deposit.Props memory deposit = DepositStoreUtils.get(params.dataStore, params.key);
        ExecuteDepositCache memory cache;

        if (deposit.account() == address(0)) {
            revert EmptyDeposit();
        }

        OracleUtils.validateBlockNumberWithinRange(
            params.minOracleBlockNumbers,
            params.maxOracleBlockNumbers,
            deposit.updatedAtBlock()
        );

        Market.Props memory market = MarketUtils.getEnabledMarket(params.dataStore, deposit.market());

        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(params.oracle, market);

        // deposits should improve the pool state but it should be checked if
        // the max pnl factor for deposits is exceeded as this would lead to the
        // price of the market token decreasing below the allowed amount
        MarketUtils.validateMaxPnl(
            params.dataStore,
            market,
            prices,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS
        );

        cache.longTokenAmount = swap(
            params,
            deposit.longTokenSwapPath(),
            deposit.initialLongToken(),
            deposit.initialLongTokenAmount(),
            market.marketToken,
            market.longToken
        );

        cache.shortTokenAmount = swap(
            params,
            deposit.shortTokenSwapPath(),
            deposit.initialShortToken(),
            deposit.initialShortTokenAmount(),
            market.marketToken,
            market.shortToken
        );

        if (cache.longTokenAmount == 0 && cache.shortTokenAmount == 0) {
            revert EmptyDepositAmountsAfterSwap();
        }

        // if the market.longToken and market.shortToken are the same, there are two cases to consider:
        // 1. the user is depositing the market.longToken directly
        // 2. the user is depositing an initialLongToken and swapping it to the market.longToken
        // for both cases, we expect the cache.shortTokenAmount to be zero, because it is unlikely that
        // the user provides different initialLongTokens and initialShortTokens to be swapped to the same
        // token, so that flow is not supported
        // for the first case, the deposited token will be recorded in initialLongTokenAmount, it is not possible
        // to have an initialShortTokenAmount because recordTransferIn records a single difference in balance of the token
        // after all transfers
        // for both cases, split the longTokenAmount into longTokenAmount and shortTokenAmount to minimize
        // price impact for the user
        if (market.longToken == market.shortToken) {
            if (cache.shortTokenAmount > 0) {
                revert UnexpectedNonZeroShortAmount();
            }

            (cache.longTokenAmount, cache.shortTokenAmount) = getAdjustedLongAndShortTokenAmounts(
                params.dataStore,
                market,
                cache.longTokenAmount
            );
        }

        cache.longTokenUsd = cache.longTokenAmount * prices.longTokenPrice.midPrice();
        cache.shortTokenUsd = cache.shortTokenAmount * prices.shortTokenPrice.midPrice();

        cache.receivedMarketTokens;

        cache.priceImpactUsd = SwapPricingUtils.getPriceImpactUsd(
            SwapPricingUtils.GetPriceImpactUsdParams(
                params.dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
                prices.longTokenPrice.midPrice(),
                prices.shortTokenPrice.midPrice(),
                (cache.longTokenAmount * prices.longTokenPrice.midPrice()).toInt256(),
                (cache.shortTokenAmount * prices.shortTokenPrice.midPrice()).toInt256()
            )
        );

        if (cache.longTokenAmount > 0) {
            _ExecuteDepositParams memory _params = _ExecuteDepositParams(
                market,
                deposit.account(),
                deposit.receiver(),
                market.longToken,
                market.shortToken,
                prices.longTokenPrice,
                prices.shortTokenPrice,
                cache.longTokenAmount,
                cache.priceImpactUsd * cache.longTokenUsd.toInt256() / (cache.longTokenUsd + cache.shortTokenUsd).toInt256()
            );

            cache.receivedMarketTokens += _executeDeposit(params, _params);
        }

        if (cache.shortTokenAmount > 0) {
            _ExecuteDepositParams memory _params = _ExecuteDepositParams(
                market,
                deposit.account(),
                deposit.receiver(),
                market.shortToken,
                market.longToken,
                prices.shortTokenPrice,
                prices.longTokenPrice,
                cache.shortTokenAmount,
                cache.priceImpactUsd * cache.shortTokenUsd.toInt256() / (cache.longTokenUsd + cache.shortTokenUsd).toInt256()
            );

            cache.receivedMarketTokens += _executeDeposit(params, _params);
        }

        if (cache.receivedMarketTokens < deposit.minMarketTokens()) {
            revert MinMarketTokens(cache.receivedMarketTokens, deposit.minMarketTokens());
        }

        DepositStoreUtils.remove(params.dataStore, params.key, deposit.account());

        DepositEventUtils.emitDepositExecuted(
            params.eventEmitter,
            params.key,
            cache.longTokenAmount,
            cache.shortTokenAmount,
            cache.receivedMarketTokens
        );

        CallbackUtils.afterDepositExecution(params.key, deposit);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.depositVault,
            deposit.executionFee(),
            params.startingGas,
            params.keeper,
            deposit.account()
        );
    }

    // @dev executes a deposit
    // @param params ExecuteDepositParams
    // @param _params _ExecuteDepositParams
    function _executeDeposit(ExecuteDepositParams memory params, _ExecuteDepositParams memory _params) internal returns (uint256) {
        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            _params.market.marketToken,
            _params.amount
        );

        FeeUtils.incrementClaimableFeeAmount(
            params.dataStore,
            params.eventEmitter,
            _params.market.marketToken,
            _params.tokenIn,
            fees.feeReceiverAmount,
            Keys.DEPOSIT_FEE
        );

        SwapPricingUtils.emitSwapFeesCollected(
            params.eventEmitter,
             _params.market.marketToken,
             _params.tokenIn,
             "deposit",
             fees
         );

        uint256 mintAmount;

        int256 _poolValue = MarketUtils.getPoolValue(
            params.dataStore,
            _params.market,
            _params.tokenIn == _params.market.longToken ? _params.tokenInPrice : _params.tokenOutPrice,
            _params.tokenIn == _params.market.shortToken ? _params.tokenInPrice : _params.tokenOutPrice,
            params.oracle.getPrimaryPrice(_params.market.indexToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true
        );

        if (_poolValue < 0) {
            revert InvalidPoolValueForDeposit(_poolValue);
        }

        uint256 poolValue = _poolValue.toUint256();

        uint256 supply = MarketUtils.getMarketTokenSupply(MarketToken(payable(_params.market.marketToken)));

        if (_params.priceImpactUsd > 0) {
            // when there is a positive price impact factor,
            // tokens from the swap impact pool are used to mint additional market tokens for the user
            // for example, if 50,000 USDC is deposited and there is a positive price impact
            // an additional 0.005 ETH may be used to mint market tokens
            // the swap impact pool is decreased by the used amount
            //
            // priceImpactUsd is calculated based on pricing assuming only depositAmount of tokenIn
            // was added to the pool
            // since impactAmount of tokenOut is added to the pool here, the calculation of
            // the tokenInPrice would not be entirely accurate
            int256 positiveImpactAmount = MarketUtils.applySwapImpactWithCap(
                params.dataStore,
                params.eventEmitter,
                _params.market.marketToken,
                _params.tokenOut,
                _params.tokenOutPrice,
                _params.priceImpactUsd
            );

            // calculate the usd amount using positiveImpactAmount since it may
            // be capped by the max available amount in the impact pool
            mintAmount += MarketUtils.usdToMarketTokenAmount(
                positiveImpactAmount.toUint256() * _params.tokenOutPrice.min,
                poolValue,
                supply
            );

            // deposit the token out, that was withdrawn from the impact pool, to mint market tokens
            MarketUtils.applyDeltaToPoolAmount(
                params.dataStore,
                params.eventEmitter,
                _params.market.marketToken,
                _params.tokenOut,
                positiveImpactAmount
            );
        } else {
            // when there is a negative price impact factor,
            // less of the deposit amount is used to mint market tokens
            // for example, if 10 ETH is deposited and there is a negative price impact
            // only 9.995 ETH may be used to mint market tokens
            // the remaining 0.005 ETH will be stored in the swap impact pool
            int256 negativeImpactAmount = MarketUtils.applySwapImpactWithCap(
                params.dataStore,
                params.eventEmitter,
                _params.market.marketToken,
                _params.tokenIn,
                _params.tokenInPrice,
                _params.priceImpactUsd
            );
            fees.amountAfterFees -= (-negativeImpactAmount).toUint256();
        }

        mintAmount += MarketUtils.usdToMarketTokenAmount(
            fees.amountAfterFees * _params.tokenInPrice.min,
            poolValue,
            supply
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            _params.market.marketToken,
            _params.tokenIn,
            (fees.amountAfterFees + fees.feeAmountForPool).toInt256()
        );

        MarketUtils.validatePoolAmount(
            params.dataStore,
            _params.market.marketToken,
            _params.tokenIn
        );

        MarketToken(payable(_params.market.marketToken)).mint(_params.receiver, mintAmount);

        return mintAmount;
    }

    // @dev this should only be called if the long and short tokens are the same
    // calculate the long and short amounts that would lead to the smallest amount
    // of price impact by helping to balance the pool
    // @param dataStore DataStore
    // @param market the market for the deposit
    // @param longTokenAmount the long token amount
    function getAdjustedLongAndShortTokenAmounts(
        DataStore dataStore,
        Market.Props memory market,
        uint256 longTokenAmount
    ) internal view returns (uint256, uint256) {
        uint256 poolLongTokenAmount = MarketUtils.getPoolAmount(dataStore, market.marketToken, market.longToken);
        uint256 poolShortTokenAmount = MarketUtils.getPoolAmount(dataStore, market.marketToken, market.shortToken);

        uint256 adjustedLongTokenAmount;
        uint256 adjustedShortTokenAmount;

        if (poolLongTokenAmount < poolShortTokenAmount) {
            uint256 diff = poolLongTokenAmount - poolShortTokenAmount;

            if (diff < poolLongTokenAmount) {
                adjustedLongTokenAmount = diff + (longTokenAmount - diff) / 2;
                adjustedShortTokenAmount = longTokenAmount - adjustedLongTokenAmount;
            } else {
                adjustedLongTokenAmount = longTokenAmount;
            }
        } else {
            uint256 diff = poolShortTokenAmount - poolLongTokenAmount;

            if (diff < poolShortTokenAmount) {
                adjustedShortTokenAmount = diff + (longTokenAmount - diff) / 2;
                adjustedLongTokenAmount - longTokenAmount - adjustedShortTokenAmount;
            } else {
                adjustedLongTokenAmount = 0;
                adjustedShortTokenAmount = longTokenAmount;
            }
        }

        return (adjustedLongTokenAmount, adjustedShortTokenAmount);
    }

    function swap(
        ExecuteDepositParams memory params,
        address[] memory swapPath,
        address initialToken,
        uint256 inputAmount,
        address market,
        address expectedOutputToken
    ) internal returns (uint256) {
        Market.Props[] memory swapPathMarkets = MarketUtils.getEnabledMarkets(
            params.dataStore,
            swapPath
        );

        (address outputToken, uint256 outputAmount) = SwapUtils.swap(
            SwapUtils.SwapParams(
                params.dataStore, // dataStore
                params.eventEmitter, // eventEmitter
                params.oracle, // oracle
                params.depositVault, // bank
                initialToken, // tokenIn
                inputAmount, // amountIn
                swapPathMarkets, // swapPathMarkets
                0, // minOutputAmount
                market, // receiver
                false // shouldUnwrapNativeToken
            )
        );

        if (outputToken != expectedOutputToken) {
            revert InvalidSwapOutputToken(outputToken, expectedOutputToken);
        }

        return outputAmount;
    }
}
