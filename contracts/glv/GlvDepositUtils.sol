// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/Glv.sol";
import "../glv/GlvVault.sol";
import "../glv/GlvUtils.sol";
import "../glv/GlvDeposit.sol";
import "../glv/GlvDepositEventUtils.sol";
import "../glv/GlvDepositStoreUtils.sol";
import "../feature/FeatureUtils.sol";
import "../deposit/DepositVault.sol";
import "../deposit/ExecuteDepositUtils.sol";
import "../deposit/DepositUtils.sol";
import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";
import "../data/Keys.sol";
import "../event/EventUtils.sol";

library GlvDepositUtils {
    using GlvDeposit for GlvDeposit.Props;
    using Deposit for Deposit.Props;
    using SafeCast for int256;
    using EventUtils for EventUtils.UintItems;

    struct CreateGlvDepositParams {
        address glv;
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address initialLongToken;
        address initialShortToken;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 minGlvTokens;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    struct ExecuteGlvDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        GlvVault glvVault;
        Oracle oracle;
        bytes32 key;
        uint256 startingGas;
        address keeper;
    }

    struct ExecuteGlvDepositCache {
        uint256 requestExpirationTime;
        uint256 maxOracleTimestamp;
        uint256 receivedMarketTokens;
        uint256 mintAmount;
        uint256 marketCount;
        uint256 oraclePriceCount;
    }

    function createGlvDeposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        GlvVault glvVault,
        address account,
        CreateGlvDepositParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);
        GlvUtils.validateGlv(dataStore, params.glv);
        GlvUtils.validateMarket(dataStore, params.glv, params.market, true);

        MarketUtils.validateEnabledMarket(dataStore, params.market);
        MarketUtils.validateSwapPath(dataStore, params.longTokenSwapPath);
        MarketUtils.validateSwapPath(dataStore, params.shortTokenSwapPath);

        if (params.initialLongToken == params.market) {
            // user deposited GM tokens
            if (params.initialShortToken != address(0)) {
                revert Errors.InvalidGlvDepositInitialShortToken(params.initialLongToken, params.initialShortToken);
            }
            if (params.longTokenSwapPath.length > 0 || params.longTokenSwapPath.length > 0) {
                revert Errors.InvalidGlvDepositSwapPath(
                    params.longTokenSwapPath.length,
                    params.longTokenSwapPath.length
                );
            }
        }

        // if the initialLongToken and initialShortToken are the same, only the initialLongTokenAmount would
        // be non-zero, the initialShortTokenAmount would be zero
        uint256 initialLongTokenAmount = glvVault.recordTransferIn(params.initialLongToken);
        uint256 initialShortTokenAmount;
        if (params.initialShortToken != address(0)) {
            // initialShortToken could be zero address if user deposits GM token
            initialShortTokenAmount = glvVault.recordTransferIn(params.initialShortToken);
        }

        address wnt = TokenUtils.wnt(dataStore);
        if (params.initialLongToken == wnt) {
            initialLongTokenAmount -= params.executionFee;
        } else if (params.initialShortToken == wnt) {
            initialShortTokenAmount -= params.executionFee;
        } else {
            uint256 wntAmount = glvVault.recordTransferIn(wnt);
            if (wntAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
            }

            params.executionFee = wntAmount;
        }

        if (initialLongTokenAmount == 0 && initialShortTokenAmount == 0) {
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
                initialLongTokenAmount: initialLongTokenAmount,
                initialShortTokenAmount: initialShortTokenAmount,
                minGlvTokens: params.minGlvTokens,
                updatedAtBlock: Chain.currentBlockNumber(),
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: params.callbackGasLimit
            }),
            GlvDeposit.Flags({shouldUnwrapNativeToken: params.shouldUnwrapNativeToken})
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, params.callbackGasLimit);

        uint256 marketCount = GlvUtils.getMarketCount(dataStore, glvDeposit.glv());
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

    function executeGlvDeposit(
        ExecuteGlvDepositParams memory params,
        GlvDeposit.Props memory glvDeposit
    ) external returns (uint256) {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        GlvDepositStoreUtils.remove(params.dataStore, params.key, glvDeposit.account());

        if (glvDeposit.account() == address(0)) {
            revert Errors.EmptyGlvDeposit();
        }

        if (params.oracle.minTimestamp() < glvDeposit.updatedAtTime()) {
            revert Errors.OracleTimestampsAreSmallerThanRequired(
                params.oracle.minTimestamp(),
                glvDeposit.updatedAtTime()
            );
        }

        ExecuteGlvDepositCache memory cache;

        cache.requestExpirationTime = params.dataStore.getUint(Keys.REQUEST_EXPIRATION_TIME);
        cache.maxOracleTimestamp = params.oracle.maxTimestamp();

        if (cache.maxOracleTimestamp > glvDeposit.updatedAtTime() + cache.requestExpirationTime) {
            revert Errors.OracleTimestampsAreLargerThanRequestExpirationTime(
                cache.maxOracleTimestamp,
                glvDeposit.updatedAtTime(),
                cache.requestExpirationTime
            );
        }

        cache.receivedMarketTokens = _processMarketDeposit(params, glvDeposit);
        cache.mintAmount = _getMintAmount(params.dataStore, params.oracle, glvDeposit, cache.receivedMarketTokens);

        if (cache.mintAmount < glvDeposit.minGlvTokens()) {
            revert Errors.MinMarketTokens(cache.mintAmount, glvDeposit.minGlvTokens());
        }

        Glv(payable(glvDeposit.glv())).mint(glvDeposit.receiver(), cache.mintAmount);

        GlvDepositEventUtils.emitGlvDepositExecuted(
            params.eventEmitter,
            params.key,
            glvDeposit.account(),
            cache.mintAmount
        );

        cache.marketCount = GlvUtils.getMarketCount(params.dataStore, glvDeposit.glv());
        cache.oraclePriceCount = GasUtils.estimateGlvDepositOraclePriceCount(
            cache.marketCount,
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
            cache.oraclePriceCount,
            params.keeper,
            glvDeposit.receiver()
        );

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "receivedGlvTokens", cache.mintAmount);
        CallbackUtils.afterGlvDepositExecution(params.key, glvDeposit, eventData);

        return cache.mintAmount;
    }

    function _getMintAmount(
        DataStore dataStore,
        Oracle oracle,
        GlvDeposit.Props memory glvDeposit,
        uint256 receivedMarketTokens
    ) internal view returns (uint256) {
        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, glvDeposit.market());
        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            false // maximize
        );
        uint256 receivedMarketTokensUsd = MarketUtils.marketTokenAmountToUsd(
            receivedMarketTokens,
            poolValueInfo.poolValue.toUint256(),
            ERC20(market.marketToken).totalSupply()
        );

        Glv glv = Glv(payable(glvDeposit.glv()));
        uint256 glvValue = GlvUtils.getValue(dataStore, oracle, glv);
        uint256 glvSupply = glv.totalSupply();
        return GlvUtils.usdToGlvTokenAmount(receivedMarketTokensUsd, glvValue, glvSupply);
    }

    function _processMarketDeposit(
        ExecuteGlvDepositParams memory params,
        GlvDeposit.Props memory glvDeposit
    ) private returns (uint256) {
        if (glvDeposit.market() == glvDeposit.initialLongToken()) {
            // user deposited GM tokens
            return glvDeposit.initialLongTokenAmount();
        }

        Deposit.Props memory deposit = Deposit.Props(
            Deposit.Addresses({
                account: glvDeposit.account(),
                receiver: glvDeposit.receiver(),
                callbackContract: address(0),
                uiFeeReceiver: glvDeposit.uiFeeReceiver(),
                market: glvDeposit.market(),
                initialLongToken: glvDeposit.initialLongToken(),
                initialShortToken: glvDeposit.initialShortToken(),
                longTokenSwapPath: new address[](0),
                shortTokenSwapPath: new address[](0)
            }),
            Deposit.Numbers({
                initialLongTokenAmount: glvDeposit.initialLongTokenAmount(),
                initialShortTokenAmount: glvDeposit.initialShortTokenAmount(),
                minMarketTokens: 0,
                updatedAtBlock: 0,
                updatedAtTime: glvDeposit.updatedAtTime(),
                executionFee: 0,
                callbackGasLimit: 0
            }),
            Deposit.Flags({shouldUnwrapNativeToken: false})
        );

        bytes32 depositKey = NonceUtils.getNextKey(params.dataStore);
        params.dataStore.addBytes32(Keys.DEPOSIT_LIST, depositKey);
        DepositEventUtils.emitDepositCreated(params.eventEmitter, depositKey, deposit, DepositUtils.DepositType.Glv);

        ExecuteDepositUtils.ExecuteDepositParams memory executeDepositParams = ExecuteDepositUtils.ExecuteDepositParams(
                params.dataStore,
                params.eventEmitter,
                DepositVault(payable(params.glvVault)),
                params.oracle,
                depositKey,
                params.keeper,
                params.startingGas,
                ISwapPricingUtils.SwapPricingType.TwoStep,
                true // includeVirtualInventoryImpact
            );

        return ExecuteDepositUtils.executeDeposit(executeDepositParams, deposit);
    }

    function cancelGlvDeposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        GlvVault glvVault,
        bytes32 key,
        address keeper,
        uint256 startingGas,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        startingGas -= gasleft() / 63;

        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(dataStore, key);
        if (glvDeposit.account() == address(0)) {
            revert Errors.EmptyGlvDeposit();
        }

        if (glvDeposit.initialLongTokenAmount() == 0 && glvDeposit.initialShortTokenAmount() == 0) {
            revert Errors.EmptyGlvDepositAmounts();
        }

        GlvDepositStoreUtils.remove(dataStore, key, glvDeposit.account());

        if (glvDeposit.initialLongTokenAmount() > 0) {
            glvVault.transferOut(
                glvDeposit.initialLongToken(),
                glvDeposit.account(),
                glvDeposit.initialLongTokenAmount(),
                glvDeposit.shouldUnwrapNativeToken()
            );
        }

        if (glvDeposit.initialShortTokenAmount() > 0) {
            glvVault.transferOut(
                glvDeposit.initialShortToken(),
                glvDeposit.account(),
                glvDeposit.initialShortTokenAmount(),
                glvDeposit.shouldUnwrapNativeToken()
            );
        }

        GlvDepositEventUtils.emitGlvDepositCancelled(eventEmitter, key, glvDeposit.account(), reason, reasonBytes);

        uint256 marketCount = GlvUtils.getMarketCount(dataStore, glvDeposit.glv());
        GasUtils.payExecutionFee(
            dataStore,
            eventEmitter,
            glvVault,
            key,
            glvDeposit.callbackContract(),
            glvDeposit.executionFee(),
            startingGas,
            GasUtils.estimateGlvDepositOraclePriceCount(
                marketCount,
                glvDeposit.longTokenSwapPath().length + glvDeposit.shortTokenSwapPath().length
            ),
            keeper,
            glvDeposit.receiver()
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterGlvDepositCancellation(key, glvDeposit, eventData);
    }
}
