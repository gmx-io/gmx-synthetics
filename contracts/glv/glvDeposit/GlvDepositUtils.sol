// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../deposit/ExecuteDepositUtils.sol";

import "../../nonce/NonceUtils.sol";

import "../GlvVault.sol";
import "../GlvUtils.sol";
import "./GlvDepositEventUtils.sol";
import "./GlvDepositStoreUtils.sol";

library GlvDepositUtils {
    using GlvDeposit for GlvDeposit.Props;

    struct CreateGlvDepositParams {
        address glv;
        address market;
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address initialLongToken;
        address initialShortToken;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 minGlvTokens;
        uint256 executionFee;
        uint256 callbackGasLimit;
        uint256 srcChainId;
        bool shouldUnwrapNativeToken;
        bool isMarketTokenDeposit;
        bytes32[] dataList;
    }

    struct CreateGlvDepositCache {
        uint256 marketTokenAmount;
        uint256 initialLongTokenAmount;
        uint256 initialShortTokenAmount;
    }

    struct CancelGlvDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        GlvVault glvVault;
        bytes32 key;
        address keeper;
        uint256 startingGas;
        string reason;
        bytes reasonBytes;
    }

    address public constant RECEIVER_FOR_FIRST_GLV_DEPOSIT = address(1);

    function createGlvDeposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        GlvVault glvVault,
        address account,
        CreateGlvDepositParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);
        GlvUtils.validateGlv(dataStore, params.glv);
        GlvUtils.validateGlvMarket(dataStore, params.glv, params.market, true);

        MarketUtils.validateEnabledMarket(dataStore, params.market);

        CreateGlvDepositCache memory cache;

        if (params.isMarketTokenDeposit) {
            // user deposited GM tokens
            if (params.initialLongToken != address(0)) {
                revert Errors.InvalidGlvDepositInitialLongToken(params.initialLongToken);
            }
            if (params.initialShortToken != address(0)) {
                revert Errors.InvalidGlvDepositInitialShortToken(params.initialShortToken);
            }
            if (params.longTokenSwapPath.length > 0 || params.shortTokenSwapPath.length > 0) {
                revert Errors.InvalidGlvDepositSwapPath(
                    params.longTokenSwapPath.length,
                    params.shortTokenSwapPath.length
                );
            }
            cache.marketTokenAmount = glvVault.recordTransferIn(params.market);

            if (cache.marketTokenAmount == 0) {
                revert Errors.EmptyGlvMarketAmount();
            }
        } else {
            MarketUtils.validateSwapPath(dataStore, params.longTokenSwapPath);
            MarketUtils.validateSwapPath(dataStore, params.shortTokenSwapPath);

            if (params.initialLongToken == address(0)) {
                revert Errors.InvalidGlvDepositInitialLongToken(params.initialLongToken);
            }
            if (params.initialShortToken == address(0)) {
                revert Errors.InvalidGlvDepositInitialShortToken(params.initialShortToken);
            }

            // if the initialLongToken and initialShortToken are the same, only the initialLongTokenAmount would
            // be non-zero, the initialShortTokenAmount would be zero
            cache.initialLongTokenAmount = glvVault.recordTransferIn(params.initialLongToken);
            if (params.initialShortToken != params.initialLongToken) {
                cache.initialShortTokenAmount = glvVault.recordTransferIn(params.initialShortToken);
            }
        }

        address wnt = TokenUtils.wnt(dataStore);
        if (params.initialLongToken == wnt) {
            if (cache.initialLongTokenAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(cache.initialLongTokenAmount, params.executionFee);
            }
            cache.initialLongTokenAmount -= params.executionFee;
        } else if (params.initialShortToken == wnt) {
            if (cache.initialShortTokenAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(cache.initialShortTokenAmount, params.executionFee);
            }
            cache.initialShortTokenAmount -= params.executionFee;
        } else {
            uint256 wntAmount = glvVault.recordTransferIn(wnt);
            if (wntAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
            }

            params.executionFee = wntAmount;
        }

        if (!params.isMarketTokenDeposit && (cache.initialLongTokenAmount == 0 && cache.initialShortTokenAmount == 0)) {
            revert Errors.EmptyGlvDepositAmounts();
        }

        AccountUtils.validateReceiver(params.receiver);

        GlvDeposit.Props memory glvDeposit = GlvDeposit.Props(
            GlvDeposit.Addresses({
                account: account,
                glv: params.glv,
                receiver: params.receiver,
                callbackContract: params.callbackContract,
                uiFeeReceiver: params.uiFeeReceiver,
                market: params.market,
                initialLongToken: params.initialLongToken,
                initialShortToken: params.initialShortToken,
                longTokenSwapPath: params.longTokenSwapPath,
                shortTokenSwapPath: params.shortTokenSwapPath
            }),
            GlvDeposit.Numbers({
                marketTokenAmount: cache.marketTokenAmount,
                initialLongTokenAmount: cache.initialLongTokenAmount,
                initialShortTokenAmount: cache.initialShortTokenAmount,
                minGlvTokens: params.minGlvTokens,
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: params.callbackGasLimit,
                srcChainId: params.srcChainId
            }),
            GlvDeposit.Flags({
                shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
                isMarketTokenDeposit: params.isMarketTokenDeposit
            }),
            params.dataList
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, params.callbackGasLimit);

        uint256 marketCount = GlvUtils.getGlvMarketCount(dataStore, glvDeposit.glv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteGlvDepositGasLimit(dataStore, glvDeposit, marketCount);
        uint256 oraclePriceCount = GasUtils.estimateGlvDepositOraclePriceCount(
            marketCount,
            params.longTokenSwapPath.length + params.shortTokenSwapPath.length
        );
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee, oraclePriceCount);

        bytes32 key = NonceUtils.getNextKey(dataStore);

        GlvDepositStoreUtils.set(dataStore, key, glvDeposit);

        GlvDepositEventUtils.emitGlvDepositCreated(eventEmitter, key, glvDeposit);

        return key;
    }

    function cancelGlvDeposit(CancelGlvDepositParams memory params) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(params.dataStore, params.key);
        GlvDepositStoreUtils.remove(params.dataStore, params.key, glvDeposit.account());

        if (glvDeposit.isMarketTokenDeposit()) {
            // in this case marketTokenAmount > 0
            params.glvVault.transferOut(
                glvDeposit.market(),
                glvDeposit.account(),
                glvDeposit.marketTokenAmount(),
                glvDeposit.shouldUnwrapNativeToken()
            );
        } else {
            if (glvDeposit.initialLongTokenAmount() > 0) {
                params.glvVault.transferOut(
                    glvDeposit.initialLongToken(),
                    glvDeposit.account(),
                    glvDeposit.initialLongTokenAmount(),
                    glvDeposit.shouldUnwrapNativeToken()
                );
            }

            if (glvDeposit.initialShortTokenAmount() > 0) {
                params.glvVault.transferOut(
                    glvDeposit.initialShortToken(),
                    glvDeposit.account(),
                    glvDeposit.initialShortTokenAmount(),
                    glvDeposit.shouldUnwrapNativeToken()
                );
            }
        }

        GlvDepositEventUtils.emitGlvDepositCancelled(
            params.eventEmitter,
            params.key,
            glvDeposit.account(),
            params.reason,
            params.reasonBytes
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterGlvDepositCancellation(params.key, glvDeposit, eventData);

        uint256 marketCount = GlvUtils.getGlvMarketCount(params.dataStore, glvDeposit.glv());
        uint256 oraclePriceCount = GasUtils.estimateGlvDepositOraclePriceCount(
            marketCount,
            glvDeposit.longTokenSwapPath().length + glvDeposit.shortTokenSwapPath().length
        );
        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
            params.glvVault,
            params.key,
            glvDeposit.callbackContract(),
            glvDeposit.executionFee(),
            params.startingGas,
            oraclePriceCount,
            params.keeper,
            glvDeposit.receiver()
        );
    }
}
