// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";

import "./DepositStore.sol";
import "../market/MarketStore.sol";

import "../nonce/NonceUtils.sol";
import "../pricing/SwapPricingUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";

import "../gas/GasUtils.sol";
import "../eth/EthUtils.sol";

import "../utils/Array.sol";

library DepositUtils {
    using SafeCast for uint256;
    using Array for uint256[];

    struct CreateDepositParams {
        DataStore dataStore;
        DepositStore depositStore;
        MarketStore marketStore;
        address account;
        address market;
        uint256 minMarketTokens;
        bool hasCollateralInETH;
        uint256 executionFee;
        address weth;
    }

    struct ExecuteDepositParams {
        DataStore dataStore;
        DepositStore depositStore;
        MarketStore marketStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        bytes32 key;
        uint256[] oracleBlockNumbers;
        address keeper;
        uint256 startingGas;
    }

    struct _ExecuteDepositParams {
        Market.Props market;
        address account;
        address tokenIn;
        address tokenOut;
        uint256 tokenInPrice;
        uint256 tokenOutPrice;
        uint256 amount;
        int256 usdAdjustment;
    }

    error MinMarketTokens(uint256 received, uint256 expected);

    function createDeposit(CreateDepositParams memory params) external returns (bytes32) {
        Market.Props memory market = params.marketStore.get(params.market);
        MarketUtils.validateNonEmptyMarket(market);

        uint256 longTokenAmount = params.depositStore.recordTransferIn(market.longToken);
        uint256 shortTokenAmount = params.depositStore.recordTransferIn(market.shortToken);

        if (market.longToken == params.weth) {
            longTokenAmount -= params.executionFee;
        } else if (market.shortToken == params.weth) {
            shortTokenAmount -= params.executionFee;
        } else {
            uint256 wethAmount = params.depositStore.recordTransferIn(params.weth);
            require(wethAmount == params.executionFee, "DepositUtils: invalid wethAmount");
        }

        Deposit.Props memory deposit = Deposit.Props(
            params.account,
            market.marketToken,
            longTokenAmount,
            shortTokenAmount,
            params.minMarketTokens,
            block.number,
            params.hasCollateralInETH,
            params.executionFee,
            new bytes32[](0)
        );

        uint256 estimatedGasLimit = GasUtils.estimateExecuteDepositGasLimit(params.dataStore, deposit);
        GasUtils.validateExecutionFee(params.dataStore, estimatedGasLimit, params.executionFee);

        uint256 nonce = NonceUtils.incrementNonce(params.dataStore);
        bytes32 key = keccak256(abi.encodePacked(nonce));

        params.depositStore.set(key, deposit);

        return key;
    }

    function executeDeposit(ExecuteDepositParams memory params) internal {
        Deposit.Props memory deposit = params.depositStore.get(params.key);
        require(deposit.account != address(0), "DepositUtils: empty deposit");

        if (!params.oracleBlockNumbers.areEqualTo(deposit.updatedAtBlock)) {
            revert(Keys.ORACLE_ERROR);
        }

        Market.Props memory market = params.marketStore.get(deposit.market);

        uint256 longTokenPrice = params.oracle.getPrimaryPrice(market.longToken);
        uint256 shortTokenPrice = params.oracle.getPrimaryPrice(market.shortToken);

        uint256 longTokenUsd = deposit.longTokenAmount * longTokenPrice;
        uint256 shortTokenUsd = deposit.shortTokenAmount * shortTokenPrice;

        uint256 receivedMarketTokens;

        int256 usdAdjustment = SwapPricingUtils.getSwapPricing(
            SwapPricingUtils.GetSwapPricingParams(
                params.dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
                longTokenPrice,
                shortTokenPrice,
                (deposit.longTokenAmount * longTokenPrice).toInt256(),
                (deposit.shortTokenAmount * shortTokenPrice).toInt256()
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
            params.depositStore.transferOut(market.longToken, deposit.longTokenAmount, market.marketToken);

            _ExecuteDepositParams memory _params = _ExecuteDepositParams(
                market,
                deposit.account,
                market.longToken,
                market.shortToken,
                longTokenPrice,
                shortTokenPrice,
                deposit.longTokenAmount,
                usdAdjustment * longTokenUsd.toInt256() / (longTokenUsd + shortTokenUsd).toInt256()
            );

            receivedMarketTokens += _executeDeposit(params, _params);
        }

        if (deposit.shortTokenAmount > 0) {
            params.depositStore.transferOut(market.shortToken, deposit.shortTokenAmount, market.marketToken);

            _ExecuteDepositParams memory _params = _ExecuteDepositParams(
                market,
                deposit.account,
                market.shortToken,
                market.longToken,
                shortTokenPrice,
                longTokenPrice,
                deposit.shortTokenAmount,
                usdAdjustment * shortTokenUsd.toInt256() / (longTokenUsd + shortTokenUsd).toInt256()
            );

            receivedMarketTokens += _executeDeposit(params, _params);
        }

        if (receivedMarketTokens < deposit.minMarketTokens) {
            revert MinMarketTokens(receivedMarketTokens, deposit.minMarketTokens);
        }

        params.depositStore.remove(params.key);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.depositStore,
            deposit.executionFee,
            params.startingGas,
            params.keeper,
            deposit.account
        );
    }

    function cancelDeposit(
        DataStore dataStore,
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
                EthUtils.weth(dataStore),
                market.longToken,
                deposit.longTokenAmount,
                deposit.account,
                deposit.hasCollateralInETH
            );
        }

        if (deposit.shortTokenAmount > 0) {
            depositStore.transferOut(
                EthUtils.weth(dataStore),
                market.shortToken,
                deposit.shortTokenAmount,
                deposit.account,
                deposit.hasCollateralInETH
            );
        }

        depositStore.remove(key);

        GasUtils.payExecutionFee(
            dataStore,
            depositStore,
            deposit.executionFee,
            startingGas,
            keeper,
            deposit.account
        );
    }

    function _executeDeposit(ExecuteDepositParams memory params, _ExecuteDepositParams memory _params) internal returns (uint256) {
        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            _params.market.marketToken,
            _params.amount,
            Keys.FEE_RECEIVER_DEPOSIT_FACTOR
        );

        PricingUtils.transferFees(
            params.feeReceiver,
            _params.market.marketToken,
            _params.tokenIn,
            fees.feeReceiverAmount,
            FeeUtils.DEPOSIT_FEE
        );

        return _processDeposit(params, _params, fees.amountAfterFees, fees.feesForPool);
    }

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
            params.oracle.getPrimaryPrice(_params.market.indexToken)
        );
        uint256 supply = MarketUtils.getMarketTokenSupply(MarketToken(_params.market.marketToken));

        if (_params.usdAdjustment > 0) {
            // when there is a positive price impact factor,
            // tokens from the swap impact pool are used to mint additional market tokens for the user
            // for example, if 50,000 USDC is deposited and there is a positive price impact
            // an additional 0.005 ETH may be used to mint market tokens
            // the swap impact pool is decreased by the used amount
            //
            // usdAdjustment is calculated based on pricing assuming only depositAmount of tokenIn
            // was added to the pool
            // since impactAmount of tokenOut is added to the pool here, the calculation of
            // the tokenInPrice would not be entirely accurate
            uint256 positiveImpactAmount = MarketUtils.applyPositiveImpact(
                params.dataStore,
                _params.market.marketToken,
                _params.tokenOut,
                _params.tokenOutPrice,
                _params.usdAdjustment
            );

            // calculate the usd amount using positiveImpactAmount since it may
            // be capped by the max available amount in the impact pool
            mintAmount += MarketUtils.usdToMarketTokenAmount(
                positiveImpactAmount * _params.tokenOutPrice,
                poolValue,
                supply
            );

            // deposit the token out, that was withdrawn from the impact pool, to mint market tokens
            MarketUtils.increasePoolAmount(params.dataStore, _params.market.marketToken, _params.tokenOut, positiveImpactAmount);
        } else {
            // when there is a negative price impact factor,
            // less of the deposit amount is used to mint market tokens
            // for example, if 10 ETH is deposited and there is a negative price impact
            // only 9.995 ETH may be used to mint market tokens
            // the remaining 0.005 ETH will be stored in the swap impact pool
            uint256 negativeImpactAmount = MarketUtils.applyNegativeImpact(
                params.dataStore,
                _params.market.marketToken,
                _params.tokenIn,
                _params.tokenInPrice,
                _params.usdAdjustment
            );
            amountAfterFees -= negativeImpactAmount;
        }

        mintAmount += MarketUtils.usdToMarketTokenAmount(amountAfterFees * _params.tokenInPrice, poolValue, supply);
        MarketUtils.increasePoolAmount(params.dataStore, _params.market.marketToken, _params.tokenIn, amountAfterFees + feesForPool);

        MarketToken(_params.market.marketToken).mint(_params.account, mintAmount);

        return mintAmount;
    }
}
