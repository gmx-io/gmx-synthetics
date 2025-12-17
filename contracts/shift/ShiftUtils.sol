// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "./ShiftVault.sol";
import "./ShiftStoreUtils.sol";
import "./ShiftEventUtils.sol";
import "./IShiftUtils.sol";

import "../nonce/NonceUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";
import "../utils/AccountUtils.sol";
import "../market/MarketUtils.sol";

import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";
import "../exchange/IWithdrawalHandler.sol";

import "../multichain/IMultichainTransferRouter.sol";

library ShiftUtils {
    using Deposit for Deposit.Props;
    using Withdrawal for Withdrawal.Props;
    using Shift for Shift.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    struct CreateShiftCache {
        uint256 estimatedGasLimit;
        uint256 oraclePriceCount;
        bytes32 key;
    }

    struct ExecuteShiftParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
        ShiftVault shiftVault;
        IOracle oracle;
        IDepositHandler depositHandler;
        IWithdrawalHandler withdrawalHandler;
        ISwapHandler swapHandler;
        bytes32 key;
        address keeper;
        uint256 startingGas;
    }

    struct ExecuteShiftCache {
        Withdrawal.Props withdrawal;
        bytes32 withdrawalKey;
        IExecuteWithdrawalUtils.ExecuteWithdrawalParams executeWithdrawalParams;
        Market.Props depositMarket;
        uint256 initialLongTokenAmount;
        uint256 initialShortTokenAmount;
        Deposit.Props deposit;
        bytes32 depositKey;
        IExecuteDepositUtils.ExecuteDepositParams executeDepositParams;
        uint256 receivedMarketTokens;
        EventUtils.EventLogData eventData;
    }

    function createShift(
        DataStore dataStore,
        EventEmitter eventEmitter,
        ShiftVault shiftVault,
        address account,
        uint256 srcChainId,
        IShiftUtils.CreateShiftParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);

        if (params.addresses.fromMarket == params.addresses.toMarket) {
            revert Errors.ShiftFromAndToMarketAreEqual(params.addresses.fromMarket);
        }

        // GMX_DATA_ACTION hash is reserved for bridging out tokens, which is not supported during shifts
        if (params.dataList.length != 0 && params.dataList[0] == Keys.GMX_DATA_ACTION) {
            revert Errors.BridgeOutNotSupportedDuringShift();
        }

        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = shiftVault.recordTransferIn(wnt);

        if (wntAmount < params.executionFee) {
            revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
        }

        AccountUtils.validateReceiver(params.addresses.receiver);

        uint256 marketTokenAmount = shiftVault.recordTransferIn(params.addresses.fromMarket);

        if (marketTokenAmount == 0) {
            revert Errors.EmptyShiftAmount();
        }

        params.executionFee = wntAmount;

        Market.Props memory fromMarket = MarketUtils.getEnabledMarket(dataStore, params.addresses.fromMarket);
        Market.Props memory toMarket = MarketUtils.getEnabledMarket(dataStore, params.addresses.toMarket);

        if (fromMarket.longToken != toMarket.longToken) {
            revert Errors.LongTokensAreNotEqual(fromMarket.longToken, toMarket.longToken);
        }

        if (fromMarket.shortToken != toMarket.shortToken) {
            revert Errors.ShortTokensAreNotEqual(fromMarket.shortToken, toMarket.shortToken);
        }

        Shift.Props memory shift = Shift.Props(
            Shift.Addresses(
                account,
                params.addresses.receiver,
                params.addresses.callbackContract,
                params.addresses.uiFeeReceiver,
                params.addresses.fromMarket,
                params.addresses.toMarket
            ),
            Shift.Numbers(
                marketTokenAmount,
                params.minMarketTokens,
                Chain.currentTimestamp(),
                params.executionFee,
                params.callbackGasLimit,
                srcChainId
            ),
            params.dataList
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, shift.callbackGasLimit());

        CreateShiftCache memory cache;

        cache.estimatedGasLimit = GasUtils.estimateExecuteShiftGasLimit(dataStore, shift);
        cache.oraclePriceCount = GasUtils.estimateShiftOraclePriceCount();
        GasUtils.validateExecutionFee(dataStore, cache.estimatedGasLimit, params.executionFee, cache.oraclePriceCount);

        cache.key = NonceUtils.getNextKey(dataStore);

        ShiftStoreUtils.set(dataStore, cache.key, shift);

        ShiftEventUtils.emitShiftCreated(eventEmitter, cache.key, shift);

        return cache.key;
    }

    // @param params execution params
    // @param shift the shift to execute
    // @param skipRemoval if true, the shift will not be removed from the data store.
    // This is used when executing a shift as part of a glv shift and the shift is not stored in the data store
    // @returns receivedMarketTokens the amount of market tokens received
    function executeShift(
        ExecuteShiftParams memory params,
        Shift.Props memory shift,
        bool skipRemoval
    ) external returns (uint256) {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        if (skipRemoval) {
            if (params.dataStore.containsBytes32(Keys.SHIFT_LIST, params.key)) {
                revert Errors.RemovalShouldNotBeSkipped(Keys.SHIFT_LIST, params.key);
            }
        } else {
            ShiftStoreUtils.remove(params.dataStore, params.key, shift.account());
        }

        if (shift.account() == address(0)) {
            revert Errors.EmptyShift();
        }

        if (shift.marketTokenAmount() == 0) {
            revert Errors.EmptyShiftAmount();
        }

        ExecuteShiftCache memory cache;

        cache.depositMarket = MarketStoreUtils.get(params.dataStore, shift.toMarket());

        // if a user sends tokens directly to the shiftVault
        // the recordTransferIn after the shift withdrawal would record
        // these additional tokens and perform a deposit on the combined
        // token amount (tokens directly sent + tokens withdrawn)
        //
        // a user could use this to avoid paying deposit fees
        //
        // call shiftVault.recordTransferIn before the withdrawal to prevent
        // this
        params.shiftVault.recordTransferIn(cache.depositMarket.longToken);
        params.shiftVault.recordTransferIn(cache.depositMarket.shortToken);

        // srcChainId must be zero for the withdrawal, so that the withdrawn
        // tokens would be sent to the ShiftVault wallet balance instead of the
        // ShiftVault multichain balance
        cache.withdrawal = Withdrawal.Props(
            Withdrawal.Addresses(
                shift.account(),
                address(params.shiftVault), // receiver
                address(0), // callbackContract
                shift.uiFeeReceiver(), // uiFeeReceiver
                shift.fromMarket(), // market
                new address[](0), // longTokenSwapPath
                new address[](0) // shortTokenSwapPath
            ),
            Withdrawal.Numbers(
                shift.marketTokenAmount(),
                0, // minLongTokenAmount
                0, // minShortTokenAmount
                shift.updatedAtTime(),
                0, // executionFee
                0, // callbackGasLimit
                0 // srcChainId is the current block.chainId
            ),
            Withdrawal.Flags(false),
            new bytes32[](0) // dataList
        );

        cache.withdrawalKey = keccak256(abi.encode(params.key, "withdrawal"));
        WithdrawalEventUtils.emitWithdrawalCreated(
            params.eventEmitter,
            cache.withdrawalKey,
            cache.withdrawal,
            Withdrawal.WithdrawalType.Shift
        );

        cache.executeWithdrawalParams = IExecuteWithdrawalUtils.ExecuteWithdrawalParams(
            params.dataStore,
            params.eventEmitter,
            params.multichainVault,
            IMultichainTransferRouter(payable(0)),
            WithdrawalVault(payable(params.shiftVault)),
            params.oracle,
            params.swapHandler,
            cache.withdrawalKey,
            params.keeper,
            params.startingGas,
            ISwapPricingUtils.SwapPricingType.Shift
        );

        params.withdrawalHandler.executeWithdrawalFromController(cache.executeWithdrawalParams, cache.withdrawal);

        // if the initialLongToken and initialShortToken are the same, only the initialLongTokenAmount would
        // be non-zero, the initialShortTokenAmount would be zero
        cache.initialLongTokenAmount = params.shiftVault.recordTransferIn(cache.depositMarket.longToken);
        cache.initialShortTokenAmount = params.shiftVault.recordTransferIn(cache.depositMarket.shortToken);

        // set the uiFeeReceiver to the zero address since the ui fee was already paid
        // while executing the withdrawal
        // srcChainId should be the Shift srcChainId so that the GM tokens would
        // go into the appropriate balance either the user's wallet balance
        // or their multichain balance
        cache.deposit = Deposit.Props(
            Deposit.Addresses(
                shift.account(),
                shift.receiver(),
                address(0), // callbackContract
                address(0), // uiFeeReceiver
                shift.toMarket(), // market
                cache.depositMarket.longToken, // initialLongToken
                cache.depositMarket.shortToken, // initialShortToken
                new address[](0), // longTokenSwapPath
                new address[](0) // shortTokenSwapPath
            ),
            Deposit.Numbers(
                cache.initialLongTokenAmount,
                cache.initialShortTokenAmount,
                shift.minMarketTokens(),
                shift.updatedAtTime(),
                0, // executionFee
                0, // callbackGasLimit
                shift.srcChainId()
            ),
            Deposit.Flags(
                false // shouldUnwrapNativeToken
            ),
            new bytes32[](0) // dataList
        );

        cache.depositKey = keccak256(abi.encode(params.key, "deposit"));
        DepositEventUtils.emitDepositCreated(
            params.eventEmitter,
            cache.depositKey,
            cache.deposit,
            Deposit.DepositType.Shift
        );

        // price impact from changes in virtual inventory should be excluded
        // since the action of withdrawing and depositing should not result in
        // a net change of virtual inventory
        // shift.srcChainId should be used for the srcChainId here so that GM tokens
        // would go to the appropriate balance eitehr the user's wallet balance or multichain balance
        cache.executeDepositParams = IExecuteDepositUtils.ExecuteDepositParams(
            params.dataStore,
            params.eventEmitter,
            params.multichainVault,
            IMultichainTransferRouter(payable(0)),
            DepositVault(payable(params.shiftVault)),
            params.oracle,
            params.swapHandler,
            cache.depositKey,
            params.keeper,
            params.startingGas,
            ISwapPricingUtils.SwapPricingType.Shift,
            false // includeVirtualInventoryImpact
        );

        cache.receivedMarketTokens = params.depositHandler.executeDepositFromController(
            cache.executeDepositParams,
            cache.deposit
        );

        ShiftEventUtils.emitShiftExecuted(params.eventEmitter, params.key, shift.account(), cache.receivedMarketTokens);

        cache.eventData.uintItems.initItems(1);
        cache.eventData.uintItems.setItem(0, "receivedMarketTokens", cache.receivedMarketTokens);
        CallbackUtils.afterShiftExecution(params.key, shift, cache.eventData);

        GasUtils.payExecutionFee(
            GasUtils.PayExecutionFeeContracts(
                params.dataStore,
                params.eventEmitter,
                params.multichainVault,
                params.shiftVault
            ),
            params.key,
            shift.callbackContract(),
            shift.executionFee(),
            params.startingGas,
            GasUtils.estimateShiftOraclePriceCount(),
            params.keeper,
            shift.receiver(),
            shift.srcChainId()
        );

        return cache.receivedMarketTokens;
    }

    function cancelShift(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MultichainVault multichainVault,
        ShiftVault shiftVault,
        bytes32 key,
        address keeper,
        uint256 startingGas,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        startingGas -= gasleft() / 63;

        Shift.Props memory shift = ShiftStoreUtils.get(dataStore, key);

        if (shift.account() == address(0)) {
            revert Errors.EmptyShift();
        }

        if (shift.marketTokenAmount() == 0) {
            revert Errors.EmptyShiftAmount();
        }

        ShiftStoreUtils.remove(dataStore, key, shift.account());

        if (shift.srcChainId() == 0) {
            shiftVault.transferOut(
                shift.fromMarket(),
                shift.account(),
                shift.marketTokenAmount(),
                false // shouldUnwrapNativeToken
            );
        } else {
            shiftVault.transferOut(
                shift.fromMarket(),
                address(multichainVault),
                shift.marketTokenAmount(),
                false // shouldUnwrapNativeToken
            );
            MultichainUtils.recordTransferIn(
                dataStore,
                eventEmitter,
                multichainVault,
                shift.fromMarket(),
                shift.account(),
                0 // srcChainId is the current block.chainId
            );
        }

        ShiftEventUtils.emitShiftCancelled(eventEmitter, key, shift.account(), reason, reasonBytes);

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterShiftCancellation(key, shift, eventData);

        GasUtils.payExecutionFee(
            GasUtils.PayExecutionFeeContracts(dataStore, eventEmitter, multichainVault, shiftVault),
            key,
            shift.callbackContract(),
            shift.executionFee(),
            startingGas,
            GasUtils.estimateShiftOraclePriceCount(),
            keeper,
            shift.receiver(),
            shift.srcChainId()
        );
    }
}
