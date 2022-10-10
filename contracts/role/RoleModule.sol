// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./RoleStore.sol";
import "./Role.sol";
import "../gov/Governable.sol";

contract RoleModule is Governable {
    RoleStore immutable roleStore;

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
        _validateRole(Role.CONTROLLER, "CONTROLLER");
        _;
    }

    modifier onlyRouterPlugin() {
        _validateRole(Role.ROUTER_PLUGIN, "ROUTER_PLUGIN");
        _;
    }

    modifier onlyMarketKeeper() {
        _validateRole(Role.MARKET_KEEPER, "MARKET_KEEPER");
        _;
    }

    modifier onlyOrderKeeper() {
        _validateRole(Role.ORDER_KEEPER, "ORDER_KEEPER");
        _;
    }

    modifier onlyPricingKeeper() {
        _validateRole(Role.PRICING_KEEPER, "PRICING_KEEPER");
        _;
    }

    modifier onlyLiquidationKeeper() {
        _validateRole(Role.LIQUIDATION_KEEPER, "LIQUIDATION_KEEPER");
        _;
    }

    function _validateRole(bytes32 role, string memory roleName) internal view {
        if (!roleStore.hasRole(msg.sender, role)) {
            revert Unauthorized(msg.sender, roleName);
        }
    }
}
