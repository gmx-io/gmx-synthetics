// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";

import "./WithdrawalStore.sol";
import "../market/MarketStore.sol";

import "../nonce/NonceUtils.sol";
import "../pricing/SwapPricingUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";
import "../utils/Null.sol";

/**
 * @title WithdrawalUtils
 * @dev Library for withdrawal functions
 */
library WithdrawalUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Array for uint256[];
    using Price for Price.Props;
    using Withdrawal for Withdrawal.Props;

    /**
     * @param receiver The address that will receive the withdrawal tokens.
     * @param callbackContract The contract that will be called back.
     * @param market The market on which the withdrawal will be executed.
     * @param marketTokensLongAmount The amount of long market tokens that will be withdrawn.
     * @param marketTokensShortAmount The amount of short market tokens that will be withdrawn.
     * @param minLongTokenAmount The minimum amount of long tokens that must be withdrawn.
     * @param minShortTokenAmount The minimum amount of short tokens that must be withdrawn.
     * @param shouldUnwrapNativeToken Whether the native token should be unwrapped when executing the withdrawal.
     * @param executionFee The execution fee for the withdrawal.
     * @param callbackGasLimit The gas limit for calling the callback contract.
     */
    struct CreateWithdrawalParams {
        address receiver;
        address callbackContract;
        address market;
        uint256 marketTokensLongAmount;
        uint256 marketTokensShortAmount;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    /**
     * @param dataStore The data store where withdrawal data is stored.
     * @param eventEmitter The event emitter that is used to emit events.
     * @param withdrawalStore The withdrawal store where withdrawal data is stored.
     * @param marketStore The market store where market data is stored.
     * @param oracle The oracle that provides market prices.
     * @param feeReceiver The address that will receive the withdrawal fees.
     * @param key The unique identifier of the withdrawal to execute.
     * @param oracleBlockNumbers The block numbers for the oracle prices.
     * @param keeper The keeper that is executing the withdrawal.
     * @param startingGas The starting gas limit for the withdrawal execution.
     */
    struct ExecuteWithdrawalParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        WithdrawalStore withdrawalStore;
        MarketStore marketStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        bytes32 key;
        uint256[] oracleBlockNumbers;
        address keeper;
        uint256 startingGas;
    }

    /**
     * @param market The market on which the withdrawal will be executed.
     * @param account The account that initiated the withdrawal.
     * @param receiver The address that will receive the withdrawal tokens.
     * @param tokenIn the other token, if tokenOut is market.longToken then
     * tokenIn is market.shortToken and vice versa
     * @param tokenOut the token that will be withdrawn
     * @param tokenInPrice price of tokenIn
     * @param tokenOutPrice price of tokenOut
     * @param marketTokensAmount The amount of market tokens that will be burnt.
     * @param shouldUnwrapNativeToken Whether the native token should be unwrapped when executing the withdrawal.
     * @param marketTokensUsd The value of the market tokens in USD.
     * @param priceImpactUsd The price impact in USD.
     */
    struct _ExecuteWithdrawalParams {
        Market.Props market;
        address account;
        address receiver;
        address tokenIn;
        address tokenOut;
        Price.Props tokenInPrice;
        Price.Props tokenOutPrice;
        uint256 marketTokensAmount;
        bool shouldUnwrapNativeToken;
        uint256 marketTokensUsd;
        int256 priceImpactUsd;
    }

    /**
     * @param poolValue The value of the market pool in USD.
     * @param marketTokensSupply The total supply of market tokens.
     * @param marketTokensLongUsd The value of the long market tokens in USD.
     * @param marketTokensShortUsd The value of the short market tokens in USD.
     */
    struct ExecuteWithdrawalCache {
        uint256 poolValue;
        uint256 marketTokensSupply;
        uint256 marketTokensLongUsd;
        uint256 marketTokensShortUsd;
    }

    error MinLongTokens(uint256 received, uint256 expected);
    error MinShortTokens(uint256 received, uint256 expected);
    error InsufficientMarketTokens(uint256 balance, uint256 expected);

    /**
     * @dev Creates a withdrawal in the withdrawal store.
     *
     * @param dataStore The data store where withdrawal data is stored.
     * @param eventEmitter The event emitter that is used to emit events.
     * @param withdrawalStore The withdrawal store where withdrawal data is stored.
     * @param marketStore The market store where market data is stored.
     * @param account The account that initiated the withdrawal.
     * @param params The parameters for creating the withdrawal.
     * @return The unique identifier of the created withdrawal.
     */
    function createWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        WithdrawalStore withdrawalStore,
        MarketStore marketStore,
        address account,
        CreateWithdrawalParams memory params
    ) internal returns (bytes32) {
        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = withdrawalStore.recordTransferIn(wnt);
        require(wntAmount == params.executionFee, "WithdrawalUtils: invalid wntAmount");

        Market.Props memory market = MarketUtils.getMarket(marketStore, params.market);

        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            Withdrawal.Addresses(
                account,
                params.receiver,
                params.callbackContract,
                market.marketToken
            ),
            Withdrawal.Numbers(
                params.marketTokensLongAmount,
                params.marketTokensShortAmount,
                params.minLongTokenAmount,
                params.minShortTokenAmount,
                Chain.currentBlockNumber(),
                params.executionFee,
                params.callbackGasLimit
            ),
            Withdrawal.Flags(
                params.shouldUnwrapNativeToken
            ),
            Null.BYTES
        );

        uint256 estimatedGasLimit = GasUtils.estimateExecuteWithdrawalGasLimit(dataStore, withdrawal);
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee);

        bytes32 key = NonceUtils.getNextKey(dataStore);

        withdrawalStore.set(key, withdrawal);

        eventEmitter.emitWithdrawalCreated(key, withdrawal);

        return key;
    }

    /**
     * Executes a withdrawal on the market.
     *
     * @param params The parameters for executing the withdrawal.
     */
    function executeWithdrawal(ExecuteWithdrawalParams memory params) internal {
        Withdrawal.Props memory withdrawal = params.withdrawalStore.get(params.key);
        require(withdrawal.account() != address(0), "WithdrawalUtils: empty withdrawal");

        if (!params.oracleBlockNumbers.areEqualTo(withdrawal.updatedAtBlock())) {
            OracleUtils.revertOracleBlockNumbersAreNotEqual(params.oracleBlockNumbers, withdrawal.updatedAtBlock());
        }

        CallbackUtils.beforeWithdrawalExecution(params.key, withdrawal);

        Market.Props memory market = MarketUtils.getMarket(params.marketStore, withdrawal.market());

        Price.Props memory longTokenPrice = params.oracle.getPrimaryPrice(market.longToken);
        Price.Props memory shortTokenPrice = params.oracle.getPrimaryPrice(market.shortToken);

        ExecuteWithdrawalCache memory cache;
        cache.poolValue = MarketUtils.getPoolValue(
            params.dataStore,
            market,
            longTokenPrice,
            shortTokenPrice,
            params.oracle.getPrimaryPrice(market.indexToken),
            false
        );

        cache.marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(market.marketToken)));
        cache.marketTokensLongUsd = MarketUtils.marketTokenAmountToUsd(withdrawal.marketTokensLongAmount(), cache.poolValue, cache.marketTokensSupply);
        cache.marketTokensShortUsd = MarketUtils.marketTokenAmountToUsd(withdrawal.marketTokensShortAmount(), cache.poolValue, cache.marketTokensSupply);

        int256 priceImpactUsd = SwapPricingUtils.getPriceImpactUsd(
            SwapPricingUtils.GetPriceImpactUsdParams(
                params.dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
                longTokenPrice.midPrice(),
                shortTokenPrice.midPrice(),
                -(cache.marketTokensLongUsd.toInt256()),
                -(cache.marketTokensShortUsd.toInt256())
            )
        );

        if (withdrawal.marketTokensLongAmount() > 0) {
            _ExecuteWithdrawalParams memory _params = _ExecuteWithdrawalParams(
                market,
                withdrawal.account(),
                withdrawal.receiver(),
                market.shortToken,
                market.longToken,
                shortTokenPrice,
                longTokenPrice,
                withdrawal.marketTokensLongAmount(),
                withdrawal.shouldUnwrapNativeToken(),
                cache.marketTokensLongUsd,
                priceImpactUsd * cache.marketTokensLongUsd.toInt256() / (cache.marketTokensLongUsd + cache.marketTokensShortUsd).toInt256()
            );

            uint256 outputAmount = _executeWithdrawal(params, _params);

            if (outputAmount < withdrawal.minLongTokenAmount()) {
                revert MinLongTokens(outputAmount, withdrawal.minLongTokenAmount());
            }
        }

        if (withdrawal.marketTokensShortAmount() > 0) {
            _ExecuteWithdrawalParams memory _params = _ExecuteWithdrawalParams(
                market,
                withdrawal.account(),
                withdrawal.receiver(),
                market.longToken,
                market.shortToken,
                longTokenPrice,
                shortTokenPrice,
                withdrawal.marketTokensShortAmount(),
                withdrawal.shouldUnwrapNativeToken(),
                cache.marketTokensShortUsd,
                priceImpactUsd * cache.marketTokensShortUsd.toInt256() / (cache.marketTokensLongUsd + cache.marketTokensShortUsd).toInt256()
            );

            uint256 outputAmount = _executeWithdrawal(params, _params);
            if (outputAmount < withdrawal.minShortTokenAmount()) {
                revert MinShortTokens(outputAmount, withdrawal.minShortTokenAmount());
            }
        }

        params.withdrawalStore.remove(params.key);

        params.eventEmitter.emitWithdrawalExecuted(params.key);

        CallbackUtils.afterWithdrawalExecution(params.key, withdrawal);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.withdrawalStore,
            withdrawal.executionFee(),
            params.startingGas,
            params.keeper,
            withdrawal.account()
        );
    }

    /**
     * @dev Cancels a withdrawal.
     * @param dataStore The data store.
     * @param eventEmitter The event emitter.
     * @param withdrawalStore The withdrawal store.
     * @param key The withdrawal key.
     * @param keeper The keeper sending the transaction.
     * @param startingGas The starting gas for the transaction.
     */
    function cancelWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        WithdrawalStore withdrawalStore,
        bytes32 key,
        address keeper,
        uint256 startingGas,
        string memory reason
    ) internal {
        Withdrawal.Props memory withdrawal = withdrawalStore.get(key);
        require(withdrawal.account() != address(0), "WithdrawalUtils: empty withdrawal");

        withdrawalStore.remove(key);

        eventEmitter.emitWithdrawalCancelled(key, reason);

        CallbackUtils.afterWithdrawalCancellation(key, withdrawal);

        GasUtils.payExecutionFee(
            dataStore,
            withdrawalStore,
            withdrawal.executionFee(),
            startingGas,
            keeper,
            withdrawal.account()
        );
    }

    /**
     * @dev executes a withdrawal.
     * @param params ExecuteWithdrawalParams.
     * @param _params _ExecuteWithdrawalParams.
     */
    function _executeWithdrawal(
        ExecuteWithdrawalParams memory params,
        _ExecuteWithdrawalParams memory _params
    ) internal returns (uint256) {
        // round outputAmount down
        uint256 outputAmount = _params.marketTokensUsd / _params.tokenOutPrice.max;

        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            _params.market.marketToken,
            outputAmount,
            Keys.FEE_RECEIVER_WITHDRAWAL_FACTOR
        );

        PricingUtils.transferFees(
            params.feeReceiver,
            _params.market.marketToken,
            _params.tokenOut,
            fees.feeReceiverAmount,
            FeeUtils.WITHDRAWAL_FEE
        );

        uint256 poolAmountDelta = outputAmount - fees.feesForPool;
        outputAmount = fees.amountAfterFees;

        if (_params.priceImpactUsd > 0) {
            // when there is a positive price impact factor, additional tokens from the swap impact pool
            // are withdrawn for the user
            // for example, if 50,000 USDC is withdrawn and there is a positive price impact
            // an additional 100 USDC may be sent to the user
            // the swap impact pool is decreased by the used amount
            int256 positiveImpactAmount = MarketUtils.applySwapImpactWithCap(
                params.dataStore,
                params.eventEmitter,
                _params.market.marketToken,
                _params.tokenOut,
                _params.tokenOutPrice,
                _params.priceImpactUsd
            );

            outputAmount += positiveImpactAmount.toUint256();
        } else {
            // when there is a negative price impact factor,
            // less of the output amount is sent to the user
            // for example, if 10 ETH is withdrawn and there is a negative price impact
            // only 9.995 ETH may be withdrawn
            // the remaining 0.005 ETH will be stored in the swap impact pool
            int256 negativeImpactAmount = MarketUtils.applySwapImpactWithCap(
                params.dataStore,
                params.eventEmitter,
                _params.market.marketToken,
                _params.tokenOut,
                _params.tokenOutPrice,
                _params.priceImpactUsd
            );

            outputAmount -= (-negativeImpactAmount).toUint256();
        }

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            _params.market.marketToken,
            _params.tokenOut,
            -poolAmountDelta.toInt256()
        );

        MarketUtils.validateReserve(
            params.dataStore,
            _params.market,
            MarketUtils.MarketPrices(
                params.oracle.getPrimaryPrice(_params.market.indexToken),
                _params.tokenIn == _params.market.longToken ? _params.tokenInPrice : _params.tokenOutPrice,
                _params.tokenIn == _params.market.shortToken ? _params.tokenInPrice : _params.tokenOutPrice
            ),
            _params.tokenOut == _params.market.longToken
        );

        uint256 marketTokensBalance = MarketToken(payable(_params.market.marketToken)).balanceOf(_params.account);
        if (marketTokensBalance < _params.marketTokensAmount) {
            revert InsufficientMarketTokens(marketTokensBalance, _params.marketTokensAmount);
        }

        MarketToken(payable(_params.market.marketToken)).burn(_params.account, _params.marketTokensAmount);
        MarketToken(payable(_params.market.marketToken)).transferOut(
            _params.tokenOut,
            outputAmount,
            _params.receiver,
            _params.shouldUnwrapNativeToken
        );

        params.eventEmitter.emitSwapFeesCollected(keccak256(abi.encode("withdrawal")), fees);

        return outputAmount;
    }
}
