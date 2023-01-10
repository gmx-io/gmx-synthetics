// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../adl/AdlUtils.sol";

import "../data/DataStore.sol";

import "./WithdrawalVault.sol";
import "./WithdrawalStoreUtils.sol";
import "./WithdrawalEventUtils.sol";

import "../market/MarketStore.sol";

import "../nonce/NonceUtils.sol";
import "../pricing/SwapPricingUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";

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
        WithdrawalVault withdrawalVault;
        MarketStore marketStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        bytes32 key;
        uint256[] oracleBlockNumbers;
        address keeper;
        uint256 startingGas;
    }

    error MinLongTokens(uint256 received, uint256 expected);
    error MinShortTokens(uint256 received, uint256 expected);
    error InsufficientMarketTokens(uint256 balance, uint256 expected);

    /**
     * @dev Creates a withdrawal in the withdrawal store.
     *
     * @param dataStore The data store where withdrawal data is stored.
     * @param eventEmitter The event emitter that is used to emit events.
     * @param withdrawalVault WithdrawalVault.
     * @param marketStore The market store where market data is stored.
     * @param account The account that initiated the withdrawal.
     * @param params The parameters for creating the withdrawal.
     * @return The unique identifier of the created withdrawal.
     */
    function createWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        WithdrawalVault withdrawalVault,
        MarketStore marketStore,
        address account,
        CreateWithdrawalParams memory params
    ) external returns (bytes32) {
        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = withdrawalVault.recordTransferIn(wnt);
        require(wntAmount == params.executionFee, "WithdrawalUtils: invalid wntAmount");

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, marketStore, params.market);

        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            Withdrawal.Addresses(
                account,
                params.receiver,
                params.callbackContract,
                market.marketToken
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
        require(withdrawal.account() != address(0), "WithdrawalUtils: empty withdrawal");
        require(withdrawal.marketTokenAmount() > 0, "WithdrawalUtils: empty marketTokenAmount");

        if (!params.oracleBlockNumbers.areEqualTo(withdrawal.updatedAtBlock())) {
            OracleUtils.revertOracleBlockNumbersAreNotEqual(params.oracleBlockNumbers, withdrawal.updatedAtBlock());
        }

        uint256 marketTokensBalance = MarketToken(payable(withdrawal.market())).balanceOf(withdrawal.account());
        if (marketTokensBalance < withdrawal.marketTokenAmount()) {
            revert InsufficientMarketTokens(marketTokensBalance, withdrawal.marketTokenAmount());
        }

        CallbackUtils.beforeWithdrawalExecution(params.key, withdrawal);

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
        bytes memory reason
    ) external {
        Withdrawal.Props memory withdrawal = WithdrawalStoreUtils.get(dataStore, key);
        require(withdrawal.account() != address(0), "WithdrawalUtils: empty withdrawal");

        WithdrawalStoreUtils.remove(dataStore, key, withdrawal.account());

        WithdrawalEventUtils.emitWithdrawalCancelled(eventEmitter, key, reason);

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
        Market.Props memory market = MarketUtils.getEnabledMarket(params.dataStore, params.marketStore, withdrawal.market());

        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(
            params.oracle,
            market
        );

        (uint256 longTokenOutputAmount, uint256 shortTokenOutputAmount) = _getOutputAmounts(params, market, prices, withdrawal.marketTokenAmount());

        SwapPricingUtils.SwapFees memory longTokenFees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            market.marketToken,
            longTokenOutputAmount,
            Keys.FEE_RECEIVER_WITHDRAWAL_FACTOR
        );

        PricingUtils.transferFees(
            params.feeReceiver,
            market.marketToken,
            market.longToken,
            longTokenFees.feeReceiverAmount,
            FeeUtils.WITHDRAWAL_FEE
        );

        SwapPricingUtils.SwapFees memory shortTokenFees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            market.marketToken,
            shortTokenOutputAmount,
            Keys.FEE_RECEIVER_WITHDRAWAL_FACTOR
        );

        PricingUtils.transferFees(
            params.feeReceiver,
            market.marketToken,
            market.shortToken,
            shortTokenFees.feeReceiverAmount,
            FeeUtils.WITHDRAWAL_FEE
        );

        // the pool will be reduced by the outputAmount minus the fees for the pool
        uint256 longTokenPoolAmountDelta = longTokenOutputAmount - longTokenFees.feesForPool;
        longTokenOutputAmount = longTokenFees.amountAfterFees;

        uint256 shortTokenPoolAmountDelta = shortTokenOutputAmount - shortTokenFees.feesForPool;
        shortTokenOutputAmount = shortTokenFees.amountAfterFees;

        if (longTokenOutputAmount < withdrawal.minLongTokenAmount()) {
            revert MinLongTokens(longTokenOutputAmount, withdrawal.minLongTokenAmount());
        }

        if (shortTokenOutputAmount < withdrawal.minShortTokenAmount()) {
            revert MinShortTokens(shortTokenOutputAmount, withdrawal.minShortTokenAmount());
        }

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.longToken,
            -longTokenPoolAmountDelta.toInt256()
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.shortToken,
            -shortTokenPoolAmountDelta.toInt256()
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

        AdlUtils.validatePoolState(
            params.dataStore,
            market,
            prices,
            true
        );

        WithdrawalStoreUtils.remove(params.dataStore, params.key, withdrawal.account());

        MarketToken(payable(market.marketToken)).burn(withdrawal.account(), withdrawal.marketTokenAmount());

        MarketToken(payable(market.marketToken)).transferOut(
            market.longToken,
            withdrawal.receiver(),
            longTokenOutputAmount,
            withdrawal.shouldUnwrapNativeToken()
        );

        MarketToken(payable(market.marketToken)).transferOut(
            market.shortToken,
            withdrawal.receiver(),
            shortTokenOutputAmount,
            withdrawal.shouldUnwrapNativeToken()
        );

        SwapPricingUtils.emitSwapFeesCollected(
            params.eventEmitter,
            market.marketToken,
            market.longToken,
            "withdrawal",
            longTokenFees
        );

        SwapPricingUtils.emitSwapFeesCollected(
            params.eventEmitter,
            market.marketToken,
            market.shortToken,
            "withdrawal",
            shortTokenFees
        );
    }

    function _getOutputAmounts(
        ExecuteWithdrawalParams memory params,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        uint256 marketTokenAmount
    ) internal view returns (uint256, uint256) {
        int256 _poolValue = MarketUtils.getPoolValue(
            params.dataStore,
            market,
            prices.longTokenPrice,
            prices.shortTokenPrice,
            params.oracle.getPrimaryPrice(market.indexToken),
            false
        );

        if (_poolValue <= 0) {
            revert("Invalid pool state");
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
