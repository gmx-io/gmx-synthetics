// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../data/DataStore.sol";
import "../role/RoleModule.sol";
import "../fee/FeeUtils.sol";

// @title FeeHandler
contract FeeHandler is ReentrancyGuard, RoleModule {
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    function claimFees(
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external nonReentrant onlyFeeKeeper {
        if (markets.length != tokens.length) {
            revert("Invalid input");
        }

        for (uint256 i = 0; i < markets.length; i++) {
            FeeUtils.claimFees(
                dataStore,
                eventEmitter,
                markets[i],
                tokens[i],
                receiver
            );
        }
    }
}
