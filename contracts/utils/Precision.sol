// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "prb-math/contracts/PRBMathUD60x18.sol";

import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SignedMath.sol";

/**
 * @title Precision
 * @dev Library for precision values and conversions
 */
library Precision {
    using SafeCast for uint256;
    using SignedMath for int256;

    uint256 public constant FLOAT_PRECISION = 10 ** 30;
    uint256 public constant WEI_PRECISION = 10 ** 18;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    uint256 public constant FLOAT_TO_WEI_DIVISOR = 10 ** 12;

    uint256 public constant SCALING_FACTOR_TO_AVOID_OVERFLOW = 10 ** 20;
    uint256 public constant FLOAT_PRECISION_AFTER_SCALING_FACTOR = FLOAT_PRECISION / SCALING_FACTOR_TO_AVOID_OVERFLOW;

    /**
     * Applies the given factor to the given value and returns the result.
     *
     * @param value The value to apply the factor to.
     * @param factor The factor to apply.
     * @return The result of applying the factor to the value.
     */
    function applyFactor(uint256 value, uint256 factor) internal pure returns (uint256) {
        (bool ok, uint256 numerator) = SafeMath.tryMul(value, factor);
        if (ok) {
            return numerator / FLOAT_PRECISION;
        }

        // if ok is false, the multiplication overflowed, attempt the multiplication
        // with reduced values

        // assign the larger value to a and the smaller value to b
        (uint256 a, uint256 b) = value > factor ? (value, factor) : (factor, value);

        // for an overflow to occur, "a" must be more than 10^38
        // reduce "a" to allow larger values to be handled
        return ((a / SCALING_FACTOR_TO_AVOID_OVERFLOW) * b) / FLOAT_PRECISION_AFTER_SCALING_FACTOR;
    }

    /**
     * Applies the given factor to the given value and returns the result.
     *
     * @param value The value to apply the factor to.
     * @param factor The factor to apply.
     * @return The result of applying the factor to the value.
     */
    function applyFactor(uint256 value, int256 factor) internal pure returns (int256) {
        uint256 result = applyFactor(value, factor.abs());
        if (factor > 0) {
            return result.toInt256();
        }

        return -result.toInt256();
    }

    function applyExponentFactor(
        uint256 floatValue,
        uint256 exponentFactor
    ) internal pure returns (uint256) {
        // `PRBMathUD60x18.pow` doesn't work for `x` less than one
        if (floatValue < FLOAT_PRECISION) {
            return 0;
        }

        // `PRBMathUD60x18.pow` accepts 2 fixed point numbers 60x18
        // we need to convert float (30 decimals) to 60x18 (18 decimals) and then back to 30 decimals
        uint256 weiValue = PRBMathUD60x18.pow(
            floatToWei(floatValue),
            floatToWei(exponentFactor)
        );

        return weiToFloat(weiValue);
    }

    /**
     * Converts the given value from float to wei.
     *
     * @param value The value to convert.
     * @return The converted value in wei.
     */
    function floatToWei(uint256 value) internal pure returns (uint256) {
        return value / FLOAT_TO_WEI_DIVISOR;
    }

    /**
     * Converts the given value from wei to float.
     *
     * @param value The value to convert.
     * @return The converted value in float.
     */
    function weiToFloat(uint256 value) internal pure returns (uint256) {
        return value * FLOAT_TO_WEI_DIVISOR;
    }

    /**
     * Converts the given number of basis points to float.
     *
     * @param basisPoints The number of basis points to convert.
     * @return The converted value in float.
     */
    function basisPointsToFloat(uint256 basisPoints) internal pure returns (uint256) {
        return basisPoints * FLOAT_PRECISION / BASIS_POINTS_DIVISOR;
    }
}
