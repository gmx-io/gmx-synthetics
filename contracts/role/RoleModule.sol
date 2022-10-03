// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./RoleStore.sol";
import "./Role.sol";
import "../gov/Governable.sol";

contract RoleModule is Governable {
    RoleStore public roleStore;

    constructor(RoleStore _roleStore) {
        roleStore = _roleStore;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) {
            revert Unauthorized(msg.sender, "SELF");
        }
        _;
    }

    modifier onlyController() {
        if (!roleStore.hasRole(msg.sender, Role.CONTROLLER)) {
            revert Unauthorized(msg.sender, "CONTROLLER");
        }
        _;
    }

    modifier onlyRouterPlugin() {
        require(roleStore.hasRole(msg.sender, Role.ROUTER_PLUGIN), "Role: ROUTER_PLUGIN");
        _;
    }

    modifier onlyMarketKeeper() {
        require(roleStore.hasRole(msg.sender, Role.MARKET_KEEPER), "Role: MARKET_KEEPER");
        _;
    }

    modifier onlyOrderKeeper() {
        require(roleStore.hasRole(msg.sender, Role.ORDER_KEEPER), "Role: ORDER_KEEPER");
        _;
    }

    modifier onlyPricingKeeper() {
        require(roleStore.hasRole(msg.sender, Role.PRICING_KEEPER), "Role: PRICING_KEEPER");
        _;
    }

    modifier onlyLiquidationKeeper() {
        require(roleStore.hasRole(msg.sender, Role.LIQUIDATION_KEEPER), "Role: LIQUIDATION_KEEPER");
        _;
    }
}
