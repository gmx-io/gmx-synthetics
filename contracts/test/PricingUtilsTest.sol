// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../pricing/PricingUtils.sol";

contract PricingUtilsTest {
    function applyImpactFactor(
        uint256 diffUsd,
        uint256 impactFactor,
        uint256 impactExponentFactor
    ) external pure returns (uint256) {
        return PricingUtils.applyImpactFactor(diffUsd, impactFactor, impactExponentFactor);
    }
}

