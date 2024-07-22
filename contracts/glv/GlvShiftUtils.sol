// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../gas/GasUtils.sol";
import "../nonce/NonceUtils.sol";
import "../bank/Bank.sol";

import "../event/EventEmitter.sol";
import "../shift/ShiftUtils.sol";
// import "../shift/ShiftVault.sol";
// import "../exchange/IShiftHandler.sol";
import "./GlvUtils.sol";
import "./GlvVault.sol";
import "./GlvShiftStoreUtils.sol";
import "./GlvShiftEventUtils.sol";
import "./GlvShift.sol";

library GlvShiftUtils {
    using GlvShift for GlvShift.Props;
    using SafeCast for int256;
    using SafeCast for uint256;

    struct CreateGlvShiftParams {
        address glv;
        address fromMarket;
        address toMarket;
        uint256 marketTokenAmount;
        uint256 minMarketTokens;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    struct CreateGlvShiftCache {
        Market.Props fromMarket;
        Market.Props toMarket;
        int256 toMarketTokenPrice;
        uint256 fromMarketTokenBalance;
        uint256 estimatedGasLimit;
        uint256 oraclePriceCount;
        bytes32 key;
    }

    struct ExecuteGlvShiftParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        Oracle oracle;
        ShiftVault shiftVault;
        bytes32 key;
        address keeper;
        uint256 startingGas;
    }

    struct ExecuteGlvShiftCache {
        Market.Props fromMarket;
        int256 fromMarketTokenPrice;
        uint256 marketTokensUsd;
        Market.Props toMarket;
        int256 toMarketTokenPrice;
        uint256 receivedMarketTokens;
        uint256 receivedMarketTokensUsd;
    }

    function createGlvShift(
        DataStore dataStore,
        EventEmitter eventEmitter,
        GlvVault glvVault,
        CreateGlvShiftParams memory params
    ) external returns (bytes32) {
        GlvUtils.validateGlv(dataStore, params.glv);
        GlvUtils.validateMarket(dataStore, params.glv, params.fromMarket, false);
        GlvUtils.validateMarket(dataStore, params.glv, params.toMarket, true);

        if (params.fromMarket == params.toMarket) {
            revert Errors.GlvShiftFromAndToMarketAreEqual(params.fromMarket);
        }

        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = glvVault.recordTransferIn(wnt);

        if (wntAmount < params.executionFee) {
            revert Errors.InsufficientWntAmount(wntAmount, params.executionFee);
        }

        uint256 fromMarketTokenBalance = ERC20(params.fromMarket).balanceOf(params.glv);
        if (fromMarketTokenBalance < params.marketTokenAmount) {
            revert Errors.GlvInsufficientMarketTokenBalance(
                params.glv,
                params.fromMarket,
                fromMarketTokenBalance,
                params.marketTokenAmount
            );
        }

        params.executionFee = wntAmount;

        Market.Props memory fromMarket = MarketUtils.getEnabledMarket(dataStore, params.fromMarket);
        Market.Props memory toMarket = MarketUtils.getEnabledMarket(dataStore, params.toMarket);

        if (fromMarket.longToken != toMarket.longToken) {
            revert Errors.LongTokensAreNotEqual(fromMarket.longToken, toMarket.longToken);
        }

        if (fromMarket.shortToken != toMarket.shortToken) {
            revert Errors.ShortTokensAreNotEqual(fromMarket.shortToken, toMarket.shortToken);
        }

        MarketUtils.validateEnabledMarket(dataStore, params.fromMarket);
        MarketUtils.validateEnabledMarket(dataStore, params.toMarket);

        GlvShift.Props memory glvShift = GlvShift.Props(
            GlvShift.Addresses({glv: params.glv, fromMarket: params.fromMarket, toMarket: params.toMarket}),
            GlvShift.Numbers({
                marketTokenAmount: params.marketTokenAmount,
                minMarketTokens: params.minMarketTokens,
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: 0
            })
        );

        CreateGlvShiftCache memory cache;

        cache.estimatedGasLimit = GasUtils.estimateExecuteGlvShiftGasLimit(dataStore);
        cache.oraclePriceCount = GasUtils.estimateGlvShiftOraclePriceCount();
        GasUtils.validateExecutionFee(dataStore, cache.estimatedGasLimit, params.executionFee, cache.oraclePriceCount);

        cache.key = NonceUtils.getNextKey(dataStore);

        GlvShiftStoreUtils.set(dataStore, cache.key, glvShift);

        GlvShiftEventUtils.emitGlvShiftCreated(eventEmitter, cache.key, glvShift);

        return cache.key;
    }

    function executeGlvShift(
        ExecuteGlvShiftParams memory params,
        GlvShift.Props memory glvShift
    ) external returns (uint256) {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        GlvShiftStoreUtils.remove(params.dataStore, params.key);

        if (glvShift.fromMarket() == address(0)) {
            revert Errors.EmptyGlvShift();
        }

        Bank(payable(glvShift.glv())).transferOut(
            glvShift.fromMarket(),
            address(params.shiftVault),
            glvShift.marketTokenAmount()
        );

        Shift.Props memory shift = Shift.Props(
            Shift.Addresses({
                account: glvShift.glv(),
                receiver: glvShift.glv(),
                callbackContract: address(0),
                uiFeeReceiver: address(this),
                fromMarket: glvShift.fromMarket(),
                toMarket: glvShift.toMarket()
            }),
            Shift.Numbers({
                minMarketTokens: glvShift.minMarketTokens(),
                marketTokenAmount: glvShift.marketTokenAmount(),
                updatedAtTime: glvShift.updatedAtTime(),
                executionFee: 0,
                callbackGasLimit: 0
            })
        );

        bytes32 shiftKey = NonceUtils.getNextKey(params.dataStore);
        params.dataStore.addBytes32(Keys.SHIFT_LIST, shiftKey);
        ShiftEventUtils.emitShiftCreated(params.eventEmitter, shiftKey, shift);

        ShiftUtils.ExecuteShiftParams memory executeShiftParams = ShiftUtils.ExecuteShiftParams({
            dataStore: params.dataStore,
            eventEmitter: params.eventEmitter,
            shiftVault: params.shiftVault,
            oracle: params.oracle,
            key: shiftKey,
            keeper: params.keeper,
            startingGas: params.startingGas
        });

        ExecuteGlvShiftCache memory cache;
        cache.receivedMarketTokens = ShiftUtils.executeShift(executeShiftParams, shift);

        GlvUtils.validateMarketTokenBalanceUsd(
            params.dataStore,
            glvShift.glv(),
            cache.toMarket,
            cache.toMarketTokenPrice.toUint256()
        );

        cache.toMarket = MarketStoreUtils.get(params.dataStore, glvShift.toMarket());
        (cache.toMarketTokenPrice, ) = MarketUtils.getMarketTokenPrice(
            params.dataStore,
            cache.toMarket,
            params.oracle.getPrimaryPrice(cache.toMarket.indexToken),
            params.oracle.getPrimaryPrice(cache.toMarket.longToken),
            params.oracle.getPrimaryPrice(cache.toMarket.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            false // maximize
        );
        cache.receivedMarketTokensUsd = Precision.mulDiv(
            cache.receivedMarketTokens,
            cache.toMarketTokenPrice.toUint256(),
            Precision.WEI_PRECISION
        );

        GlvUtils.applyDeltaToCumulativeDepositUsd(
            params.dataStore,
            params.eventEmitter,
            glvShift.glv(),
            glvShift.toMarket(),
            cache.receivedMarketTokensUsd.toInt256()
        );

        cache.fromMarket = MarketStoreUtils.get(params.dataStore, glvShift.fromMarket());
        (cache.fromMarketTokenPrice, ) = MarketUtils.getMarketTokenPrice(
            params.dataStore,
            cache.fromMarket,
            params.oracle.getPrimaryPrice(cache.fromMarket.indexToken),
            params.oracle.getPrimaryPrice(cache.fromMarket.longToken),
            params.oracle.getPrimaryPrice(cache.fromMarket.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            false // maximize
        );

        cache.marketTokensUsd = Precision.mulDiv(
            glvShift.marketTokenAmount(),
            cache.fromMarketTokenPrice.toUint256(),
            Precision.WEI_PRECISION
        );

        GlvUtils.applyDeltaToCumulativeDepositUsd(
            params.dataStore,
            params.eventEmitter,
            glvShift.glv(),
            glvShift.fromMarket(),
            -cache.marketTokensUsd.toInt256()
        );

        validatePriceImpact(params.dataStore, glvShift.glv(), cache.marketTokensUsd, cache.receivedMarketTokensUsd);

        GlvShiftEventUtils.emitGlvShiftExecuted(params.eventEmitter, params.key, cache.receivedMarketTokens);

        return cache.receivedMarketTokens;
    }

    function cancelGlvShift(
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

        GlvShift.Props memory glvShift = GlvShiftStoreUtils.get(dataStore, key);

        GlvShiftStoreUtils.remove(dataStore, key);

        GlvShiftEventUtils.emitGlvShiftCancelled(eventEmitter, key, reason, reasonBytes);

        GasUtils.payExecutionFee(
            dataStore,
            eventEmitter,
            glvVault,
            key,
            address(0),
            glvShift.executionFee(),
            startingGas,
            GasUtils.estimateGlvShiftOraclePriceCount(),
            keeper,
            keeper // refundReceiver
        );
    }

    function validatePriceImpact(
        DataStore dataStore,
        address glv,
        uint256 marketTokensUsd,
        uint256 receivedMarketTokensUsd
    ) internal view {
        if (marketTokensUsd < receivedMarketTokensUsd) {
            // price impact is positive, no need to validate it
            return;
        }

        uint256 glvMaxShiftPriceImpactFactor = dataStore.getUint(Keys.glvMaxShiftPriceImpactFactorKey(glv));
        if (glvMaxShiftPriceImpactFactor == 0) {
            return;
        }

        uint256 effectivePriceImpactFactor = Precision.toFactor(
            marketTokensUsd - receivedMarketTokensUsd,
            marketTokensUsd
        );
        if (effectivePriceImpactFactor > glvMaxShiftPriceImpactFactor) {
            revert Errors.GlvMaxShiftPriceImpactFactorExceeded(
                effectivePriceImpactFactor,
                glvMaxShiftPriceImpactFactor
            );
        }
    }
}
