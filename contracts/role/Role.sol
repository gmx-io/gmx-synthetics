// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library Role {
    bytes32 public constant CONTROLLER = keccak256("CONTROLLER");
    bytes32 public constant ROUTER_PLUGIN = keccak256("ROUTER_PLUGIN");
    bytes32 public constant MARKET_KEEPER = keccak256("MARKET_KEEPER");
    bytes32 public constant ORDER_KEEPER = keccak256("ORDER_KEEPER");
    bytes32 public constant PRICING_KEEPER = keccak256("PRICING_KEEPER");
    bytes32 public constant LIQUIDATION_KEEPER = keccak256("LIQUIDATION_KEEPER");
}
