// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../oracle/Oracle.sol";
import "../../market/Market.sol";
import "../../market/MarketUtils.sol";
import "../../withdrawal/ExecuteWithdrawalUtils.sol";
import "../../withdrawal/WithdrawalEventUtils.sol";
import "../../withdrawal/WithdrawalUtils.sol";
import "../../data/Keys.sol";
import "../../event/EventUtils.sol";
import "../../callback/CallbackUtils.sol";
import "../../gas/GasUtils.sol";
import "../../nonce/NonceUtils.sol";
import "../GlvVault.sol";
import "../GlvUtils.sol";
import "../GlvToken.sol";
import "./GlvWithdrawal.sol";
import "./GlvWithdrawalStoreUtils.sol";
import "./GlvWithdrawalEventUtils.sol";

library GlvWithdrawalUtils {
    using GlvWithdrawal for GlvWithdrawal.Props;
    using SafeCast for int256;
    using SafeCast for uint256;
    using EventUtils for EventUtils.UintItems;

    struct CreateGlvWithdrawalParams {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address glv;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    struct ExecuteGlvWithdrawalParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        GlvVault glvVault;
        Oracle oracle;
        bytes32 key;
        uint256 startingGas;
        address keeper;
    }

    struct ExecuteGlvWithdrawalCache {
        uint256 requestExpirationTime;
        uint256 maxOracleTimestamp;
        uint256 marketTokenAmount;
        uint256 marketCount;
        uint256 oraclePriceCount;
    }

    function createGlvWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        GlvVault glvVault,
        address account,
        CreateGlvWithdrawalParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);
        GlvUtils.validateGlv(dataStore, params.glv);
        GlvUtils.validateMarket(dataStore, params.glv, params.market, true);

        MarketUtils.validateEnabledMarket(dataStore, params.market);
        MarketUtils.validateSwapPath(dataStore, params.longTokenSwapPath);
        MarketUtils.validateSwapPath(dataStore, params.shortTokenSwapPath);

        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = glvVault.recordTransferIn(wnt);
        if (wntAmount < params.executionFee) {
            revert Errors.InsufficientWntAmount(wntAmount, params.executionFee);
        }

        AccountUtils.validateReceiver(params.receiver);

        uint256 glvTokenAmount = glvVault.recordTransferIn(params.glv);

        if (glvTokenAmount == 0) {
            revert Errors.EmptyGlvWithdrawalAmount();
        }

        GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawal.Props(
            GlvWithdrawal.Addresses({
                account: account,
                glv: params.glv,
                receiver: params.receiver,
                callbackContract: params.callbackContract,
                uiFeeReceiver: params.uiFeeReceiver,
                market: params.market,
                longTokenSwapPath: params.longTokenSwapPath,
                shortTokenSwapPath: params.shortTokenSwapPath
            }),
            GlvWithdrawal.Numbers({
                glvTokenAmount: glvTokenAmount,
                minLongTokenAmount: params.minLongTokenAmount,
                minShortTokenAmount: params.minShortTokenAmount,
                updatedAtBlock: Chain.currentBlockNumber(),
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: params.callbackGasLimit
            }),
            GlvWithdrawal.Flags({shouldUnwrapNativeToken: params.shouldUnwrapNativeToken})
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, params.callbackGasLimit);

        uint256 marketCount = GlvUtils.getMarketCount(dataStore, glvWithdrawal.glv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteGlvWithdrawalGasLimit(
            dataStore,
            glvWithdrawal,
            marketCount
        );
        uint256 oraclePriceCount = GasUtils.estimateGlvWithdrawalOraclePriceCount(
            marketCount,
            params.longTokenSwapPath.length + params.shortTokenSwapPath.length
        );
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee, oraclePriceCount);

        bytes32 key = NonceUtils.getNextKey(dataStore);

        GlvWithdrawalStoreUtils.set(dataStore, key, glvWithdrawal);

        GlvWithdrawalEventUtils.emitGlvWithdrawalCreated(eventEmitter, key, glvWithdrawal);

        return key;
    }

    function executeGlvWithdrawal(
        ExecuteGlvWithdrawalParams memory params,
        GlvWithdrawal.Props memory glvWithdrawal
    ) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        GlvWithdrawalStoreUtils.remove(params.dataStore, params.key, glvWithdrawal.account());

        if (glvWithdrawal.account() == address(0)) {
            revert Errors.EmptyGlvWithdrawal();
        }

        if (params.oracle.minTimestamp() < glvWithdrawal.updatedAtTime()) {
            revert Errors.OracleTimestampsAreSmallerThanRequired(
                params.oracle.minTimestamp(),
                glvWithdrawal.updatedAtTime()
            );
        }

        ExecuteGlvWithdrawalCache memory cache;

        cache.requestExpirationTime = params.dataStore.getUint(Keys.REQUEST_EXPIRATION_TIME);
        cache.maxOracleTimestamp = params.oracle.maxTimestamp();

        if (cache.maxOracleTimestamp > glvWithdrawal.updatedAtTime() + cache.requestExpirationTime) {
            revert Errors.OracleTimestampsAreLargerThanRequestExpirationTime(
                cache.maxOracleTimestamp,
                glvWithdrawal.updatedAtTime(),
                cache.requestExpirationTime
            );
        }

        uint256 usdValue = _processMarketWithdrawal(params, glvWithdrawal);

        GlvUtils.applyDeltaToCumulativeDepositUsd(
            params.dataStore,
            params.eventEmitter,
            glvWithdrawal.glv(),
            glvWithdrawal.market(),
            -usdValue.toInt256()
        );

        GlvToken(payable(glvWithdrawal.glv())).mint(glvWithdrawal.receiver(), cache.marketTokenAmount);

        GlvWithdrawalEventUtils.emitGlvWithdrawalExecuted(params.eventEmitter, params.key, glvWithdrawal.account());

        cache.marketCount = GlvUtils.getMarketCount(params.dataStore, glvWithdrawal.glv());
        cache.oraclePriceCount = GasUtils.estimateGlvWithdrawalOraclePriceCount(
            cache.marketCount,
            glvWithdrawal.longTokenSwapPath().length + glvWithdrawal.shortTokenSwapPath().length
        );
        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
            params.glvVault,
            params.key,
            glvWithdrawal.callbackContract(),
            glvWithdrawal.executionFee(),
            params.startingGas,
            cache.oraclePriceCount,
            params.keeper,
            glvWithdrawal.receiver()
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterGlvWithdrawalExecution(params.key, glvWithdrawal, eventData);
    }

    function _processMarketWithdrawal(
        ExecuteGlvWithdrawalParams memory params,
        GlvWithdrawal.Props memory glvWithdrawal
    ) private returns (uint256) {
        (uint256 marketTokenAmount, uint256 usdValue) = _getMarketTokenAmount(
            params.dataStore,
            params.oracle,
            glvWithdrawal
        );

        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            Withdrawal.Addresses({
                account: glvWithdrawal.account(),
                receiver: glvWithdrawal.receiver(),
                callbackContract: address(0),
                uiFeeReceiver: glvWithdrawal.uiFeeReceiver(),
                market: glvWithdrawal.market(),
                longTokenSwapPath: new address[](0),
                shortTokenSwapPath: new address[](0)
            }),
            Withdrawal.Numbers({
                minLongTokenAmount: glvWithdrawal.minLongTokenAmount(),
                minShortTokenAmount: glvWithdrawal.minShortTokenAmount(),
                marketTokenAmount: marketTokenAmount,
                updatedAtBlock: 0,
                updatedAtTime: glvWithdrawal.updatedAtTime(),
                executionFee: 0,
                callbackGasLimit: 0
            }),
            Withdrawal.Flags({shouldUnwrapNativeToken: false})
        );

        bytes32 withdrawalKey = NonceUtils.getNextKey(params.dataStore);
        params.dataStore.addBytes32(Keys.WITHDRAWAL_LIST, withdrawalKey);
        WithdrawalEventUtils.emitWithdrawalCreated(
            params.eventEmitter,
            withdrawalKey,
            withdrawal,
            WithdrawalUtils.WithdrawalType.Glv
        );

        Bank(payable(glvWithdrawal.glv())).transferOut(
            glvWithdrawal.market(),
            address(params.glvVault),
            marketTokenAmount
        );

        ExecuteWithdrawalUtils.ExecuteWithdrawalParams memory executeWithdrawalParams = ExecuteWithdrawalUtils
            .ExecuteWithdrawalParams({
                dataStore: params.dataStore,
                eventEmitter: params.eventEmitter,
                withdrawalVault: WithdrawalVault(payable(params.glvVault)),
                oracle: params.oracle,
                key: withdrawalKey,
                keeper: params.keeper,
                startingGas: params.startingGas,
                swapPricingType: ISwapPricingUtils.SwapPricingType.TwoStep
            });

        ExecuteWithdrawalUtils.executeWithdrawal(executeWithdrawalParams, withdrawal);

        return usdValue;
    }

    function _getMarketTokenAmount(
        DataStore dataStore,
        Oracle oracle,
        GlvWithdrawal.Props memory glvWithdrawal
    ) internal view returns (uint256 marketTokenAmount, uint256 usdValue) {
        uint256 glvTokenPrice = GlvUtils.getGlvTokenPrice(dataStore, oracle, glvWithdrawal.glv(), false);
        uint256 glvTokenUsd = glvWithdrawal.glvTokenAmount() * glvTokenPrice;

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, glvWithdrawal.market());
        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            true // maximize
        );
        marketTokenAmount = MarketUtils.usdToMarketTokenAmount(
            glvTokenUsd,
            poolValueInfo.poolValue.toUint256(),
            ERC20(market.marketToken).totalSupply()
        );

        return (marketTokenAmount, glvTokenUsd);
    }

    function cancelGlvWithdrawal(
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

        GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawalStoreUtils.get(dataStore, key);
        if (glvWithdrawal.glvTokenAmount() == 0) {
            revert Errors.EmptyGlvWithdrawalAmount();
        }

        GlvWithdrawalStoreUtils.remove(dataStore, key, glvWithdrawal.account());

        glvVault.transferOut(
            glvWithdrawal.glv(),
            glvWithdrawal.account(),
            glvWithdrawal.glvTokenAmount(),
            false // shouldUnwrapNativeToken
        );

        GlvWithdrawalEventUtils.emitGlvWithdrawalCancelled(
            eventEmitter,
            key,
            glvWithdrawal.account(),
            reason,
            reasonBytes
        );

        uint256 marketCount = GlvUtils.getMarketCount(dataStore, glvWithdrawal.glv());
        GasUtils.payExecutionFee(
            dataStore,
            eventEmitter,
            glvVault,
            key,
            glvWithdrawal.callbackContract(),
            glvWithdrawal.executionFee(),
            startingGas,
            GasUtils.estimateGlvWithdrawalOraclePriceCount(
                marketCount,
                glvWithdrawal.longTokenSwapPath().length + glvWithdrawal.shortTokenSwapPath().length
            ),
            keeper,
            glvWithdrawal.receiver()
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterGlvWithdrawalCancellation(key, glvWithdrawal, eventData);
    }
}
