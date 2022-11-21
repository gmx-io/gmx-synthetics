// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library Role {
    bytes32 public constant CONTROLLER = keccak256(abi.encode("CONTROLLER"));
    bytes32 public constant ROUTER_PLUGIN = keccak256(abi.encode("ROUTER_PLUGIN"));
    bytes32 public constant MARKET_KEEPER = keccak256(abi.encode("MARKET_KEEPER"));
    bytes32 public constant ORDER_KEEPER = keccak256(abi.encode("ORDER_KEEPER"));
    bytes32 public constant FROZEN_ORDER_KEEPER = keccak256(abi.encode("FROZEN_ORDER_KEEPER"));
    bytes32 public constant PRICING_KEEPER = keccak256(abi.encode("PRICING_KEEPER"));
    bytes32 public constant LIQUIDATION_KEEPER = keccak256(abi.encode("LIQUIDATION_KEEPER"));
    bytes32 public constant ADL_KEEPER = keccak256(abi.encode("ADL_KEEPER"));
}
