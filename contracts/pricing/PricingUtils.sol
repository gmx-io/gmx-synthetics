// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "prb-math/contracts/PRBMathUD60x18.sol";

import "../utils/Calc.sol";
import "../utils/Precision.sol";
import "../market/MarketUtils.sol";
import "../fee/FeeReceiver.sol";

// @title PricingUtils
// @dev Library for pricing functions
library PricingUtils {
    // @dev get the price impact USD if there is no crossover in balance
    // a crossover in balance is for example if the long open interest is larger
    // than the short open interest, and a short position is opened such that the
    // short open interest becomes larger than the long open interest
    // @param initialDiffUsd the initial difference in USD
    // @param nextDiffUsd the next difference in USD
    // @param hasPositiveImpact whether there is a positive impact on balance
    // @param impactFactor the impact factor
    // @param impactExponentFactor the impact exponent factor
    function getPriceImpactUsdForSameSideRebalance(
        uint256 initialDiffUsd,
        uint256 nextDiffUsd,
        bool hasPositiveImpact,
        uint256 impactFactor,
        uint256 impactExponentFactor
    ) internal pure returns (int256) {
        uint256 deltaDiffUsd = Calc.diff(
            applyImpactFactor(initialDiffUsd, impactFactor, impactExponentFactor),
            applyImpactFactor(nextDiffUsd, impactFactor, impactExponentFactor)
        );

        int256 priceImpactUsd = Calc.toSigned(deltaDiffUsd, hasPositiveImpact);

        return priceImpactUsd;
    }

    // @dev get the price impact USD if there is a crossover in balance
    // a crossover in balance is for example if the long open interest is larger
    // than the short open interest, and a short position is opened such that the
    // short open interest becomes larger than the long open interest
    // @param initialDiffUsd the initial difference in USD
    // @param nextDiffUsd the next difference in USD
    // @param hasPositiveImpact whether there is a positive impact on balance
    // @param impactFactor the impact factor
    // @param impactExponentFactor the impact exponent factor
    function getPriceImpactUsdForCrossoverRebalance(
        uint256 initialDiffUsd,
        uint256 nextDiffUsd,
        uint256 positiveImpactFactor,
        uint256 negativeImpactFactor,
        uint256 impactExponentFactor
    ) internal pure returns (int256) {
        uint256 positiveImpactUsd = applyImpactFactor(initialDiffUsd, positiveImpactFactor, impactExponentFactor);
        uint256 negativeImpactUsd = applyImpactFactor(nextDiffUsd, negativeImpactFactor, impactExponentFactor);
        uint256 deltaDiffUsd = Calc.diff(positiveImpactUsd, negativeImpactUsd);

        int256 priceImpactUsd = Calc.toSigned(deltaDiffUsd, positiveImpactUsd > negativeImpactUsd);

        return priceImpactUsd;
    }

    // @dev apply the impact factor calculation to a USD diff value
    // @param diffUsd the difference in USD
    // @param impactFactor the impact factor
    // @param impactExponentFactor the impact exponent factor
    function applyImpactFactor(
        uint256 diffUsd,
        uint256 impactFactor,
        uint256 impactExponentFactor
    ) internal pure returns (uint256) {
        // `PRBMathUD60x18.pow` doesn't work for `x` less than one
        if (diffUsd < Precision.FLOAT_PRECISION) {
            return 0;
        }

        // `PRBMathUD60x18.pow` accepts 2 fixed point numbers 60x18
        // we need to convert float (30 decimals) to 60x18 (18 decimals) and then back to 30 decimals
        uint256 adjustedDiffUsd = PRBMathUD60x18.pow(
            Precision.floatToWei(diffUsd),
            Precision.floatToWei(impactExponentFactor)
        );
        adjustedDiffUsd = Precision.weiToFloat(adjustedDiffUsd);

        // we divide by 2 here to more easily translate liquidity into the appropriate impactFactor values
        // for example, if the impactExponentFactor is 2 and we want to have an impact of 0.1% for $2 million of difference
        // we can set the impactFactor to be 0.1% / $2 million
        return Precision.applyFactor(adjustedDiffUsd, impactFactor) / 2;
    }

    // @dev transfer fees to the feeReceiver
    // @param dataStore DataStore
    // @param feeReceiver FeeReceiver
    // @param marketToken the market token of the market
    // @param token the fee token to transfer
    // @param feeReceiverAmount the amount to transfer
    // @param feeType the fee type
    function transferFees(
        DataStore dataStore,
        FeeReceiver feeReceiver,
        address marketToken,
        address token,
        uint256 feeReceiverAmount,
        bytes32 feeType
    ) internal {
        if (feeReceiverAmount == 0) {
            return;
        }

        MarketToken(payable(marketToken)).transferOut(
            dataStore,
            token,
            feeReceiverAmount,
            address(feeReceiver)
        );

        feeReceiver.notifyFeeReceived(feeType, token, feeReceiverAmount);
    }
}
