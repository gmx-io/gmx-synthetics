// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../adl/AdlUtils.sol";

import "../data/DataStore.sol";

import "./WithdrawalVault.sol";
import "./WithdrawalStoreUtils.sol";
import "./WithdrawalEventUtils.sol";

import "../nonce/NonceUtils.sol";
import "../pricing/SwapPricingUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";
import "../utils/ReceiverUtils.sol";

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
     * @param marketTokenAmount The amount of market tokens that will be withdrawn.
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
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 marketTokenAmount;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    /**
     * @param dataStore The data store where withdrawal data is stored.
     * @param eventEmitter The event emitter that is used to emit events.
     * @param withdrawalVault WithdrawalVault.
     * @param oracle The oracle that provides market prices.
     * @param key The unique identifier of the withdrawal to execute.
     * @param minOracleBlockNumbers The min block numbers for the oracle prices.
     * @param maxOracleBlockNumbers The max block numbers for the oracle prices.
     * @param keeper The keeper that is executing the withdrawal.
     * @param startingGas The starting gas limit for the withdrawal execution.
     */
    struct ExecuteWithdrawalParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        WithdrawalVault withdrawalVault;
        Oracle oracle;
        bytes32 key;
        uint256[] minOracleBlockNumbers;
        uint256[] maxOracleBlockNumbers;
        address keeper;
        uint256 startingGas;
    }

    struct ExecuteWithdrawalCache {
        uint256 longTokenOutputAmount;
        uint256 shortTokenOutputAmount;
        SwapPricingUtils.SwapFees longTokenFees;
        SwapPricingUtils.SwapFees shortTokenFees;
        uint256 longTokenPoolAmountDelta;
        uint256 shortTokenPoolAmountDelta;
    }

    error MinLongTokens(uint256 received, uint256 expected);
    error MinShortTokens(uint256 received, uint256 expected);
    error InsufficientMarketTokens(uint256 balance, uint256 expected);
    error InsufficientWntAmount(uint256 wntAmount, uint256 executionFee);
    error EmptyWithdrawal();
    error EmptyMarketTokenAmount();
    error InvalidPoolValueForWithdrawal(int256 poolValue);

    /**
     * @dev Creates a withdrawal in the withdrawal store.
     *
     * @param dataStore The data store where withdrawal data is stored.
     * @param eventEmitter The event emitter that is used to emit events.
     * @param withdrawalVault WithdrawalVault.
     * @param account The account that initiated the withdrawal.
     * @param params The parameters for creating the withdrawal.
     * @return The unique identifier of the created withdrawal.
     */
    function createWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        WithdrawalVault withdrawalVault,
        address account,
        CreateWithdrawalParams memory params
    ) external returns (bytes32) {
        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = withdrawalVault.recordTransferIn(wnt);

        if (wntAmount < params.executionFee) {
            revert InsufficientWntAmount(wntAmount, params.executionFee);
        }

        ReceiverUtils.validateReceiver(params.receiver);

        if (params.marketTokenAmount == 0) {
            revert EmptyMarketTokenAmount();
        }

        GasUtils.handleExcessExecutionFee(
            dataStore,
            withdrawalVault,
            wntAmount,
            params.executionFee
        );

        MarketUtils.validateEnabledMarket(dataStore, params.market);

        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            Withdrawal.Addresses(
                account,
                params.receiver,
                params.callbackContract,
                params.market,
                params.longTokenSwapPath,
                params.shortTokenSwapPath
            ),
            Withdrawal.Numbers(
                params.marketTokenAmount,
                params.minLongTokenAmount,
                params.minShortTokenAmount,
                Chain.currentBlockNumber(),
                params.executionFee,
                params.callbackGasLimit
            ),
            Withdrawal.Flags(
                params.shouldUnwrapNativeToken
            )
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, withdrawal.callbackGasLimit());

        uint256 estimatedGasLimit = GasUtils.estimateExecuteWithdrawalGasLimit(dataStore, withdrawal);
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee);

        bytes32 key = NonceUtils.getNextKey(dataStore);

        WithdrawalStoreUtils.set(dataStore, key, withdrawal);

        WithdrawalEventUtils.emitWithdrawalCreated(eventEmitter, key, withdrawal);

        return key;
    }

    /**
     * Executes a withdrawal on the market.
     *
     * @param params The parameters for executing the withdrawal.
     */
    function executeWithdrawal(ExecuteWithdrawalParams memory params) external {
        Withdrawal.Props memory withdrawal = WithdrawalStoreUtils.get(params.dataStore, params.key);
        if (withdrawal.account() == address(0)) {
            revert EmptyWithdrawal();
        }
        if (withdrawal.marketTokenAmount() == 0) {
            revert EmptyMarketTokenAmount();
        }

        OracleUtils.validateBlockNumberWithinRange(
            params.minOracleBlockNumbers,
            params.maxOracleBlockNumbers,
            withdrawal.updatedAtBlock()
        );

        uint256 marketTokensBalance = MarketToken(payable(withdrawal.market())).balanceOf(withdrawal.account());
        if (marketTokensBalance < withdrawal.marketTokenAmount()) {
            revert InsufficientMarketTokens(marketTokensBalance, withdrawal.marketTokenAmount());
        }

        _executeWithdrawal(params, withdrawal);

        WithdrawalEventUtils.emitWithdrawalExecuted(params.eventEmitter, params.key);

        CallbackUtils.afterWithdrawalExecution(params.key, withdrawal);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.withdrawalVault,
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
     * @param withdrawalVault The withdrawal vault.
     * @param key The withdrawal key.
     * @param keeper The keeper sending the transaction.
     * @param startingGas The starting gas for the transaction.
     */
    function cancelWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        WithdrawalVault withdrawalVault,
        bytes32 key,
        address keeper,
        uint256 startingGas,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        Withdrawal.Props memory withdrawal = WithdrawalStoreUtils.get(dataStore, key);
        if (withdrawal.account() == address(0)) {
            revert EmptyWithdrawal();
        }

        WithdrawalStoreUtils.remove(dataStore, key, withdrawal.account());

        WithdrawalEventUtils.emitWithdrawalCancelled(eventEmitter, key, reason, reasonBytes);

        CallbackUtils.afterWithdrawalCancellation(key, withdrawal);

        GasUtils.payExecutionFee(
            dataStore,
            withdrawalVault,
            withdrawal.executionFee(),
            startingGas,
            keeper,
            withdrawal.account()
        );
    }

    /**
     * @dev executes a withdrawal.
     * @param params ExecuteWithdrawalParams.
     * @param withdrawal The withdrawal to execute.
     */
    function _executeWithdrawal(
        ExecuteWithdrawalParams memory params,
        Withdrawal.Props memory withdrawal
    ) internal {
        Market.Props memory market = MarketUtils.getEnabledMarket(params.dataStore, withdrawal.market());

        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(
            params.oracle,
            market
        );

        ExecuteWithdrawalCache memory cache;

        (cache.longTokenOutputAmount, cache.shortTokenOutputAmount) = _getOutputAmounts(params, market, prices, withdrawal.marketTokenAmount());

        cache.longTokenFees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            market.marketToken,
            cache.longTokenOutputAmount
        );

        FeeUtils.incrementClaimableFeeAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.longToken,
            cache.longTokenFees.feeReceiverAmount,
            Keys.WITHDRAWAL_FEE
        );

        cache.shortTokenFees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            market.marketToken,
            cache.shortTokenOutputAmount
        );

        FeeUtils.incrementClaimableFeeAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.shortToken,
            cache.shortTokenFees.feeReceiverAmount,
            Keys.WITHDRAWAL_FEE
        );

        // the pool will be reduced by the outputAmount minus the fees for the pool
        cache.longTokenPoolAmountDelta = cache.longTokenOutputAmount - cache.longTokenFees.feeAmountForPool;
        cache.longTokenOutputAmount = cache.longTokenFees.amountAfterFees;

        cache.shortTokenPoolAmountDelta = cache.shortTokenOutputAmount - cache.shortTokenFees.feeAmountForPool;
        cache.shortTokenOutputAmount = cache.shortTokenFees.amountAfterFees;

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.longToken,
            -cache.longTokenPoolAmountDelta.toInt256()
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.shortToken,
            -cache.shortTokenPoolAmountDelta.toInt256()
        );

        MarketUtils.validateReserve(
            params.dataStore,
            market,
            prices,
            true
        );

        MarketUtils.validateReserve(
            params.dataStore,
            market,
            prices,
            false
        );

        MarketUtils.validateMaxPnl(
            params.dataStore,
            market,
            prices,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS
        );

        WithdrawalStoreUtils.remove(params.dataStore, params.key, withdrawal.account());

        MarketToken(payable(market.marketToken)).burn(withdrawal.account(), withdrawal.marketTokenAmount());

        swap(
            params,
            market,
            market.longToken,
            cache.longTokenOutputAmount,
            withdrawal.longTokenSwapPath(),
            withdrawal.minLongTokenAmount(),
            withdrawal.receiver(),
            withdrawal.shouldUnwrapNativeToken()
        );

        swap(
            params,
            market,
            market.shortToken,
            cache.shortTokenOutputAmount,
            withdrawal.shortTokenSwapPath(),
            withdrawal.minShortTokenAmount(),
            withdrawal.receiver(),
            withdrawal.shouldUnwrapNativeToken()
        );

        SwapPricingUtils.emitSwapFeesCollected(
            params.eventEmitter,
            market.marketToken,
            market.longToken,
            "withdrawal",
            cache.longTokenFees
        );

        SwapPricingUtils.emitSwapFeesCollected(
            params.eventEmitter,
            market.marketToken,
            market.shortToken,
            "withdrawal",
            cache.shortTokenFees
        );
    }

    function swap(
        ExecuteWithdrawalParams memory params,
        Market.Props memory market,
        address tokenIn,
        uint256 amountIn,
        address[] memory swapPath,
        uint256 minOutputAmount,
        address receiver,
        bool shouldUnwrapNativeToken
    ) internal {
        Market.Props[] memory swapPathMarkets = MarketUtils.getEnabledMarkets(params.dataStore, swapPath);

        SwapUtils.swap(
            SwapUtils.SwapParams(
                params.dataStore, // dataStore
                params.eventEmitter, // eventEmitter
                params.oracle, // oracle
                Bank(payable(market.marketToken)), // bank
                tokenIn, // tokenIn
                amountIn, // amountIn
                swapPathMarkets, // swapPathMarkets
                minOutputAmount, // minOutputAmount
                receiver, // receiver
                shouldUnwrapNativeToken // shouldUnwrapNativeToken
            )
        );
    }

    function _getOutputAmounts(
        ExecuteWithdrawalParams memory params,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        uint256 marketTokenAmount
    ) internal view returns (uint256, uint256) {
        // the max pnl factor for withdrawals should be the lower of the max pnl factor values
        // which means that pnl would be capped to a smaller amount and the pool
        // value would be higher even if there is a large pnl
        // this should be okay since MarketUtils.validateMaxPnl is called after the withdrawal
        // which ensures that the max pnl factor for withdrawals was not exceeded
        int256 _poolValue = MarketUtils.getPoolValue(
            params.dataStore,
            market,
            prices.longTokenPrice,
            prices.shortTokenPrice,
            params.oracle.getPrimaryPrice(market.indexToken),
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            false
        );

        if (_poolValue <= 0) {
            revert InvalidPoolValueForWithdrawal(_poolValue);
        }

        uint256 poolValue = _poolValue.toUint256();
        uint256 marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(market.marketToken)));
        uint256 marketTokensUsd = MarketUtils.marketTokenAmountToUsd(marketTokenAmount, poolValue, marketTokensSupply);

        uint256 longTokenPoolAmount = MarketUtils.getPoolAmount(params.dataStore, market.marketToken, market.longToken);
        uint256 shortTokenPoolAmount = MarketUtils.getPoolAmount(params.dataStore, market.marketToken, market.shortToken);

        uint256 longTokenPoolUsd = longTokenPoolAmount * prices.longTokenPrice.max;
        uint256 shortTokenPoolUsd = shortTokenPoolAmount * prices.shortTokenPrice.max;

        uint256 longTokenOutputUsd = marketTokensUsd * longTokenPoolUsd / (longTokenPoolUsd + shortTokenPoolUsd);
        uint256 shortTokenOutputUsd = marketTokensUsd * shortTokenPoolUsd / (longTokenPoolUsd + shortTokenPoolUsd);

        return (
            longTokenOutputUsd / prices.longTokenPrice.max,
            shortTokenOutputUsd / prices.shortTokenPrice.max
        );
    }
}
