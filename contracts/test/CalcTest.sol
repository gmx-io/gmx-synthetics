
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Calc.sol";

contract CalcTest {
    function boundMagnitude(int256 value, uint256 min, uint256 max) external pure returns (int256) {
        return Calc.boundMagnitude(value, min, max);
    }
}
