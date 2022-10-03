// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";

import "./WithdrawalStore.sol";
import "../market/MarketStore.sol";

import "../nonce/NonceUtils.sol";
import "../pricing/SwapPricingUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";

import "../gas/GasUtils.sol";

import "../utils/Array.sol";

library WithdrawalUtils {
    using SafeCast for uint256;
    using Array for uint256[];

    struct CreateWithdrawalParams {
        DataStore dataStore;
        WithdrawalStore withdrawalStore;
        MarketStore marketStore;
        address account;
        address market;
        uint256 marketTokensLongAmount;
        uint256 marketTokensShortAmount;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        bool hasCollateralInETH;
        uint256 executionFee;
        address weth;
    }

    struct ExecuteWithdrawalParams {
        DataStore dataStore;
        WithdrawalStore withdrawalStore;
        MarketStore marketStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        bytes32 key;
        uint256[] oracleBlockNumbers;
        address keeper;
        uint256 startingGas;
    }

    struct _ExecuteWithdrawalParams {
        Market.Props market;
        address account;
        address tokenIn;
        address tokenOut;
        uint256 tokenInPrice;
        uint256 tokenOutPrice;
        uint256 marketTokensAmount;
        bool hasCollateralInETH;
        uint256 marketTokensUsd;
        int256 usdAdjustment;
    }

    struct ExecuteWithdrawalCache {
        uint256 poolValue;
        uint256 marketTokensSupply;
        uint256 marketTokensLongUsd;
        uint256 marketTokensShortUsd;
    }

    error MinLongTokens(uint256 received, uint256 expected);
    error MinShortTokens(uint256 received, uint256 expected);
    error InsufficientMarketTokens(uint256 balance, uint256 expected);

    function createWithdrawal(CreateWithdrawalParams memory params) external returns (bytes32) {
        uint256 wethAmount = params.withdrawalStore.recordTransferIn(params.weth);
        require(wethAmount == params.executionFee, "WithdrawalUtils: invalid wethAmount");

        Market.Props memory market = params.marketStore.get(params.market);

        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            params.account,
            market.marketToken,
            params.marketTokensLongAmount,
            params.marketTokensShortAmount,
            params.minLongTokenAmount,
            params.minShortTokenAmount,
            block.number,
            params.hasCollateralInETH,
            params.executionFee,
            new bytes32[](0)
        );

        uint256 estimatedGasLimit = GasUtils.estimateExecuteWithdrawalGasLimit(params.dataStore, withdrawal);
        GasUtils.validateExecutionFee(params.dataStore, estimatedGasLimit, params.executionFee);

        uint256 nonce = NonceUtils.incrementNonce(params.dataStore);
        bytes32 key = keccak256(abi.encodePacked(nonce));

        params.withdrawalStore.set(key, withdrawal);

        return key;
    }

    function executeWithdrawal(ExecuteWithdrawalParams memory params) internal {
        Withdrawal.Props memory withdrawal = params.withdrawalStore.get(params.key);
        require(withdrawal.account != address(0), "WithdrawalUtils: empty withdrawal");

        if (!params.oracleBlockNumbers.areEqualTo(withdrawal.updatedAtBlock)) {
            revert(Keys.ORACLE_ERROR);
        }

        Market.Props memory market = params.marketStore.get(withdrawal.market);

        uint256 longTokenPrice = params.oracle.getPrimaryPrice(market.longToken);
        uint256 shortTokenPrice = params.oracle.getPrimaryPrice(market.shortToken);

        ExecuteWithdrawalCache memory cache;
        cache.poolValue = MarketUtils.getPoolValue(
            params.dataStore,
            market,
            longTokenPrice,
            shortTokenPrice,
            params.oracle.getPrimaryPrice(market.indexToken)
        );

        cache.marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(market.marketToken));
        cache.marketTokensLongUsd = MarketUtils.marketTokenAmountToUsd(withdrawal.marketTokensLongAmount, cache.poolValue, cache.marketTokensSupply);
        cache.marketTokensShortUsd = MarketUtils.marketTokenAmountToUsd(withdrawal.marketTokensShortAmount, cache.poolValue, cache.marketTokensSupply);

        int256 usdAdjustment = SwapPricingUtils.getSwapPricing(
            SwapPricingUtils.GetSwapPricingParams(
                params.dataStore,
                market.marketToken,
                market.longToken,
                market.shortToken,
                longTokenPrice,
                shortTokenPrice,
                -(cache.marketTokensLongUsd.toInt256()),
                -(cache.marketTokensShortUsd.toInt256())
            )
        );

        if (withdrawal.marketTokensLongAmount > 0) {
            _ExecuteWithdrawalParams memory _params = _ExecuteWithdrawalParams(
                market,
                withdrawal.account,
                market.shortToken,
                market.longToken,
                shortTokenPrice,
                longTokenPrice,
                withdrawal.marketTokensLongAmount,
                withdrawal.hasCollateralInETH,
                cache.marketTokensLongUsd,
                usdAdjustment * cache.marketTokensLongUsd.toInt256() / (cache.marketTokensLongUsd + cache.marketTokensShortUsd).toInt256()
            );

            uint256 outputAmount = _executeWithdrawal(params, _params);

            if (outputAmount < withdrawal.minLongTokenAmount) {
                revert MinLongTokens(outputAmount, withdrawal.minLongTokenAmount);
            }
        }

        if (withdrawal.marketTokensShortAmount > 0) {
            _ExecuteWithdrawalParams memory _params = _ExecuteWithdrawalParams(
                market,
                withdrawal.account,
                market.longToken,
                market.shortToken,
                longTokenPrice,
                shortTokenPrice,
                withdrawal.marketTokensShortAmount,
                withdrawal.hasCollateralInETH,
                cache.marketTokensShortUsd,
                usdAdjustment * cache.marketTokensShortUsd.toInt256() / (cache.marketTokensLongUsd + cache.marketTokensShortUsd).toInt256()
            );

            uint256 outputAmount = _executeWithdrawal(params, _params);
            if (outputAmount < withdrawal.minShortTokenAmount) {
                revert MinShortTokens(outputAmount, withdrawal.minShortTokenAmount);
            }
        }

        params.withdrawalStore.remove(params.key);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.withdrawalStore,
            withdrawal.executionFee,
            params.startingGas,
            params.keeper,
            withdrawal.account
        );
    }

    function cancelWithdrawal(
        DataStore dataStore,
        WithdrawalStore withdrawalStore,
        bytes32 key,
        address keeper,
        uint256 startingGas
    ) internal {
        Withdrawal.Props memory withdrawal = withdrawalStore.get(key);
        require(withdrawal.account != address(0), "WithdrawalUtils: empty withdrawal");

        withdrawalStore.remove(key);

        GasUtils.payExecutionFee(
            dataStore,
            withdrawalStore,
            withdrawal.executionFee,
            startingGas,
            keeper,
            withdrawal.account
        );
    }

    function _executeWithdrawal(
        ExecuteWithdrawalParams memory params,
        _ExecuteWithdrawalParams memory _params
    ) internal returns (uint256) {
        uint256 outputAmount = _params.marketTokensUsd / _params.tokenOutPrice;

        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            params.dataStore,
            _params.market.marketToken,
            outputAmount,
            Keys.FEE_RECEIVER_WITHDRAWAL_FACTOR
        );

        PricingUtils.transferFees(
            params.feeReceiver,
            _params.market.marketToken,
            _params.tokenOut,
            fees.feeReceiverAmount,
            FeeUtils.WITHDRAWAL_FEE
        );

        uint256 poolAmountDelta = outputAmount - fees.feesForPool;
        outputAmount = fees.amountAfterFees;

        if (_params.usdAdjustment > 0) {
            // when there is a positive price impact factor, additional tokens from the swap impact pool
            // are withdrawn for the user
            // for example, if 50,000 USDC is withdrawn and there is a positive price impact
            // an additional 100 USDC may be sent to the user
            // the swap impact pool is decreased by the used amount
            uint256 positiveImpactAmount = MarketUtils.applyPositiveImpact(
                params.dataStore,
                _params.market.marketToken,
                _params.tokenOut,
                _params.tokenOutPrice,
                _params.usdAdjustment
            );

            outputAmount += positiveImpactAmount;
        } else {
            // when there is a negative price impact factor,
            // less of the output amount is sent to the user
            // for example, if 10 ETH is withdrawn and there is a negative price impact
            // only 9.995 ETH may be withdrawn
            // the remaining 0.005 ETH will be stored in the swap impact pool
            uint256 negativeImpactAmount = MarketUtils.applyNegativeImpact(
                params.dataStore,
                _params.market.marketToken,
                _params.tokenOut,
                _params.tokenOutPrice,
                _params.usdAdjustment
            );

            outputAmount -= negativeImpactAmount;
        }

        MarketUtils.decreasePoolAmount(params.dataStore, _params.market.marketToken, _params.tokenOut, poolAmountDelta);

        MarketUtils.validateReserve(
            params.dataStore,
            _params.market,
            MarketUtils.MarketPrices(
                params.oracle.getPrimaryPrice(_params.market.indexToken),
                _params.tokenIn == _params.market.longToken ? _params.tokenInPrice : _params.tokenOutPrice,
                _params.tokenIn == _params.market.shortToken ? _params.tokenInPrice : _params.tokenOutPrice
            ),
            _params.tokenOut == _params.market.longToken
        );

        uint256 marketTokensBalance = MarketToken(_params.market.marketToken).balanceOf(_params.account);
        if (marketTokensBalance < _params.marketTokensAmount) {
            revert InsufficientMarketTokens(marketTokensBalance, _params.marketTokensAmount);
        }

        MarketToken(_params.market.marketToken).burn(_params.account, _params.marketTokensAmount);
        MarketToken(_params.market.marketToken).transferOut(
            EthUtils.weth(params.dataStore),
            _params.tokenOut,
            outputAmount,
            _params.account,
            _params.hasCollateralInETH
        );

        return outputAmount;
    }
}
