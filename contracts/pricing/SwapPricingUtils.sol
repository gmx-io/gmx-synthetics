// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../market/MarketUtils.sol";

import "../utils/Precision.sol";
import "../utils/Calc.sol";

import "./PricingUtils.sol";

library SwapPricingUtils {
    using SafeCast for uint256;
    using SafeCast for int256;

    struct GetSwapPricingParams {
        DataStore dataStore;
        address market;
        address tokenA;
        address tokenB;
        uint256 priceForTokenA;
        uint256 priceForTokenB;
        int256 usdDeltaForTokenA;
        int256 usdDeltaForTokenB;
    }

    struct PoolParams {
        uint256 poolUsdForTokenA;
        uint256 poolUsdForTokenB;
        uint256 nextPoolUsdForTokenA;
        uint256 nextPoolUsdForTokenB;
    }

    struct SwapFees {
        uint256 feeReceiverAmount;
        uint256 feesForPool;
        uint256 amountAfterFees;
        uint256 amountForPool;
    }

    // note that there will be some difference between the pool amounts used for
    // calculating the price impact and fees vs the actual pool amounts after the
    // swap is done, since the pool amounts will be increased / decreased by an amount
    // after factoring in the calculated price impact and fees
    //
    // since the calculations are based on the real-time prices values of the tokens
    // if a token price increases, the pool will incentivise swapping out more of that token
    // this is useful if prices are ranging, if prices are strongly directional, the pool may
    // be selling tokens as the token price increases
    //
    // returns (usd adjustment)
    function getSwapPricing(GetSwapPricingParams memory params) internal view returns (int256) {
        PoolParams memory poolParams = getNextPoolAmountsUsd(params);

        int256 usdAdjustment = getUsdAdjustment(params.dataStore, params.market, poolParams);

        return usdAdjustment;
    }

    function getUsdAdjustment(DataStore dataStore, address market, PoolParams memory poolParams) internal view returns (int256) {
        uint256 initialDiffUsd = Calc.diff(poolParams.poolUsdForTokenA, poolParams.poolUsdForTokenB);
        uint256 nextDiffUsd = Calc.diff(poolParams.nextPoolUsdForTokenA, poolParams.nextPoolUsdForTokenB);

        // check whether an improvement in balance comes from causing the balance to switch sides
        // for example, if there is $2000 of ETH and $1000 of USDC in the pool
        // adding $1999 USDC into the pool will reduce absolute balance from $1000 to $999 but it does not
        // help rebalance the pool much, the isSameSideRebalance value helps avoid gaming using this case
        bool isSameSideRebalance = poolParams.poolUsdForTokenA <= poolParams.poolUsdForTokenB == poolParams.nextPoolUsdForTokenA <= poolParams.nextPoolUsdForTokenB;
        uint256 impactExponentFactor = dataStore.getUint(Keys.swapImpactExponentFactorKey(market));

        if (isSameSideRebalance) {
            bool hasPositiveImpact = nextDiffUsd < initialDiffUsd;
            uint256 impactFactor = dataStore.getUint(Keys.swapImpactFactorKey(market, hasPositiveImpact));

            return PricingUtils.getUsdAdjustmentForSameSideRebalance(
                initialDiffUsd,
                nextDiffUsd,
                hasPositiveImpact,
                impactFactor,
                impactExponentFactor
            );
        } else {
            uint256 positiveImpactFactor = dataStore.getUint(Keys.swapImpactFactorKey(market, true));
            uint256 negativeImpactFactor = dataStore.getUint(Keys.swapImpactFactorKey(market, false));

            return PricingUtils.getUsdAdjustmentForCrossoverRebalance(
                initialDiffUsd,
                nextDiffUsd,
                positiveImpactFactor,
                negativeImpactFactor,
                impactExponentFactor
            );
        }
    }

    function getNextPoolAmountsUsd(
        GetSwapPricingParams memory params
    ) internal view returns (PoolParams memory) {
        uint256 poolAmountForTokenA = MarketUtils.getPoolAmount(params.dataStore, params.market, params.tokenA);
        uint256 poolAmountForTokenB = MarketUtils.getPoolAmount(params.dataStore, params.market, params.tokenB);

        uint256 poolUsdForTokenA = poolAmountForTokenA * params.priceForTokenA;
        uint256 poolUsdForTokenB = poolAmountForTokenB * params.priceForTokenB;

        uint256 nextPoolUsdForTokenA = Calc.sum(poolUsdForTokenA, params.usdDeltaForTokenA);
        uint256 nextPoolUsdForTokenB = Calc.sum(poolUsdForTokenB, params.usdDeltaForTokenB);

        PoolParams memory poolParams = PoolParams(
            poolUsdForTokenA,
            poolUsdForTokenB,
            nextPoolUsdForTokenA,
            nextPoolUsdForTokenB
        );

        return poolParams;
    }

    function getSwapFees(
        DataStore dataStore,
        address marketToken,
        uint256 amount,
        bytes32 feeReceiverFactorKey
    ) internal view returns (SwapFees memory) {
        SwapFees memory fees;

        uint256 spreadFactor = dataStore.getUint(Keys.swapSpreadFactorKey(marketToken));
        uint256 feeFactor = dataStore.getUint(Keys.swapFeeFactorKey(marketToken));
        uint256 feeReceiverFactor = dataStore.getUint(feeReceiverFactorKey);

        uint256 spreadAmount = Precision.applyFactor(amount, spreadFactor);
        uint256 feeAmount = Precision.applyFactor(amount, feeFactor);

        fees.feeReceiverAmount = Precision.applyFactor(feeAmount, feeReceiverFactor);
        fees.feesForPool = spreadAmount + feeAmount - fees.feeReceiverAmount;
        fees.amountAfterFees = amount - spreadAmount - feeAmount;

        return fees;
    }
}
