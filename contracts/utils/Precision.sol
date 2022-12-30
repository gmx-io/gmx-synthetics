// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * @title Precision
 * @dev Library for precision values and conversions
 */
library Precision {
    using SafeCast for uint256;

    uint256 public constant FLOAT_PRECISION = 10 ** 30;
    uint256 public constant WEI_PRECISION = 10 ** 18;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    uint256 public constant FLOAT_TO_WEI_DIVISOR = 10 ** 12;

    /**
     * Applies the given factor to the given amount and returns the result.
     *
     * @param amount The amount to apply the factor to.
     * @param factor The factor to apply.
     * @return The result of applying the factor to the amount.
     */
    function applyFactor(uint256 amount, uint256 factor) internal pure returns (uint256) {
        return amount * factor / FLOAT_PRECISION;
    }

    /**
     * Applies the given factor to the given amount and returns the result.
     *
     * @param amount The amount to apply the factor to.
     * @param factor The factor to apply.
     * @return The result of applying the factor to the amount.
     */
    function applyFactor(uint256 amount, int256 factor) internal pure returns (int256) {
        return amount.toInt256() * factor / FLOAT_PRECISION.toInt256();
    }

    function toFactor(uint256 amount, uint256 divisor) internal pure returns (uint256) {
        return amount * FLOAT_PRECISION / divisor;
    }

    /**
     * Converts the given amount from float to wei.
     *
     * @param amount The amount to convert.
     * @return The converted amount in wei.
     */
    function floatToWei(uint256 amount) internal pure returns (uint256) {
        return amount / FLOAT_TO_WEI_DIVISOR;
    }

    /**
     * Converts the given amount from wei to float.
     *
     * @param amount The amount to convert.
     * @return The converted amount in float.
     */
    function weiToFloat(uint256 amount) internal pure returns (uint256) {
        return amount * FLOAT_TO_WEI_DIVISOR;
    }

    /**
     * Converts the given number of basis points to float.
     *
     * @param basisPoints The number of basis points to convert.
     * @return The converted amount in float.
     */
    function basisPointsToFloat(uint256 basisPoints) internal pure returns (uint256) {
        return basisPoints * FLOAT_PRECISION / BASIS_POINTS_DIVISOR;
    }
}
