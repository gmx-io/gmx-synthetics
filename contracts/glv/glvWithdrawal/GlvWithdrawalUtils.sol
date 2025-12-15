// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../withdrawal/ExecuteWithdrawalUtils.sol";
import "../../exchange/IWithdrawalHandler.sol";

import "../../nonce/NonceUtils.sol";

import "../GlvVault.sol";
import "../GlvUtils.sol";
import "./GlvWithdrawalStoreUtils.sol";
import "./GlvWithdrawalEventUtils.sol";
import "./IGlvWithdrawalUtils.sol";

library GlvWithdrawalUtils {
    using GlvWithdrawal for GlvWithdrawal.Props;
    using SafeCast for int256;
    using SafeCast for uint256;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.AddressItems;
    using Price for Price.Props;

    struct ExecuteGlvWithdrawalParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
        IMultichainTransferRouter multichainTransferRouter;
        GlvVault glvVault;
        IOracle oracle;
        ISwapHandler swapHandler;
        IWithdrawalHandler withdrawalHandler;
        bytes32 key;
        uint256 startingGas;
        address keeper;
    }

    struct ExecuteGlvWithdrawalCache {
        uint256 glvValue;
        bool glvTokenPriceUsed;
        uint256 marketCount;
        uint256 oraclePriceCount;
        uint256 marketTokenAmount;
    }

    struct CancelGlvWithdrawalParams {
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

    function createGlvWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        GlvVault glvVault,
        address account,
        uint256 srcChainId,
        IGlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);
        GlvUtils.validateGlv(dataStore, params.addresses.glv);
        GlvUtils.validateGlvMarket(dataStore, params.addresses.glv, params.addresses.market, false);

        MarketUtils.validateEnabledMarket(dataStore, params.addresses.market);
        MarketUtils.validateSwapPath(dataStore, params.addresses.longTokenSwapPath);
        MarketUtils.validateSwapPath(dataStore, params.addresses.shortTokenSwapPath);

        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = glvVault.recordTransferIn(wnt);
        if (wntAmount < params.executionFee) {
            revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
        }
        params.executionFee = wntAmount;

        AccountUtils.validateReceiver(params.addresses.receiver);

        uint256 glvTokenAmount = glvVault.recordTransferIn(params.addresses.glv);

        if (glvTokenAmount == 0) {
            revert Errors.EmptyGlvWithdrawalAmount();
        }

        GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawal.Props(
            GlvWithdrawal.Addresses({
                account: account,
                glv: params.addresses.glv,
                receiver: params.addresses.receiver,
                callbackContract: params.addresses.callbackContract,
                uiFeeReceiver: params.addresses.uiFeeReceiver,
                market: params.addresses.market,
                longTokenSwapPath: params.addresses.longTokenSwapPath,
                shortTokenSwapPath: params.addresses.shortTokenSwapPath
            }),
            GlvWithdrawal.Numbers({
                glvTokenAmount: glvTokenAmount,
                minLongTokenAmount: params.minLongTokenAmount,
                minShortTokenAmount: params.minShortTokenAmount,
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: params.callbackGasLimit,
                srcChainId: srcChainId
            }),
            GlvWithdrawal.Flags({shouldUnwrapNativeToken: params.shouldUnwrapNativeToken}),
            params.dataList
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, params.callbackGasLimit);

        uint256 marketCount = GlvUtils.getGlvMarketCount(dataStore, glvWithdrawal.glv());
        GasUtils.validateExecutionFee(
            dataStore,
            GasUtils.estimateExecuteGlvWithdrawalGasLimit(dataStore, glvWithdrawal, marketCount), // estimatedGasLimit
            params.executionFee,
            GasUtils.estimateGlvWithdrawalOraclePriceCount(
                marketCount,
                params.addresses.longTokenSwapPath.length + params.addresses.shortTokenSwapPath.length,
                false // glvTokenPriceUsed. at this point we don't know if the GLV token price will be used
            ) // oraclePriceCount
        );

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

        ExecuteGlvWithdrawalCache memory cache;
        cache.marketTokenAmount = _getMarketTokenAmount(params.dataStore, params.oracle, glvWithdrawal);

        // burn GLV tokens before executing withdrawal
        // for both GLV amount and token amounts will be correct inside the receive() function
        // if receiver is a contract
        GlvToken(payable(glvWithdrawal.glv())).burn(address(params.glvVault), glvWithdrawal.glvTokenAmount());
        params.glvVault.syncTokenBalance(glvWithdrawal.glv());

        IExecuteWithdrawalUtils.ExecuteWithdrawalResult memory withdrawalResult = _processMarketWithdrawal(
            params,
            glvWithdrawal,
            cache.marketTokenAmount
        );

        GlvWithdrawalEventUtils.emitGlvWithdrawalExecuted(params.eventEmitter, params.key, glvWithdrawal.account());

        (cache.glvValue, cache.glvTokenPriceUsed) = GlvUtils.getGlvValue(
            params.dataStore,
            params.oracle,
            glvWithdrawal.glv(),
            true // maximize
        );
        GlvEventUtils.emitGlvValueUpdated(
            params.eventEmitter,
            glvWithdrawal.glv(),
            cache.glvValue,
            GlvToken(payable(glvWithdrawal.glv())).totalSupply()
        );

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "outputToken", withdrawalResult.outputToken);
        eventData.addressItems.setItem(1, "secondaryOutputToken", withdrawalResult.secondaryOutputToken);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "outputAmount", withdrawalResult.outputAmount);
        eventData.uintItems.setItem(1, "secondaryOutputAmount", withdrawalResult.secondaryOutputAmount);
        CallbackUtils.afterGlvWithdrawalExecution(params.key, glvWithdrawal, eventData);


        BridgeOutFromControllerUtils.bridgeOutFromController(
            params.eventEmitter,
            params.multichainTransferRouter,
            BridgeOutFromControllerUtils.BridgeOutFromControllerParams({
                account: glvWithdrawal.account(), // account
                receiver: glvWithdrawal.receiver(), // receiver
                srcChainId: glvWithdrawal.srcChainId(),
                token: withdrawalResult.outputToken, // token
                amount: withdrawalResult.outputAmount, // amount
                secondaryToken: withdrawalResult.secondaryOutputToken, // secondaryToken
                secondaryAmount: withdrawalResult.secondaryOutputAmount, // secondaryAmount
                dataList: glvWithdrawal.dataList()
            })
        );

        cache.marketCount = GlvUtils.getGlvMarketCount(params.dataStore, glvWithdrawal.glv());
        cache.oraclePriceCount = GasUtils.estimateGlvWithdrawalOraclePriceCount(
            cache.marketCount,
            glvWithdrawal.longTokenSwapPath().length + glvWithdrawal.shortTokenSwapPath().length,
            cache.glvTokenPriceUsed
        );

        GasUtils.payExecutionFee(
            GasUtils.PayExecutionFeeContracts(
                params.dataStore,
                params.eventEmitter,
                params.multichainVault,
                params.glvVault
            ),
            params.key,
            glvWithdrawal.callbackContract(),
            glvWithdrawal.executionFee(),
            params.startingGas,
            cache.oraclePriceCount,
            params.keeper,
            glvWithdrawal.receiver(),
            glvWithdrawal.srcChainId()
        );
    }

    function _processMarketWithdrawal(
        ExecuteGlvWithdrawalParams memory params,
        GlvWithdrawal.Props memory glvWithdrawal,
        uint256 marketTokenAmount
    ) private returns (IExecuteWithdrawalUtils.ExecuteWithdrawalResult memory) {

        // srcChainId should be glvWithdrawal.srcChainId so that the withdrawn funds
        // are sent to the appropriate balance either the user's wallet balance
        // or the user's multichain balance
        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            Withdrawal.Addresses({
                account: glvWithdrawal.glv(),
                receiver: glvWithdrawal.receiver(),
                callbackContract: address(0),
                uiFeeReceiver: glvWithdrawal.uiFeeReceiver(),
                market: glvWithdrawal.market(),
                longTokenSwapPath: glvWithdrawal.longTokenSwapPath(),
                shortTokenSwapPath: glvWithdrawal.shortTokenSwapPath()
            }),
            Withdrawal.Numbers({
                minLongTokenAmount: glvWithdrawal.minLongTokenAmount(),
                minShortTokenAmount: glvWithdrawal.minShortTokenAmount(),
                marketTokenAmount: marketTokenAmount,
                updatedAtTime: glvWithdrawal.updatedAtTime(),
                executionFee: 0,
                callbackGasLimit: 0,
                srcChainId: glvWithdrawal.srcChainId()
            }),
            Withdrawal.Flags({shouldUnwrapNativeToken: glvWithdrawal.shouldUnwrapNativeToken()}),
            new bytes32[](0)
        );

        bytes32 withdrawalKey = keccak256(abi.encode(params.key, "withdrawal"));
        WithdrawalEventUtils.emitWithdrawalCreated(
            params.eventEmitter,
            withdrawalKey,
            withdrawal,
            Withdrawal.WithdrawalType.Glv
        );

        Bank(payable(glvWithdrawal.glv())).transferOut(
            glvWithdrawal.market(),
            address(params.glvVault),
            marketTokenAmount
        );
        params.glvVault.syncTokenBalance(glvWithdrawal.market());

        IExecuteWithdrawalUtils.ExecuteWithdrawalParams memory executeWithdrawalParams = IExecuteWithdrawalUtils
            .ExecuteWithdrawalParams({
                dataStore: params.dataStore,
                eventEmitter: params.eventEmitter,
                multichainVault: params.multichainVault,
                multichainTransferRouter: params.multichainTransferRouter,
                withdrawalVault: WithdrawalVault(payable(params.glvVault)),
                oracle: params.oracle,
                swapHandler: params.swapHandler,
                key: withdrawalKey,
                keeper: params.keeper,
                startingGas: params.startingGas,
                swapPricingType: ISwapPricingUtils.SwapPricingType.Withdrawal
            });

        return params.withdrawalHandler.executeWithdrawalFromController(executeWithdrawalParams, withdrawal);
    }

    function _getMarketTokenAmount(
        DataStore dataStore,
        IOracle oracle,
        GlvWithdrawal.Props memory glvWithdrawal
    ) internal view returns (uint256) {
        (uint256 glvValue, ) = GlvUtils.getGlvValue(
            dataStore,
            oracle,
            glvWithdrawal.glv(),
            false // maximize
        );
        uint256 glvSupply = GlvToken(payable(glvWithdrawal.glv())).totalSupply();
        uint256 glvTokenUsd = GlvUtils.glvTokenAmountToUsd(glvWithdrawal.glvTokenAmount(), glvValue, glvSupply);

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
        uint256 marketTokenAmount = MarketUtils.usdToMarketTokenAmount(
            glvTokenUsd,
            poolValueInfo.poolValue.toUint256(),
            ERC20(market.marketToken).totalSupply()
        );

        return marketTokenAmount;
    }

    function cancelGlvWithdrawal(CancelGlvWithdrawalParams memory params) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawalStoreUtils.get(params.dataStore, params.key);
        GlvWithdrawalStoreUtils.remove(params.dataStore, params.key, glvWithdrawal.account());

        if (glvWithdrawal.srcChainId() == 0) {
            params.glvVault.transferOut(
                glvWithdrawal.glv(),
                glvWithdrawal.account(),
                glvWithdrawal.glvTokenAmount(),
                false // shouldUnwrapNativeToken
            );
        } else {
            params.glvVault.transferOut(
                glvWithdrawal.glv(),
                address(params.multichainVault),
                glvWithdrawal.glvTokenAmount(),
                false // shouldUnwrapNativeToken
            );
            MultichainUtils.recordTransferIn(
                params.dataStore,
                params.eventEmitter,
                params.multichainVault,
                glvWithdrawal.glv(),
                glvWithdrawal.account(),
                0 // srcChainId is the current block.chainId
            );
        }

        GlvWithdrawalEventUtils.emitGlvWithdrawalCancelled(
            params.eventEmitter,
            params.key,
            glvWithdrawal.account(),
            params.reason,
            params.reasonBytes
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterGlvWithdrawalCancellation(params.key, glvWithdrawal, eventData);

        uint256 marketCount = GlvUtils.getGlvMarketCount(params.dataStore, glvWithdrawal.glv());
        bool glvTokenPriceUsed = !GlvUtils.getGlvTokenPrice(params.oracle, glvWithdrawal.glv()).isEmpty();
        GasUtils.payExecutionFee(
            GasUtils.PayExecutionFeeContracts(
                params.dataStore,
                params.eventEmitter,
                params.multichainVault,
                params.glvVault
            ),
            params.key,
            glvWithdrawal.callbackContract(),
            glvWithdrawal.executionFee(),
            params.startingGas,
            GasUtils.estimateGlvWithdrawalOraclePriceCount(
                marketCount,
                glvWithdrawal.longTokenSwapPath().length + glvWithdrawal.shortTokenSwapPath().length,
                glvTokenPriceUsed
            ),
            params.keeper,
            glvWithdrawal.receiver(),
            glvWithdrawal.srcChainId()
        );
    }
}
