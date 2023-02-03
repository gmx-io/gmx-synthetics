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

    error InvalidClaimFeesInput(uint256 marketsLength, uint256 tokensLength);

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    // @dev claim fees from the specified markets
    // @param markets the markets to claim fees from
    // @param tokens the fee tokens to claim
    function claimFees(
        address[] memory markets,
        address[] memory tokens
    ) external nonReentrant onlyFeeKeeper {
        if (markets.length != tokens.length) {
            revert InvalidClaimFeesInput(markets.length, tokens.length);
        }

        address receiver = dataStore.getAddress(Keys.FEE_RECEIVER);

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
