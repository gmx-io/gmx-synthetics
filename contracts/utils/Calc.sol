// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SignedMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

library Calc {
    using SignedMath for int256;

    function diff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }

    function sum(uint256 a, int256 b) internal pure returns (uint256) {
        if (b > 0) {
            return a + b.abs();
        }

        return a - b.abs();
    }

    function sum(int256 a, uint256 b) internal pure returns (int256) {
        return a + SafeCast.toInt256(b);
    }

    function toSigned(uint256 a, bool isPositive) internal pure returns (int256) {
        if (isPositive) {
            return SafeCast.toInt256(a);
        } else {
            return -SafeCast.toInt256(a);
        }
    }
}
