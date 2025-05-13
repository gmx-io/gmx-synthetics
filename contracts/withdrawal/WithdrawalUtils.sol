// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";

import "./WithdrawalVault.sol";
import "./WithdrawalStoreUtils.sol";
import "./WithdrawalEventUtils.sol";
import "./IWithdrawalUtils.sol";

import "../nonce/NonceUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../price/Price.sol";
import "../market/MarketUtils.sol";
import "../utils/Array.sol";
import "../utils/AccountUtils.sol";

import "../multichain/MultichainVault.sol";

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
     * @dev Creates a withdrawal in the withdrawal store.
     *
     * @param dataStore The data store where withdrawal data is stored.
     * @param eventEmitter The event emitter that is used to emit events.
     * @param withdrawalVault WithdrawalVault.
     * @param account The account that initiated the withdrawal.
     * @param srcChainId The source chain id for the withdrawal.
     * @param params The parameters for creating the withdrawal.
     * @param isAtomicWithdrawal Whether the withdrawal is atomic.
     * @return The unique identifier of the created withdrawal.
     */
    function createWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        WithdrawalVault withdrawalVault,
        address account,
        uint256 srcChainId,
        IWithdrawalUtils.CreateWithdrawalParams memory params,
        bool isAtomicWithdrawal
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);

        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = withdrawalVault.recordTransferIn(wnt);

        if (wntAmount < params.executionFee) {
            revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
        }

        AccountUtils.validateReceiver(params.addresses.receiver);

        uint256 marketTokenAmount = withdrawalVault.recordTransferIn(params.addresses.market);

        if (marketTokenAmount == 0) {
            revert Errors.EmptyWithdrawalAmount();
        }
        params.executionFee = wntAmount;

        MarketUtils.validateEnabledMarket(dataStore, params.addresses.market);
        MarketUtils.validateSwapPath(dataStore, params.addresses.longTokenSwapPath);
        MarketUtils.validateSwapPath(dataStore, params.addresses.shortTokenSwapPath);

        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            Withdrawal.Addresses(
                account,
                params.addresses.receiver,
                params.addresses.callbackContract,
                params.addresses.uiFeeReceiver,
                params.addresses.market,
                params.addresses.longTokenSwapPath,
                params.addresses.shortTokenSwapPath
            ),
            Withdrawal.Numbers(
                marketTokenAmount,
                params.minLongTokenAmount,
                params.minShortTokenAmount,
                Chain.currentTimestamp(), // updatedAtTime
                params.executionFee,
                params.callbackGasLimit,
                srcChainId
            ),
            Withdrawal.Flags(
                params.shouldUnwrapNativeToken
            ),
            params.dataList
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, withdrawal.callbackGasLimit());

        if (!isAtomicWithdrawal) {
            uint256 estimatedGasLimit = GasUtils.estimateExecuteWithdrawalGasLimit(dataStore, withdrawal);
            uint256 oraclePriceCount = GasUtils.estimateWithdrawalOraclePriceCount(withdrawal.longTokenSwapPath().length + withdrawal.shortTokenSwapPath().length);
            GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee, oraclePriceCount);
        }

        bytes32 key = NonceUtils.getNextKey(dataStore);

        WithdrawalStoreUtils.set(dataStore, key, withdrawal);

        WithdrawalEventUtils.emitWithdrawalCreated(eventEmitter, key, withdrawal, Withdrawal.WithdrawalType.Normal);

        return key;
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
        MultichainVault multichainVault,
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

        if (withdrawal.srcChainId() == 0) {
            withdrawalVault.transferOut(
                withdrawal.market(),
                withdrawal.account(),
                withdrawal.marketTokenAmount(),
                false // shouldUnwrapNativeToken
            );
        } else {
            withdrawalVault.transferOut(
                withdrawal.market(),
                address(multichainVault),
                withdrawal.marketTokenAmount(),
                false // shouldUnwrapNativeToken
            );
            MultichainUtils.recordTransferIn(
                dataStore,
                eventEmitter,
                multichainVault,
                withdrawal.market(),
                withdrawal.account(),
                0 // srcChainId is the current block.chainId
            );
        }


        WithdrawalEventUtils.emitWithdrawalCancelled(
            eventEmitter,
            key,
            withdrawal.account(),
            reason,
            reasonBytes
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterWithdrawalCancellation(key, withdrawal, eventData);

        GasUtils.payExecutionFee(
            GasUtils.PayExecutionFeeContracts(
                dataStore,
                eventEmitter,
                multichainVault,
                withdrawalVault
            ),
            key,
            withdrawal.callbackContract(),
            withdrawal.executionFee(),
            startingGas,
            GasUtils.estimateWithdrawalOraclePriceCount(withdrawal.longTokenSwapPath().length + withdrawal.shortTokenSwapPath().length),
            keeper,
            withdrawal.receiver(),
            withdrawal.srcChainId()
        );
    }
}
