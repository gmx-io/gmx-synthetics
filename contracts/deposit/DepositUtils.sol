// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "./DepositStore.sol";
import "../market/MarketStore.sol";

import "../nonce/NonceUtils.sol";
import "../pricing/SwapPricingUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";
import "../utils/Null.sol";

// @title DepositUtils
// @dev Library for deposit functions, to help with the depositing of liquidity
// into a market in return for market tokens
library DepositUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Array for uint256[];

    using Price for Price.Props;

    // @dev CreateDepositParams struct used in createDeposit to avoid stack
    // too deep errors
    //
    // @param receiver the address to send the market tokens to
    // @param callbackContract the callback contract
    // @param market the market to deposit into
    // @param minMarketTokens the minimum acceptable number of liquidity tokens
    // @param shouldUnwrapNativeToken whether to unwrap the native token when
    // sending funds back to the user in case the deposit gets cancelled
    // @param executionFee the execution fee
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

    // @dev ExecuteDepositParams struct used in executeDeposit to avoid stack
    // too deep errors
    //
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param depositStore DepositStore
    // @param marketStore MarketStore
    // @param oracle Oracle
    // @param feeReceiver FeeReceiver
    // @param key the key of the deposit to execute
    // @param oracleBlockNumbers the oracle block numbers for the prices in oracle
    // @param keeper the address of the keeper executing the deposit
    // @param startingGas the starting amount of gas
    struct ExecuteDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        DepositStore depositStore;
        MarketStore marketStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        bytes32 key;
        uint256[] oracleBlockNumbers;
        address keeper;
        uint256 startingGas;
    }

    // @dev _ExecuteDepositParams struct used in executeDeposit to avoid stack
    // too deep errors
    //
    // @param market the market to deposit into
    // @param account the depositing account
    // @param receiver the account to send the market tokens to
    // @param tokenIn the token to deposit, either the market.longToken or
    // market.shortToken
    // @param tokenOut the other token, if tokenIn is market.longToken then
    // tokenOut is market.shortToken and vice versa
    // @param tokenInPrice price of tokenIn
    // @param tokenOutPrice price of tokenOut
    // @param amount amount of tokenIn
    // @param priceImpactUsd price impact in USD
    struct _ExecuteDepositParams {
        Market.Props market;
        address account;
        address receiver;
        address tokenIn;
        address tokenOut;
        Price.Props tokenInPrice;
        Price.Props tokenOutPrice;
        uint256 amount;
        int256 priceImpactUsd;
    }

    error MinMarketTokens(uint256 received, uint256 expected);

    // @dev creates a deposit in the depositStore
    //
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param depositStore DepositStore
    // @param marketStore MarketStore
    // @param account the depositing account
    // @param params CreateDepositParams
    function createDeposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        DepositStore depositStore,
        MarketStore marketStore,
        address account,
        CreateDepositParams memory params
    ) internal returns (bytes32) {
        Market.Props memory market = marketStore.get(params.market);
        MarketUtils.validateNonEmptyMarket(market);

        uint256 longTokenAmount = depositStore.recordTransferIn(market.longToken);
        uint256 shortTokenAmount = depositStore.recordTransferIn(market.shortToken);

        address wnt = TokenUtils.wnt(dataStore);

        if (market.longToken == wnt) {
            longTokenAmount -= params.executionFee;
        } else if (market.shortToken == wnt) {
            shortTokenAmount -= params.executionFee;
        } else {
            uint256 wntAmount = depositStore.recordTransferIn(wnt);
            require(wntAmount == params.executionFee, "DepositUtils: invalid wntAmount");
        }

        Deposit.Props memory deposit = Deposit.Props(
            account,
            params.receiver,
            params.callbackContract,
            market.marketToken,
            longTokenAmount,
            shortTokenAmount,
            params.minMarketTokens,
            Chain.currentBlockNumber(),
            params.shouldUnwrapNativeToken,
            params.executionFee,
            params.callbackGasLimit,
            Null.BYTES
        );

        uint256 estimatedGasLimit = GasUtils.estimateExecuteDepositGasLimit(dataStore, deposit);
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee);

        bytes32 key = NonceUtils.getNextKey(dataStore);

        depositStore.set(key, deposit);

        eventEmitter.emitDepositCreated(key, deposit);

        return key;
    }

    // @dev executes a deposit
    // @param params ExecuteDepositParams
    function executeDeposit(ExecuteDepositParams memory params) internal {
        Deposit.Props memory deposit = params.depositStore.get(params.key);
        require(deposit.account != address(0), "DepositUtils: empty deposit");

        if (!params.oracleBlockNumbers.areEqualTo(deposit.updatedAtBlock)) {
            revert(Keys.ORACLE_ERROR);
        }

        CallbackUtils.beforeDepositExecution(params.key, deposit);

        Market.Props memory market = params.marketStore.get(deposit.market);

        Price.Props memory longTokenPrice = params.oracle.getPrimaryPrice(market.longToken);
        Price.Props memory shortTokenPrice = params.oracle.getPrimaryPrice(market.shortToken);

        uint256 longTokenUsd = deposit.longTokenAmount * longTokenPrice.midPrice();
        uint256 shortTokenUsd = deposit.shortTokenAmount * shortTokenPrice.midPrice();

        uint256 receivedMarketTokens;

        int256 priceImpactUsd = SwapPricingUtils.getPriceImpactUsd(
            SwapPricingUtils.GetPriceImpactUsdParams(
                params.dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
                longTokenPrice.midPrice(),
                shortTokenPrice.midPrice(),
                (deposit.longTokenAmount * longTokenPrice.midPrice()).toInt256(),
                (deposit.shortTokenAmount * shortTokenPrice.midPrice()).toInt256()
            )
        );

        // since tokens were recorded as transferred in during the createDeposit step
        // to save gas costs we assume that _transferOut should always correctly transfer the tokens
        // to the marketToken
        // it is possible for a token to return true even if the transfer is not entirely fulfilled
        // this should still work unless the token has custom behavior that conditionally blocks transfers
        // even if the sender has sufficient balance
        // this will not work correctly for tokens with a burn mechanism, those need to be separately handled
        if (deposit.longTokenAmount > 0) {
            params.depositStore.transferOut(params.dataStore, market.longToken, deposit.longTokenAmount, market.marketToken);

            _ExecuteDepositParams memory _params = _ExecuteDepositParams(
                market,
                deposit.account,
                deposit.receiver,
                market.longToken,
                market.shortToken,
                longTokenPrice,
                shortTokenPrice,
                deposit.longTokenAmount,
                priceImpactUsd * longTokenUsd.toInt256() / (longTokenUsd + shortTokenUsd).toInt256()
            );

            receivedMarketTokens += _executeDeposit(params, _params);
        }

        if (deposit.shortTokenAmount > 0) {
            params.depositStore.transferOut(params.dataStore, market.shortToken, deposit.shortTokenAmount, market.marketToken);

            _ExecuteDepositParams memory _params = _ExecuteDepositParams(
                market,
                deposit.account,
                deposit.receiver,
                market.shortToken,
                market.longToken,
                shortTokenPrice,
                longTokenPrice,
                deposit.shortTokenAmount,
                priceImpactUsd * shortTokenUsd.toInt256() / (longTokenUsd + shortTokenUsd).toInt256()
            );

            receivedMarketTokens += _executeDeposit(params, _params);
        }

        if (receivedMarketTokens < deposit.minMarketTokens) {
            revert MinMarketTokens(receivedMarketTokens, deposit.minMarketTokens);
        }

        params.depositStore.remove(params.key);

        params.eventEmitter.emitDepositExecuted(params.key);

        CallbackUtils.afterDepositExecution(params.key, deposit);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.depositStore,
            deposit.executionFee,
            params.startingGas,
            params.keeper,
            deposit.account
        );
    }

    // @dev cancels a deposit, funds are sent back to the user
    //
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param depositStore DepositStore
    // @param marketStore MarketStore
    // @param key the key of the deposit to cancel
    // @param keeper the address of the keeper
    // @param startingGas the starting gas amount
    function cancelDeposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        DepositStore depositStore,
        MarketStore marketStore,
        bytes32 key,
        address keeper,
        uint256 startingGas
    ) internal {
        Deposit.Props memory deposit = depositStore.get(key);
        require(deposit.account != address(0), "DepositUtils: empty deposit");

        Market.Props memory market = marketStore.get(deposit.market);
        if (deposit.longTokenAmount > 0) {
            depositStore.transferOut(
                dataStore,
                market.longToken,
                deposit.longTokenAmount,
                deposit.account,
                deposit.shouldUnwrapNativeToken
            );
        }

        if (deposit.shortTokenAmount > 0) {
            depositStore.transferOut(
                dataStore,
                market.shortToken,
                deposit.shortTokenAmount,
                deposit.account,
                deposit.shouldUnwrapNativeToken
            );
        }

        depositStore.remove(key);

        eventEmitter.emitDepositCancelled(key);

        CallbackUtils.afterDepositCancellation(key, deposit);

        GasUtils.payExecutionFee(
            dataStore,
            depositStore,
            deposit.executionFee,
            startingGas,
            keeper,
            deposit.account
        );
    }

    // @dev executes a deposit
    // @param params ExecuteDepositParams
    // @param _params _ExecuteDepositParams
    function _executeDeposit(ExecuteDepositParams memory params, _ExecuteDepositParams memory _params) internal returns (uint256) {
        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            _params.market.marketToken,
            _params.amount,
            Keys.FEE_RECEIVER_DEPOSIT_FACTOR
        );

        PricingUtils.transferFees(
            params.dataStore,
            params.feeReceiver,
            _params.market.marketToken,
            _params.tokenIn,
            fees.feeReceiverAmount,
            FeeUtils.DEPOSIT_FEE
        );

        params.eventEmitter.emitSwapFeesCollected(keccak256(abi.encode("deposit")), fees);

        return _processDeposit(params, _params, fees.amountAfterFees, fees.feesForPool);
    }

    // @dev processes a deposit
    // @param params ExecuteDepositParams
    // @param _params _ExecuteDepositParams
    // @param amountAfterFees the deposit amount after fees
    // @param feesForPool the amount of fees for the pool
    function _processDeposit(
        ExecuteDepositParams memory params,
        _ExecuteDepositParams memory _params,
        uint256 amountAfterFees,
        uint256 feesForPool
    ) internal returns (uint256) {
        uint256 mintAmount;

        uint256 poolValue = MarketUtils.getPoolValue(
            params.dataStore,
            _params.market,
            _params.tokenIn == _params.market.longToken ? _params.tokenInPrice : _params.tokenOutPrice,
            _params.tokenIn == _params.market.shortToken ? _params.tokenInPrice : _params.tokenOutPrice,
            params.oracle.getPrimaryPrice(_params.market.indexToken),
            true
        );
        uint256 supply = MarketUtils.getMarketTokenSupply(MarketToken(payable(_params.market.marketToken)));

        if (_params.priceImpactUsd > 0) {
            // when there is a positive price impact factor,
            // tokens from the swap impact pool are used to mint additional market tokens for the user
            // for example, if 50,000 USDC is deposited and there is a positive price impact
            // an additional 0.005 ETH may be used to mint market tokens
            // the swap impact pool is decreased by the used amount
            //
            // priceImpactUsd is calculated based on pricing assuming only depositAmount of tokenIn
            // was added to the pool
            // since impactAmount of tokenOut is added to the pool here, the calculation of
            // the tokenInPrice would not be entirely accurate
            int256 positiveImpactAmount = MarketUtils.applySwapImpactWithCap(
                params.dataStore,
                params.eventEmitter,
                _params.market.marketToken,
                _params.tokenOut,
                _params.tokenOutPrice,
                _params.priceImpactUsd
            );

            // calculate the usd amount using positiveImpactAmount since it may
            // be capped by the max available amount in the impact pool
            mintAmount += MarketUtils.usdToMarketTokenAmount(
                positiveImpactAmount.toUint256() * _params.tokenOutPrice.min,
                poolValue,
                supply
            );

            // deposit the token out, that was withdrawn from the impact pool, to mint market tokens
            MarketUtils.applyDeltaToPoolAmount(
                params.dataStore,
                params.eventEmitter,
                _params.market.marketToken,
                _params.tokenOut,
                positiveImpactAmount
            );
        } else {
            // when there is a negative price impact factor,
            // less of the deposit amount is used to mint market tokens
            // for example, if 10 ETH is deposited and there is a negative price impact
            // only 9.995 ETH may be used to mint market tokens
            // the remaining 0.005 ETH will be stored in the swap impact pool
            int256 negativeImpactAmount = MarketUtils.applySwapImpactWithCap(
                params.dataStore,
                params.eventEmitter,
                _params.market.marketToken,
                _params.tokenIn,
                _params.tokenInPrice,
                _params.priceImpactUsd
            );
            amountAfterFees -= (-negativeImpactAmount).toUint256();
        }

        mintAmount += MarketUtils.usdToMarketTokenAmount(
            amountAfterFees * _params.tokenInPrice.min,
            poolValue,
            supply
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            _params.market.marketToken,
            _params.tokenIn,
            (amountAfterFees + feesForPool).toInt256()
        );

        MarketToken(payable(_params.market.marketToken)).mint(_params.receiver, mintAmount);

        return mintAmount;
    }
}
