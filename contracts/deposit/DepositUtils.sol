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
import "../utils/ReceiverUtils.sol";

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
    // @param market the market to deposit into
    // @param minMarketTokens the minimum acceptable number of liquidity tokens
    // @param shouldUnwrapNativeToken whether to unwrap the native token when
    // sending funds back to the user in case the deposit gets cancelled
    // @param executionFee the execution fee for keepers
    // @param callbackGasLimit the gas limit for the callbackContract
    struct CreateDepositParams {
        address receiver;
        address callbackContract;
        address market;
        address initialLongToken;
        address initialShortToken;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 minMarketTokens;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    error EmptyDeposit();
    error InsufficientWntAmountForExecutionFee(uint256 wntAmount, uint256 executionFee);

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
        CreateDepositParams memory params
    ) external returns (bytes32) {
        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, params.market);

        uint256 initialLongTokenAmount = depositVault.recordTransferIn(params.initialLongToken);
        uint256 initialShortTokenAmount = depositVault.recordTransferIn(params.initialShortToken);

        address wnt = TokenUtils.wnt(dataStore);

        if (market.longToken == wnt) {
            initialLongTokenAmount -= params.executionFee;
        } else if (market.shortToken == wnt) {
            initialShortTokenAmount -= params.executionFee;
        } else {
            uint256 wntAmount = depositVault.recordTransferIn(wnt);
            if (wntAmount < params.executionFee) {
                revert InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
            }

            GasUtils.handleExcessExecutionFee(
                dataStore,
                depositVault,
                wntAmount,
                params.executionFee
            );
        }

        if (initialLongTokenAmount == 0 && initialShortTokenAmount == 0) {
            revert EmptyDeposit();
        }

        ReceiverUtils.validateReceiver(params.receiver);

        Deposit.Props memory deposit = Deposit.Props(
            Deposit.Addresses(
                account,
                params.receiver,
                params.callbackContract,
                market.marketToken,
                params.initialLongToken,
                params.initialShortToken,
                params.longTokenSwapPath,
                params.shortTokenSwapPath
            ),
            Deposit.Numbers(
                initialLongTokenAmount,
                initialShortTokenAmount,
                params.minMarketTokens,
                Chain.currentBlockNumber(),
                params.executionFee,
                params.callbackGasLimit
            ),
            Deposit.Flags(
                params.shouldUnwrapNativeToken
            )
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, deposit.callbackGasLimit());

        uint256 estimatedGasLimit = GasUtils.estimateExecuteDepositGasLimit(dataStore, deposit);
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee);

        bytes32 key = NonceUtils.getNextKey(dataStore);

        DepositStoreUtils.set(dataStore, key, deposit);

        DepositEventUtils.emitDepositCreated(eventEmitter, key, deposit);

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
        Deposit.Props memory deposit = DepositStoreUtils.get(dataStore, key);
        if (deposit.account() == address(0)) {
            revert EmptyDeposit();
        }

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

        DepositStoreUtils.remove(dataStore, key, deposit.account());

        DepositEventUtils.emitDepositCancelled(eventEmitter, key, reason, reasonBytes);

        CallbackUtils.afterDepositCancellation(key, deposit);

        GasUtils.payExecutionFee(
            dataStore,
            depositVault,
            deposit.executionFee(),
            startingGas,
            keeper,
            deposit.account()
        );
    }
}
