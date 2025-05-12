// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../deposit/ExecuteDepositUtils.sol";

import "../../multichain/MultichainUtils.sol";

import "../../nonce/NonceUtils.sol";

import "../GlvVault.sol";
import "../GlvUtils.sol";
import "./GlvDepositEventUtils.sol";
import "./GlvDepositStoreUtils.sol";
import "./GlvDepositCalc.sol";

library ExecuteGlvDepositUtils {
    using GlvDeposit for GlvDeposit.Props;
    using Deposit for Deposit.Props;
    using SafeCast for int256;
    using EventUtils for EventUtils.UintItems;

    struct ExecuteGlvDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
        IMultichainTransferRouter multichainTransferRouter;
        GlvVault glvVault;
        Oracle oracle;
        bytes32 key;
        uint256 startingGas;
        address keeper;
    }

    struct ExecuteGlvDepositCache {
        Market.Props market;
        MarketPoolValueInfo.Props marketPoolValueInfo;
        uint256 marketTokenSupply;
        uint256 receivedMarketTokens;
        uint256 mintAmount;
        uint256 marketCount;
        uint256 oraclePriceCount;
        uint256 glvValue;
        uint256 glvSupply;
    }

    function executeGlvDeposit(
        ExecuteGlvDepositParams memory params,
        GlvDeposit.Props memory glvDeposit
    ) external returns (uint256) {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        GlvDepositStoreUtils.remove(params.dataStore, params.key, glvDeposit.account());

        // should be called before any tokens are minted
        GlvDepositCalc.validateFirstGlvDeposit(params.dataStore, glvDeposit);

        ExecuteGlvDepositCache memory cache;

        cache.receivedMarketTokens = _processMarketDeposit(params, glvDeposit, params.glvVault);

        // glvValue should be calculated after funds are deposited into GM market
        // but before GLV syncs GM token balance for glvValue to account for
        // slightly increased GM market price because of paid fees
        cache.glvValue = GlvUtils.getGlvValue(
            params.dataStore,
            params.oracle,
            glvDeposit.glv(),
            true // maximize
        );
        GlvToken(payable(glvDeposit.glv())).syncTokenBalance(glvDeposit.market());

        cache.glvSupply = GlvToken(payable(glvDeposit.glv())).totalSupply();
        cache.mintAmount = GlvDepositCalc.getMintAmount(
            params.dataStore,
            params.oracle,
            glvDeposit,
            cache.receivedMarketTokens,
            cache.glvValue,
            cache.glvSupply
        );
        if (cache.mintAmount < glvDeposit.minGlvTokens()) {
            revert Errors.MinGlvTokens(cache.mintAmount, glvDeposit.minGlvTokens());
        }

        if (glvDeposit.srcChainId() == 0) {
            GlvToken(payable(glvDeposit.glv())).mint(glvDeposit.receiver(), cache.mintAmount);
        } else {
            GlvToken(payable(glvDeposit.glv())).mint(address(params.multichainVault), cache.mintAmount);
            MultichainUtils.recordTransferIn(params.dataStore, params.eventEmitter, params.multichainVault, glvDeposit.glv(), glvDeposit.receiver(), 0); // srcChainId is the current block.chainId
        }


        cache.market = MarketUtils.getEnabledMarket(params.dataStore, glvDeposit.market());
        cache.marketPoolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            cache.market,
            params.oracle.getPrimaryPrice(cache.market.indexToken),
            params.oracle.getPrimaryPrice(cache.market.longToken),
            params.oracle.getPrimaryPrice(cache.market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true // maximize
        );
        cache.marketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(glvDeposit.market())));

        GlvUtils.validateGlvMarketTokenBalance(
            params.dataStore,
            glvDeposit.glv(),
            cache.market,
            cache.marketPoolValueInfo.poolValue.toUint256(),
            cache.marketTokenSupply
        );

        GlvDepositEventUtils.emitGlvDepositExecuted(
            params.eventEmitter,
            params.key,
            glvDeposit.account(),
            cache.mintAmount
        );

        cache.glvValue = GlvUtils.getGlvValue(
            params.dataStore,
            params.oracle,
            glvDeposit.glv(),
            true // maximize
        );
        cache.glvSupply = GlvToken(payable(glvDeposit.glv())).totalSupply();
        GlvEventUtils.emitGlvValueUpdated(params.eventEmitter, glvDeposit.glv(), cache.glvValue, cache.glvSupply);

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "receivedGlvTokens", cache.mintAmount);
        CallbackUtils.afterGlvDepositExecution(params.key, glvDeposit, eventData);

        // use glvDeposit.dataList to determine if the GLV tokens minted should be bridged out to src chain
        ExecuteDepositUtils.bridgeOutFromController(
            params.multichainTransferRouter,
            glvDeposit.receiver(), // account
            glvDeposit.srcChainId(),
            cache.market.marketToken, // token
            cache.receivedMarketTokens, // amount
            glvDeposit.dataList()
        );

        cache.marketCount = GlvUtils.getGlvMarketCount(params.dataStore, glvDeposit.glv());
        cache.oraclePriceCount = GasUtils.estimateGlvDepositOraclePriceCount(
            cache.marketCount,
            glvDeposit.longTokenSwapPath().length + glvDeposit.shortTokenSwapPath().length
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
            cache.oraclePriceCount,
            params.keeper,
            glvDeposit.receiver(),
            glvDeposit.srcChainId()
        );

        return cache.mintAmount;
    }


    function _processMarketDeposit(
        ExecuteGlvDepositParams memory params,
        GlvDeposit.Props memory glvDeposit,
        GlvVault glvVault
    ) private returns (uint256) {
        if (glvDeposit.isMarketTokenDeposit()) {
            Market.Props memory market = MarketUtils.getEnabledMarket(params.dataStore, glvDeposit.market());

            MarketUtils.MarketPrices memory marketPrices = MarketUtils.MarketPrices(
                params.oracle.getPrimaryPrice(market.indexToken),
                params.oracle.getPrimaryPrice(market.longToken),
                params.oracle.getPrimaryPrice(market.shortToken)
            );
            MarketUtils.validateMaxPnl(
                params.dataStore,
                market,
                marketPrices,
                Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
                Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS
            );

            // user deposited GM tokens
            glvVault.transferOut(glvDeposit.market(), glvDeposit.glv(), glvDeposit.marketTokenAmount());
            return glvDeposit.marketTokenAmount();
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
                longTokenSwapPath: glvDeposit.longTokenSwapPath(),
                shortTokenSwapPath: glvDeposit.shortTokenSwapPath()
            }),
            Deposit.Numbers({
                initialLongTokenAmount: glvDeposit.initialLongTokenAmount(),
                initialShortTokenAmount: glvDeposit.initialShortTokenAmount(),
                minMarketTokens: 0,
                updatedAtTime: glvDeposit.updatedAtTime(),
                executionFee: 0,
                callbackGasLimit: 0,
                srcChainId: 0 // srcChainId is the current block.chainId
            }),
            Deposit.Flags({shouldUnwrapNativeToken: false}),
            new bytes32[](0) // dataList
        );

        bytes32 depositKey = NonceUtils.getNextKey(params.dataStore);
        params.dataStore.addBytes32(Keys.DEPOSIT_LIST, depositKey);
        DepositEventUtils.emitDepositCreated(params.eventEmitter, depositKey, deposit, Deposit.DepositType.Glv);

        ExecuteDepositUtils.ExecuteDepositParams memory executeDepositParams = ExecuteDepositUtils.ExecuteDepositParams(
                params.dataStore,
                params.eventEmitter,
                params.multichainVault,
                params.multichainTransferRouter,
                DepositVault(payable(params.glvVault)),
                params.oracle,
                depositKey,
                params.keeper,
                params.startingGas,
                ISwapPricingUtils.SwapPricingType.Deposit,
                true, // includeVirtualInventoryImpact
                0 // srcChainId is the current block.chainId
            );

        uint256 receivedMarketTokens = ExecuteDepositUtils.executeDeposit(executeDepositParams, deposit);
        return receivedMarketTokens;
    }
}
