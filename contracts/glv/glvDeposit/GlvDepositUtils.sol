// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../deposit/DepositVault.sol";
import "../../deposit/ExecuteDepositUtils.sol";
import "../../deposit/DepositUtils.sol";
import "../../data/DataStore.sol";
import "../../oracle/Oracle.sol";
import "../../market/Market.sol";
import "../../market/MarketUtils.sol";
import "../../data/Keys.sol";
import "../../event/EventUtils.sol";

import "../GlvVault.sol";
import "../GlvUtils.sol";
import "../GlvToken.sol";
import "./GlvDeposit.sol";
import "./GlvDepositEventUtils.sol";
import "./GlvDepositStoreUtils.sol";

library GlvDepositUtils {
    using GlvDeposit for GlvDeposit.Props;
    using Deposit for Deposit.Props;
    using SafeCast for int256;
    using SafeCast for uint256;
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
        uint256 executionFee;
        uint256 callbackGasLimit;
        bool shouldUnwrapNativeToken;
        bool isMarketTokenDeposit;
    }

    struct CreateGlvDepositCache {
        uint256 marketTokenAmount;
        uint256 initialLongTokenAmount;
        uint256 initialShortTokenAmount;
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
        Market.Props market;
        int256 marketTokenPrice;
        uint256 requestExpirationTime;
        uint256 maxOracleTimestamp;
        uint256 receivedMarketTokens;
        uint256 mintAmount;
        uint256 receivedUsd;
        uint256 marketCount;
        uint256 oraclePriceCount;
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
        GlvUtils.validateMarket(dataStore, params.glv, params.market, true);

        MarketUtils.validateEnabledMarket(dataStore, params.market);
        MarketUtils.validateSwapPath(dataStore, params.longTokenSwapPath);
        MarketUtils.validateSwapPath(dataStore, params.shortTokenSwapPath);

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
            if (params.initialLongToken == address(0)) {
                revert Errors.InvalidGlvDepositInitialLongToken(params.initialLongToken);
            }

            // if the initialLongToken and initialShortToken are the same, only the initialLongTokenAmount would
            // be non-zero, the initialShortTokenAmount would be zero
            cache.initialLongTokenAmount = glvVault.recordTransferIn(params.initialLongToken);
            if (params.initialShortToken != address(0)) {
                // initialShortToken could be zero address if user deposits GM token
                cache.initialShortTokenAmount = glvVault.recordTransferIn(params.initialShortToken);
            }
        }

        address wnt = TokenUtils.wnt(dataStore);
        if (params.initialLongToken == wnt) {
            cache.initialLongTokenAmount -= params.executionFee;
        } else if (params.initialShortToken == wnt) {
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
                updatedAtBlock: Chain.currentBlockNumber(),
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: params.callbackGasLimit
            }),
            GlvDeposit.Flags({
                shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
                isMarketTokenDeposit: params.isMarketTokenDeposit
            })
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

        // should be called before any tokens are minted
        _validateFirstGlvDeposit(params, glvDeposit);

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

        // glvTokenPrice should be calculated before glv receives GM tokens
        uint256 glvTokenPrice = GlvUtils.getGlvTokenPrice(params.dataStore, params.oracle, glvDeposit.glv(), true);
        cache.receivedMarketTokens = _processMarketDeposit(params, glvDeposit, params.glvVault);
        (cache.mintAmount, cache.receivedUsd) = _getMintAmount(
            params.dataStore,
            params.oracle,
            glvDeposit,
            cache.receivedMarketTokens,
            glvTokenPrice
        );

        if (cache.mintAmount < glvDeposit.minGlvTokens()) {
            revert Errors.MinMarketTokens(cache.mintAmount, glvDeposit.minGlvTokens());
        }

        GlvToken(payable(glvDeposit.glv())).mint(glvDeposit.receiver(), cache.mintAmount);

        cache.market = MarketUtils.getEnabledMarket(params.dataStore, glvDeposit.market());
        (cache.marketTokenPrice, ) = MarketUtils.getMarketTokenPrice(
            params.dataStore,
            cache.market,
            params.oracle.getPrimaryPrice(cache.market.indexToken),
            params.oracle.getPrimaryPrice(cache.market.longToken),
            params.oracle.getPrimaryPrice(cache.market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true // maximize
        );

        GlvUtils.validateGlvMarketTokenBalance(
            params.dataStore,
            glvDeposit.glv(),
            cache.market,
            cache.marketTokenPrice
        );

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

    function _validateFirstGlvDeposit(
        ExecuteGlvDepositParams memory params,
        GlvDeposit.Props memory glvDeposit
    ) internal view {
        address glv = glvDeposit.glv();
        uint256 initialGlvTokenSupply = GlvToken(payable(glv)).totalSupply();

        // return if this is not the first glv deposit
        if (initialGlvTokenSupply != 0) {
            return;
        }

        uint256 minGlvTokens = params.dataStore.getUint(Keys.minGlvTokensForFirstGlvDepositKey(glv));

        // return if there is no minGlvTokens requirement
        if (minGlvTokens == 0) {
            return;
        }

        if (glvDeposit.receiver() != RECEIVER_FOR_FIRST_GLV_DEPOSIT) {
            revert Errors.InvalidReceiverForFirstGlvDeposit(glvDeposit.receiver(), RECEIVER_FOR_FIRST_GLV_DEPOSIT);
        }

        if (glvDeposit.minGlvTokens() < minGlvTokens) {
            revert Errors.InvalidMinGlvTokensForFirstGlvDeposit(glvDeposit.minGlvTokens(), minGlvTokens);
        }
    }

    function _getMintAmount(
        DataStore dataStore,
        Oracle oracle,
        GlvDeposit.Props memory glvDeposit,
        uint256 receivedMarketTokens,
        uint256 glvTokenPrice
    ) internal view returns (uint256 glvTokenAmount, uint256 usdValue) {
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
        return (
            Precision.mulDiv(receivedMarketTokensUsd, Precision.WEI_PRECISION, glvTokenPrice),
            receivedMarketTokensUsd
        );
    }

    function _processMarketDeposit(
        ExecuteGlvDepositParams memory params,
        GlvDeposit.Props memory glvDeposit,
        GlvVault glvVault
    ) private returns (uint256) {
        if (glvDeposit.isMarketTokenDeposit()) {
            // user deposited GM tokens
            glvVault.transferOut(glvDeposit.market(), glvDeposit.glv(), glvDeposit.marketTokenAmount());
            return glvDeposit.initialLongTokenAmount();
        }

        Deposit.Props memory deposit = Deposit.Props(
            Deposit.Addresses({
                account: glvDeposit.glv(),
                receiver: glvDeposit.glv(),
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
        GlvDepositStoreUtils.remove(dataStore, key, glvDeposit.account());

        if (glvDeposit.marketTokenAmount() > 0) {
            glvVault.transferOut(
                glvDeposit.market(),
                glvDeposit.account(),
                glvDeposit.marketTokenAmount(),
                glvDeposit.shouldUnwrapNativeToken()
            );
        }

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
