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
import "../utils/AccountUtils.sol";

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

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    /**
     * @param receiver The address that will receive the withdrawal tokens.
     * @param callbackContract The contract that will be called back.
     * @param market The market on which the withdrawal will be executed.
     * @param minLongTokenAmount The minimum amount of long tokens that must be withdrawn.
     * @param minShortTokenAmount The minimum amount of short tokens that must be withdrawn.
     * @param shouldUnwrapNativeToken Whether the native token should be unwrapped when executing the withdrawal.
     * @param executionFee The execution fee for the withdrawal.
     * @param callbackGasLimit The gas limit for calling the callback contract.
     */
    struct CreateWithdrawalParams {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
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

    struct ExecuteWithdrawalResult {
        address outputToken;
        uint256 outputAmount;
        address secondaryOutputToken;
        uint256 secondaryOutputAmount;
    }

    struct SwapCache {
        Market.Props[] swapPathMarkets;
        SwapUtils.SwapParams swapParams;
        address outputToken;
        uint256 outputAmount;
    }

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
        AccountUtils.validateAccount(account);

        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = withdrawalVault.recordTransferIn(wnt);

        if (wntAmount < params.executionFee) {
            revert Errors.InsufficientWntAmount(wntAmount, params.executionFee);
        }

        AccountUtils.validateReceiver(params.receiver);

        uint256 marketTokenAmount = withdrawalVault.recordTransferIn(params.market);

        if (marketTokenAmount == 0) {
            revert Errors.EmptyWithdrawalAmount();
        }

        params.executionFee = wntAmount;

        MarketUtils.validateEnabledMarket(dataStore, params.market);
        MarketUtils.validateSwapPath(dataStore, params.longTokenSwapPath);
        MarketUtils.validateSwapPath(dataStore, params.shortTokenSwapPath);

        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            Withdrawal.Addresses(
                account,
                params.receiver,
                params.callbackContract,
                params.uiFeeReceiver,
                params.market,
                params.longTokenSwapPath,
                params.shortTokenSwapPath
            ),
            Withdrawal.Numbers(
                marketTokenAmount,
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
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        Withdrawal.Props memory withdrawal = WithdrawalStoreUtils.get(params.dataStore, params.key);
        WithdrawalStoreUtils.remove(params.dataStore, params.key, withdrawal.account());

        if (withdrawal.account() == address(0)) {
            revert Errors.EmptyWithdrawal();
        }
        if (withdrawal.marketTokenAmount() == 0) {
            revert Errors.EmptyWithdrawalAmount();
        }

        OracleUtils.validateBlockNumberWithinRange(
            params.minOracleBlockNumbers,
            params.maxOracleBlockNumbers,
            withdrawal.updatedAtBlock()
        );

        uint256 marketTokensBalance = MarketToken(payable(withdrawal.market())).balanceOf(address(params.withdrawalVault));
        if (marketTokensBalance < withdrawal.marketTokenAmount()) {
            revert Errors.InsufficientMarketTokens(marketTokensBalance, withdrawal.marketTokenAmount());
        }

        ExecuteWithdrawalResult memory result = _executeWithdrawal(params, withdrawal);

        WithdrawalEventUtils.emitWithdrawalExecuted(params.eventEmitter, params.key);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "outputToken", result.outputToken);
        eventData.addressItems.setItem(1, "secondaryOutputToken", result.secondaryOutputToken);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "outputAmount", result.outputAmount);
        eventData.uintItems.setItem(1, "secondaryOutputAmount", result.secondaryOutputAmount);
        CallbackUtils.afterWithdrawalExecution(params.key, withdrawal, eventData);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
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
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        startingGas -= gasleft() / 63;

        Withdrawal.Props memory withdrawal = WithdrawalStoreUtils.get(dataStore, key);
        if (withdrawal.account() == address(0)) {
            revert Errors.EmptyWithdrawal();
        }

        if (withdrawal.marketTokenAmount() == 0) {
            revert Errors.EmptyWithdrawalAmount();
        }

        WithdrawalStoreUtils.remove(dataStore, key, withdrawal.account());

        withdrawalVault.transferOut(
            withdrawal.market(),
            withdrawal.account(),
            withdrawal.marketTokenAmount(),
            false // shouldUnwrapNativeToken
        );

        WithdrawalEventUtils.emitWithdrawalCancelled(eventEmitter, key, reason, reasonBytes);

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterWithdrawalCancellation(key, withdrawal, eventData);

        GasUtils.payExecutionFee(
            dataStore,
            eventEmitter,
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
    ) internal returns (ExecuteWithdrawalResult memory) {
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
            cache.longTokenOutputAmount,
            withdrawal.uiFeeReceiver()
        );

        FeeUtils.incrementClaimableFeeAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.longToken,
            cache.longTokenFees.feeReceiverAmount,
            Keys.WITHDRAWAL_FEE_TYPE
        );

        FeeUtils.incrementClaimableUiFeeAmount(
            params.dataStore,
            params.eventEmitter,
            withdrawal.uiFeeReceiver(),
            market.marketToken,
            market.longToken,
            cache.longTokenFees.uiFeeAmount,
            Keys.UI_WITHDRAWAL_FEE_TYPE
        );

        cache.shortTokenFees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            market.marketToken,
            cache.shortTokenOutputAmount,
            withdrawal.uiFeeReceiver()
        );

        FeeUtils.incrementClaimableFeeAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.shortToken,
            cache.shortTokenFees.feeReceiverAmount,
            Keys.WITHDRAWAL_FEE_TYPE
        );

        FeeUtils.incrementClaimableUiFeeAmount(
            params.dataStore,
            params.eventEmitter,
            withdrawal.uiFeeReceiver(),
            market.marketToken,
            market.shortToken,
            cache.shortTokenFees.uiFeeAmount,
            Keys.UI_WITHDRAWAL_FEE_TYPE
        );

        // the pool will be reduced by the outputAmount minus the fees for the pool
        cache.longTokenPoolAmountDelta = cache.longTokenOutputAmount - cache.longTokenFees.feeAmountForPool;
        cache.longTokenOutputAmount = cache.longTokenFees.amountAfterFees;

        cache.shortTokenPoolAmountDelta = cache.shortTokenOutputAmount - cache.shortTokenFees.feeAmountForPool;
        cache.shortTokenOutputAmount = cache.shortTokenFees.amountAfterFees;

        // it is rare but possible for withdrawals to be blocked because pending borrowing fees
        // have not yet been deducted from position collateral and credited to the poolAmount value
        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            market,
            market.longToken,
            -cache.longTokenPoolAmountDelta.toInt256()
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            market,
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
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS
        );

        MarketToken(payable(market.marketToken)).burn(
            address(params.withdrawalVault),
            withdrawal.marketTokenAmount()
        );

        params.withdrawalVault.syncTokenBalance(market.marketToken);

        ExecuteWithdrawalResult memory result;
        (result.outputToken, result.outputAmount) = swap(
            params,
            market,
            market.longToken,
            cache.longTokenOutputAmount,
            withdrawal.longTokenSwapPath(),
            withdrawal.minLongTokenAmount(),
            withdrawal.receiver(),
            withdrawal.uiFeeReceiver(),
            withdrawal.shouldUnwrapNativeToken()
        );

        (result.secondaryOutputToken, result.secondaryOutputAmount) = swap(
            params,
            market,
            market.shortToken,
            cache.shortTokenOutputAmount,
            withdrawal.shortTokenSwapPath(),
            withdrawal.minShortTokenAmount(),
            withdrawal.receiver(),
            withdrawal.uiFeeReceiver(),
            withdrawal.shouldUnwrapNativeToken()
        );

        SwapPricingUtils.emitSwapFeesCollected(
            params.eventEmitter,
            market.marketToken,
            market.longToken,
            prices.longTokenPrice.min,
            "withdrawal",
            cache.longTokenFees
        );

        SwapPricingUtils.emitSwapFeesCollected(
            params.eventEmitter,
            market.marketToken,
            market.shortToken,
            prices.shortTokenPrice.min,
            "withdrawal",
            cache.shortTokenFees
        );

        // if the native token was transferred to the receiver in a swap
        // it may be possible to invoke external contracts before the validations
        // are called
        MarketUtils.validateMarketTokenBalance(params.dataStore, market);

        return result;
    }

    function swap(
        ExecuteWithdrawalParams memory params,
        Market.Props memory market,
        address tokenIn,
        uint256 amountIn,
        address[] memory swapPath,
        uint256 minOutputAmount,
        address receiver,
        address uiFeeReceiver,
        bool shouldUnwrapNativeToken
    ) internal returns (address, uint256) {
        SwapCache memory cache;

        cache.swapPathMarkets = MarketUtils.getEnabledMarkets(params.dataStore, swapPath);

        cache.swapParams.dataStore = params.dataStore;
        cache.swapParams.eventEmitter = params.eventEmitter;
        cache.swapParams.oracle = params.oracle;
        cache.swapParams.bank = Bank(payable(market.marketToken));
        cache.swapParams.key = params.key;
        cache.swapParams.tokenIn = tokenIn;
        cache.swapParams.amountIn = amountIn;
        cache.swapParams.swapPathMarkets = cache.swapPathMarkets;
        cache.swapParams.minOutputAmount = minOutputAmount;
        cache.swapParams.receiver = receiver;
        cache.swapParams.uiFeeReceiver = uiFeeReceiver;
        cache.swapParams.shouldUnwrapNativeToken = shouldUnwrapNativeToken;

        (cache.outputToken, cache.outputAmount) = SwapUtils.swap(cache.swapParams);

        // validate that internal state changes are correct before calling
        // external callbacks
        MarketUtils.validateMarketTokenBalance(params.dataStore, cache.swapPathMarkets);

        return (cache.outputToken, cache.outputAmount);
    }

    function _getOutputAmounts(
        ExecuteWithdrawalParams memory params,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        uint256 marketTokenAmount
    ) internal returns (uint256, uint256) {
        // the max pnl factor for withdrawals should be the lower of the max pnl factor values
        // which means that pnl would be capped to a smaller amount and the pool
        // value would be higher even if there is a large pnl
        // this should be okay since MarketUtils.validateMaxPnl is called after the withdrawal
        // which ensures that the max pnl factor for withdrawals was not exceeded
        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            market,
            params.oracle.getPrimaryPrice(market.indexToken),
            prices.longTokenPrice,
            prices.shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            false
        );

        if (poolValueInfo.poolValue <= 0) {
            revert Errors.InvalidPoolValueForWithdrawal(poolValueInfo.poolValue);
        }

        uint256 poolValue = poolValueInfo.poolValue.toUint256();
        uint256 marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(market.marketToken)));

        MarketEventUtils.emitMarketPoolValueInfo(
            params.eventEmitter,
            market.marketToken,
            poolValueInfo,
            marketTokensSupply
        );

        uint256 longTokenPoolAmount = MarketUtils.getPoolAmount(params.dataStore, market, market.longToken);
        uint256 shortTokenPoolAmount = MarketUtils.getPoolAmount(params.dataStore, market, market.shortToken);

        uint256 longTokenPoolUsd = longTokenPoolAmount * prices.longTokenPrice.max;
        uint256 shortTokenPoolUsd = shortTokenPoolAmount * prices.shortTokenPrice.max;

        uint256 totalPoolUsd = longTokenPoolUsd + shortTokenPoolUsd;

        uint256 marketTokensUsd = MarketUtils.marketTokenAmountToUsd(marketTokenAmount, poolValue, marketTokensSupply);

        uint256 longTokenOutputUsd = Precision.mulDiv(marketTokensUsd, longTokenPoolUsd, totalPoolUsd);
        uint256 shortTokenOutputUsd = Precision.mulDiv(marketTokensUsd, shortTokenPoolUsd, totalPoolUsd);

        return (
            longTokenOutputUsd / prices.longTokenPrice.max,
            shortTokenOutputUsd / prices.shortTokenPrice.max
        );
    }
}
