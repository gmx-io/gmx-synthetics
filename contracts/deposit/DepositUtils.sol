// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "./DepositVault.sol";
import "./DepositStoreUtils.sol";
import "./DepositEventUtils.sol";

import "../nonce/NonceUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";
import "../utils/AccountUtils.sol";

// @title DepositUtils
// @dev Library for deposit functions, to help with the depositing of liquidity
// into a market in return for market tokens
library DepositUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    using Price for Price.Props;
    using Deposit for Deposit.Props;

    // @dev CreateDepositParams struct used in createDeposit to avoid stack
    // too deep errors
    //
    // @param receiver the address to send the market tokens to
    // @param callbackContract the callback contract
    // @param uiFeeReceiver the ui fee receiver
    // @param market the market to deposit into
    // @param minMarketTokens the minimum acceptable number of liquidity tokens
    // @param shouldUnwrapNativeToken whether to unwrap the native token when
    // sending funds back to the user in case the deposit gets cancelled
    // @param executionFee the execution fee for keepers
    // @param callbackGasLimit the gas limit for the callbackContract
    struct CreateDepositParams {
        CreateDepositParamsAdresses addresses;
        uint256 minMarketTokens;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bytes32[] dataList;
    }

    struct CreateDepositParamsAdresses {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address initialLongToken;
        address initialShortToken;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
    }

    // @dev creates a deposit
    //
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param depositVault DepositVault
    // @param account the depositing account
    // @param params CreateDepositParams
    function createDeposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        DepositVault depositVault,
        address account,
        uint256 srcChainId,
        CreateDepositParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, params.addresses.market);
        MarketUtils.validateSwapPath(dataStore, params.addresses.longTokenSwapPath);
        MarketUtils.validateSwapPath(dataStore, params.addresses.shortTokenSwapPath);

        // if the initialLongToken and initialShortToken are the same, only the initialLongTokenAmount would
        // be non-zero, the initialShortTokenAmount would be zero
        uint256 initialLongTokenAmount = depositVault.recordTransferIn(params.addresses.initialLongToken);
        uint256 initialShortTokenAmount = depositVault.recordTransferIn(params.addresses.initialShortToken);

        address wnt = TokenUtils.wnt(dataStore);

        if (params.addresses.initialLongToken == wnt) {
            initialLongTokenAmount -= params.executionFee;
        } else if (params.addresses.initialShortToken == wnt) {
            initialShortTokenAmount -= params.executionFee;
        } else {
            uint256 wntAmount = depositVault.recordTransferIn(wnt);
            if (wntAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
            }

            params.executionFee = wntAmount;
        }

        if (initialLongTokenAmount == 0 && initialShortTokenAmount == 0) {
            revert Errors.EmptyDepositAmounts();
        }

        AccountUtils.validateReceiver(params.addresses.receiver);

        Deposit.Props memory deposit = Deposit.Props(
            Deposit.Addresses(
                account,
                params.addresses.receiver,
                params.addresses.callbackContract,
                params.addresses.uiFeeReceiver,
                market.marketToken,
                params.addresses.initialLongToken,
                params.addresses.initialShortToken,
                params.addresses.longTokenSwapPath,
                params.addresses.shortTokenSwapPath
            ),
            Deposit.Numbers(
                initialLongTokenAmount,
                initialShortTokenAmount,
                params.minMarketTokens,
                Chain.currentTimestamp(), // updatedAtTime
                params.executionFee,
                params.callbackGasLimit,
                srcChainId
            ),
            Deposit.Flags(
                params.shouldUnwrapNativeToken
            ),
            params.dataList
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, deposit.callbackGasLimit());

        GasUtils.validateExecutionFee(
            dataStore,
            GasUtils.estimateExecuteDepositGasLimit(dataStore, deposit), // estimatedGasLimit
            params.executionFee,
            GasUtils.estimateDepositOraclePriceCount(deposit.longTokenSwapPath().length + deposit.shortTokenSwapPath().length) // oraclePriceCount
        );

        bytes32 key = NonceUtils.getNextKey(dataStore);

        DepositStoreUtils.set(dataStore, key, deposit);

        DepositEventUtils.emitDepositCreated(eventEmitter, key, deposit, Deposit.DepositType.Normal);

        return key;
    }

    // @dev cancels a deposit, funds are sent back to the user
    //
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param depositVault DepositVault
    // @param key the key of the deposit to cancel
    // @param keeper the address of the keeper
    // @param startingGas the starting gas amount
    function cancelDeposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        DepositVault depositVault,
        bytes32 key,
        address keeper,
        uint256 startingGas,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        startingGas -= gasleft() / 63;

        Deposit.Props memory deposit = DepositStoreUtils.get(dataStore, key);
        if (deposit.account() == address(0)) {
            revert Errors.EmptyDeposit();
        }

        if (
            deposit.initialLongTokenAmount() == 0 &&
            deposit.initialShortTokenAmount() == 0
        ) {
            revert Errors.EmptyDepositAmounts();
        }

        DepositStoreUtils.remove(dataStore, key, deposit.account());

        if (deposit.initialLongTokenAmount() > 0) {
            depositVault.transferOut(
                deposit.initialLongToken(),
                deposit.account(),
                deposit.initialLongTokenAmount(),
                deposit.shouldUnwrapNativeToken()
            );
        }

        if (deposit.initialShortTokenAmount() > 0) {
            depositVault.transferOut(
                deposit.initialShortToken(),
                deposit.account(),
                deposit.initialShortTokenAmount(),
                deposit.shouldUnwrapNativeToken()
            );
        }

        DepositEventUtils.emitDepositCancelled(
            eventEmitter,
            key,
            deposit.account(),
            reason,
            reasonBytes
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterDepositCancellation(key, deposit, eventData);

        GasUtils.payExecutionFee(
            dataStore,
            eventEmitter,
            depositVault,
            key,
            deposit.callbackContract(),
            deposit.executionFee(),
            startingGas,
            GasUtils.estimateDepositOraclePriceCount(deposit.longTokenSwapPath().length + deposit.shortTokenSwapPath().length),
            keeper,
            deposit.receiver()
        );
    }
}
