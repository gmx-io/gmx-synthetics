// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "prb-math/contracts/PRBMathUD60x18.sol";

import "../utils/Calc.sol";
import "../utils/Precision.sol";
import "../market/MarketUtils.sol";
import "../fee/FeeReceiver.sol";

library PricingUtils {
    function getUsdAdjustmentForSameSideRebalance(
        uint256 initialDiffUsd,
        uint256 nextDiffUsd,
        bool hasPositiveImpact,
        uint256 impactFactor,
        uint256 impactExponentFactor
    ) public pure returns (int256) {
        uint256 deltaDiffUsd = Calc.diff(
            applyImpactFactor(initialDiffUsd, impactFactor, impactExponentFactor),
            applyImpactFactor(nextDiffUsd, impactFactor, impactExponentFactor)
        );

        int256 usdAdjustment = Calc.toSigned(deltaDiffUsd, hasPositiveImpact);

        return usdAdjustment;
    }

    function getUsdAdjustmentForCrossoverRebalance(
        uint256 initialDiffUsd,
        uint256 nextDiffUsd,
        uint256 positiveImpactFactor,
        uint256 negativeImpactFactor,
        uint256 impactExponentFactor
    ) public pure returns (int256) {
        uint256 positiveImpactUsd = applyImpactFactor(initialDiffUsd, positiveImpactFactor, impactExponentFactor);
        uint256 negativeImpactUsd = applyImpactFactor(nextDiffUsd, negativeImpactFactor, impactExponentFactor);
        uint256 deltaDiffUsd = Calc.diff(positiveImpactUsd, negativeImpactUsd);

        int256 usdAdjustment = Calc.toSigned(deltaDiffUsd, positiveImpactUsd > negativeImpactUsd);

        return usdAdjustment;
    }

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

        return Precision.applyFactor(adjustedDiffUsd, impactFactor) / 2;
    }

    function transferFees(
        FeeReceiver feeReceiver,
        address marketToken,
        address token,
        uint256 feeReceiverAmount,
        bytes32 feeType
    ) internal {
        if (feeReceiverAmount > 0) {
            MarketToken(marketToken).transferOut(token, feeReceiverAmount, address(feeReceiver));
            feeReceiver.notifyFeeReceived(feeType, token, feeReceiverAmount);
        }
    }
}
