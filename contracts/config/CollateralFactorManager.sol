// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../role/RoleModule.sol";

// @title CollateralFactorManager
contract CollateralFactorManager is RoleModule {

    DataStore public immutable dataStore;

    event MinCollateralFactorForLiquidationSet(address sender, address market, uint256 value);

    modifier onlyKeeper() {
        if (
            !roleStore.hasRole(msg.sender, Role.LIMITED_CONFIG_KEEPER) &&
            !roleStore.hasRole(msg.sender, Role.CONFIG_KEEPER)
        ) {
            revert Errors.Unauthorized(msg.sender, "LIMITED / CONFIG KEEPER");
        }

        _;
    }

    constructor(DataStore _dataStore, RoleStore _roleStore) RoleModule(_roleStore) {
        dataStore = _dataStore;
    }

    function setMinCollateralFactorForLiquidation(address market, uint256 value) external onlyKeeper {
        dataStore.setUint(Keys.minCollateralFactorForLiquidationKey(market), value);

        emit MinCollateralFactorForLiquidationSet(msg.sender, market, value);
    }
}
