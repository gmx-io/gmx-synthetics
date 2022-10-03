// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

library Precision {
    using SafeCast for uint256;

    uint256 public constant FLOAT_PRECISION = 10 ** 30;
    uint256 public constant WEI_PRECISION = 10 ** 18;

    uint256 public constant FLOAT_TO_WEI_DIVISOR = 10 ** 12;

    function applyFactor(uint256 amount, uint256 factor) internal pure returns (uint256) {
        return amount * factor / FLOAT_PRECISION;
    }

    function applyFactor(uint256 amount, int256 factor) internal pure returns (int256) {
        return amount.toInt256() * factor / FLOAT_PRECISION.toInt256();
    }

    function floatToWei(uint256 amount) internal pure returns (uint256) {
        return amount / FLOAT_TO_WEI_DIVISOR;
    }

    function weiToFloat(uint256 amount) internal pure returns (uint256) {
        return amount * FLOAT_TO_WEI_DIVISOR;
    }
}
