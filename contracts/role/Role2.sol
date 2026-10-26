// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title Role2
 * @dev Auxiliary library for risk-oracle key
 */
library Role2 {
    /**
   * @dev The RISK_ORACLE role.
     */
    bytes32 public constant RISK_ORACLE = keccak256(abi.encode("RISK_ORACLE"));
}
