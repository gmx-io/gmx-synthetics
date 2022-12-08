// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SignedMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * @title Calc
 * @dev Library for math functions
 */
library Calc {
    using SignedMath for int256;
    using SafeCast for uint256;

    /**
     * @dev Calculates the absolute difference between two numbers.
     *
     * @param a the first number
     * @param b the second number
     * @return the absolute difference between the two numbers
     */
    function diff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }


    /**
     * @dev Calculates the result of dividing the first number by the second number,
     * rounded up to the nearest integer.
     *
     * @param a the dividend
     * @param b the divisor
     * @return the result of dividing the first number by the second number, rounded up to the nearest integer
     */
    function roundUpDivision(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    /**
     * Calculates the result of dividing the first number by the second number,
     * rounded up to the nearest integer.
     *
     * @param a the dividend
     * @param b the divisor
     * @return the result of dividing the first number by the second number, rounded up to the nearest integer
     */
    function roundUpDivision(int256 a, uint256 b) internal pure returns (int256) {
        if (a < 0) {
            return (a - b.toInt256() + 1) / b.toInt256();
        }

        return (a + b.toInt256() - 1) / b.toInt256();
    }

    /**
     * Adds two numbers together, treating the second number as a signed integer.
     *
     * @param a the first number
     * @param b the second number
     * @return the result of adding the two numbers together
     */
    function sum(uint256 a, int256 b) internal pure returns (uint256) {
        if (b > 0) {
            return a + b.abs();
        }

        return a - b.abs();
    }

    /**
     * Adds two numbers together, treating the second number as an unsigned integer.
     *
     * @param a the first number
     * @param b the second number
     * @return the result of adding the two numbers together
     */
    function sum(int256 a, uint256 b) internal pure returns (int256) {
        return a + b.toInt256();
    }


    /**
     * Converts the given unsigned integer to a signed integer, using the given
     * flag to determine whether the result should be positive or negative.
     *
     * @param a the unsigned integer to convert
     * @param isPositive whether the result should be positive (if true) or negative (if false)
     * @return the signed integer representation of the given unsigned integer
     */
    function toSigned(uint256 a, bool isPositive) internal pure returns (int256) {
        if (isPositive) {
            return a.toInt256();
        } else {
            return -a.toInt256();
        }
    }
}
