// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;


import "../../nonce/NonceUtils.sol";
import "../../gas/GasUtils.sol";
import "../../multichain/MultichainVault.sol";

import "../GlvVault.sol";
import "../GlvUtils.sol";

import "./IGlvDepositUtils.sol";
import "./GlvDepositEventUtils.sol";
import "./GlvDepositStoreUtils.sol";

library GlvDepositUtils {
    using GlvDeposit for GlvDeposit.Props;
    using Price for Price.Props;

    struct CreateGlvDepositCache {
        uint256 marketTokenAmount;
        uint256 initialLongTokenAmount;
        uint256 initialShortTokenAmount;
    }

    struct CancelGlvDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
        GlvVault glvVault;
        IOracle oracle;
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
        uint256 srcChainId,
        IGlvDepositUtils.CreateGlvDepositParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);
        GlvUtils.validateGlv(dataStore, params.addresses.glv);
        GlvUtils.validateGlvMarket(dataStore, params.addresses.glv, params.addresses.market, true);

        MarketUtils.validateEnabledMarket(dataStore, params.addresses.market);

        CreateGlvDepositCache memory cache;

        if (params.isMarketTokenDeposit) {
            // user deposited GM tokens
            if (params.addresses.initialLongToken != address(0)) {
                revert Errors.InvalidGlvDepositInitialLongToken(params.addresses.initialLongToken);
            }
            if (params.addresses.initialShortToken != address(0)) {
                revert Errors.InvalidGlvDepositInitialShortToken(params.addresses.initialShortToken);
            }
            if (params.addresses.longTokenSwapPath.length > 0 || params.addresses.shortTokenSwapPath.length > 0) {
                revert Errors.InvalidGlvDepositSwapPath(
                    params.addresses.longTokenSwapPath.length,
                    params.addresses.shortTokenSwapPath.length
                );
            }
            cache.marketTokenAmount = glvVault.recordTransferIn(params.addresses.market);

            if (cache.marketTokenAmount == 0) {
                revert Errors.EmptyGlvMarketAmount();
            }
        } else {
            MarketUtils.validateSwapPath(dataStore, params.addresses.longTokenSwapPath);
            MarketUtils.validateSwapPath(dataStore, params.addresses.shortTokenSwapPath);

            if (params.addresses.initialLongToken == address(0)) {
                revert Errors.InvalidGlvDepositInitialLongToken(params.addresses.initialLongToken);
            }
            if (params.addresses.initialShortToken == address(0)) {
                revert Errors.InvalidGlvDepositInitialShortToken(params.addresses.initialShortToken);
            }

            // if the initialLongToken and initialShortToken are the same, only the initialLongTokenAmount would
            // be non-zero, the initialShortTokenAmount would be zero
            cache.initialLongTokenAmount = glvVault.recordTransferIn(params.addresses.initialLongToken);
            if (params.addresses.initialShortToken != params.addresses.initialLongToken) {
                cache.initialShortTokenAmount = glvVault.recordTransferIn(params.addresses.initialShortToken);
            }
        }

        address wnt = TokenUtils.wnt(dataStore);
        if (params.addresses.initialLongToken == wnt) {
            if (cache.initialLongTokenAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(cache.initialLongTokenAmount, params.executionFee);
            }
            cache.initialLongTokenAmount -= params.executionFee;
        } else if (params.addresses.initialShortToken == wnt) {
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

        AccountUtils.validateReceiver(params.addresses.receiver);

        GlvDeposit.Props memory glvDeposit = GlvDeposit.Props(
            GlvDeposit.Addresses({
                account: account,
                glv: params.addresses.glv,
                receiver: params.addresses.receiver,
                callbackContract: params.addresses.callbackContract,
                uiFeeReceiver: params.addresses.uiFeeReceiver,
                market: params.addresses.market,
                initialLongToken: params.addresses.initialLongToken,
                initialShortToken: params.addresses.initialShortToken,
                longTokenSwapPath: params.addresses.longTokenSwapPath,
                shortTokenSwapPath: params.addresses.shortTokenSwapPath
            }),
            GlvDeposit.Numbers({
                marketTokenAmount: cache.marketTokenAmount,
                initialLongTokenAmount: cache.initialLongTokenAmount,
                initialShortTokenAmount: cache.initialShortTokenAmount,
                minGlvTokens: params.minGlvTokens,
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: params.callbackGasLimit,
                srcChainId: srcChainId
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
            params.addresses.longTokenSwapPath.length + params.addresses.shortTokenSwapPath.length,
            false // glvTokenPriceUsed. at this point we don't know if the GLV token price will be used
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
            if (glvDeposit.srcChainId() == 0) {
                params.glvVault.transferOut(
                    glvDeposit.market(),
                    glvDeposit.account(),
                    glvDeposit.marketTokenAmount(),
                    glvDeposit.shouldUnwrapNativeToken()
                );
            } else {
                params.glvVault.transferOut(
                    glvDeposit.market(),
                    address(params.multichainVault),
                    glvDeposit.marketTokenAmount(),
                    false // shouldUnwrapNativeToken
                );
                MultichainUtils.recordTransferIn(
                    params.dataStore,
                    params.eventEmitter,
                    params.multichainVault,
                    glvDeposit.market(),
                    glvDeposit.account(),
                    0 // srcChainId is the current block.chainId
                );
            }
        } else {
            if (glvDeposit.initialLongTokenAmount() > 0) {
                if (glvDeposit.srcChainId() == 0) {
                    params.glvVault.transferOut(
                        glvDeposit.initialLongToken(),
                        glvDeposit.account(),
                        glvDeposit.initialLongTokenAmount(),
                        glvDeposit.shouldUnwrapNativeToken()
                    );
                } else {
                    params.glvVault.transferOut(
                        glvDeposit.initialLongToken(),
                        address(params.multichainVault),
                        glvDeposit.initialLongTokenAmount(),
                        false // shouldUnwrapNativeToken
                    );
                    MultichainUtils.recordTransferIn(
                        params.dataStore,
                        params.eventEmitter,
                        params.multichainVault,
                        glvDeposit.initialLongToken(),
                        glvDeposit.account(),
                        0 // srcChainId is the current block.chainId
                    );
                }
            }

            if (glvDeposit.initialShortTokenAmount() > 0) {
                if (glvDeposit.srcChainId() == 0) {
                    params.glvVault.transferOut(
                        glvDeposit.initialShortToken(),
                        glvDeposit.account(),
                        glvDeposit.initialShortTokenAmount(),
                        glvDeposit.shouldUnwrapNativeToken()
                    );
                } else {
                    params.glvVault.transferOut(
                        glvDeposit.initialShortToken(),
                        address(params.multichainVault),
                        glvDeposit.initialShortTokenAmount(),
                        false // shouldUnwrapNativeToken
                    );
                    MultichainUtils.recordTransferIn(
                        params.dataStore,
                        params.eventEmitter,
                        params.multichainVault,
                        glvDeposit.initialShortToken(),
                        glvDeposit.account(),
                        0 // srcChainId is the current block.chainId
                    );
                }
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

        bool glvTokenPriceUsed = !GlvUtils.getGlvTokenPrice(params.oracle, glvDeposit.glv()).isEmpty();
        uint256 marketCount = GlvUtils.getGlvMarketCount(params.dataStore, glvDeposit.glv());
        uint256 oraclePriceCount = GasUtils.estimateGlvDepositOraclePriceCount(
            marketCount,
            glvDeposit.longTokenSwapPath().length + glvDeposit.shortTokenSwapPath().length,
            glvTokenPriceUsed
        );
        GasUtils.payExecutionFee(
            GasUtils.PayExecutionFeeContracts(
                params.dataStore,
                params.eventEmitter,
                params.multichainVault,
                params.glvVault
            ),
            params.key,
            glvDeposit.callbackContract(),
            glvDeposit.executionFee(),
            params.startingGas,
            oraclePriceCount,
            params.keeper,
            glvDeposit.receiver(),
            glvDeposit.srcChainId()
        );
    }
}
