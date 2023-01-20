// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title Role
 * @dev Library for role keys
 */
library Role {
    /**
     * @dev The ROLE_ADMIN role.
     */
    bytes32 public constant ROLE_ADMIN = keccak256(abi.encode("ROLE_ADMIN"));

    /**
     * @dev The TIMELOCK_ADMIN role.
     */
    bytes32 public constant TIMELOCK_ADMIN = keccak256(abi.encode("TIMELOCK_ADMIN"));

    /**
     * @dev The TIMELOCK_MULTISIG role.
     */
    bytes32 public constant TIMELOCK_MULTISIG = keccak256(abi.encode("TIMELOCK_MULTISIG"));

    /**
     * @dev The CONFIG_KEEPER role.
     */
    bytes32 public constant CONFIG_KEEPER = keccak256(abi.encode("CONFIG_KEEPER"));

    /**
     * @dev The CONTROLLER role.
     */
    bytes32 public constant CONTROLLER = keccak256(abi.encode("CONTROLLER"));

    /**
     * @dev The ROUTER_PLUGIN role.
     */
    bytes32 public constant ROUTER_PLUGIN = keccak256(abi.encode("ROUTER_PLUGIN"));

    /**
     * @dev The MARKET_KEEPER role.
     */
    bytes32 public constant MARKET_KEEPER = keccak256(abi.encode("MARKET_KEEPER"));

    /**
     * @dev The FEE_KEEPER role.
     */
    bytes32 public constant FEE_KEEPER = keccak256(abi.encode("FEE_KEEPER"));

    /**
     * @dev The ORDER_KEEPER role.
     */
    bytes32 public constant ORDER_KEEPER = keccak256(abi.encode("ORDER_KEEPER"));

    /**
     * @dev The FROZEN_ORDER_KEEPER role.
     */
    bytes32 public constant FROZEN_ORDER_KEEPER = keccak256(abi.encode("FROZEN_ORDER_KEEPER"));

    /**
     * @dev The PRICING_KEEPER role.
     */
    bytes32 public constant PRICING_KEEPER = keccak256(abi.encode("PRICING_KEEPER"));
    /**
     * @dev The LIQUIDATION_KEEPER role.
     */
    bytes32 public constant LIQUIDATION_KEEPER = keccak256(abi.encode("LIQUIDATION_KEEPER"));
    /**
     * @dev The ADL_KEEPER role.
     */
    bytes32 public constant ADL_KEEPER = keccak256(abi.encode("ADL_KEEPER"));
}
