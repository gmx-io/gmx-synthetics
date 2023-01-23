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
        uint256 minMarketTokens;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
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
        CreateDepositParams memory params
    ) external returns (bytes32) {
        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, params.market);

        uint256 longTokenAmount = depositVault.recordTransferIn(market.longToken);
        uint256 shortTokenAmount = depositVault.recordTransferIn(market.shortToken);

        address wnt = TokenUtils.wnt(dataStore);

        if (market.longToken == wnt) {
            longTokenAmount -= params.executionFee;
        } else if (market.shortToken == wnt) {
            shortTokenAmount -= params.executionFee;
        } else {
            uint256 wntAmount = depositVault.recordTransferIn(wnt);
            require(wntAmount >= params.executionFee, "DepositUtils: invalid wntAmount");

            GasUtils.handleExcessExecutionFee(
                dataStore,
                depositVault,
                wntAmount,
                params.executionFee
            );
        }

        if (longTokenAmount == 0 && shortTokenAmount == 0) {
            revert("DepositUtils: empty deposit");
        }

        if (params.receiver == address(0)) {
            revert("Invalid receiver");
        }

        Deposit.Props memory deposit = Deposit.Props(
            Deposit.Addresses(
                account,
                params.receiver,
                params.callbackContract,
                market.marketToken
            ),
            Deposit.Numbers(
                longTokenAmount,
                shortTokenAmount,
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
        require(deposit.account() != address(0), "DepositUtils: empty deposit");

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, deposit.market());

        if (deposit.longTokenAmount() > 0) {
            depositVault.transferOut(
                market.longToken,
                deposit.account(),
                deposit.longTokenAmount(),
                deposit.shouldUnwrapNativeToken()
            );
        }

        if (deposit.shortTokenAmount() > 0) {
            depositVault.transferOut(
                market.shortToken,
                deposit.account(),
                deposit.shortTokenAmount(),
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
