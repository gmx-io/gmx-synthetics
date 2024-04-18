// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";
import "../role/RoleModule.sol";
import "../utils/GlobalReentrancyGuard.sol";

contract BaseHandler is RoleModule, GlobalReentrancyGuard, OracleModule {
    EventEmitter public immutable eventEmitter;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle
    ) RoleModule(_roleStore) GlobalReentrancyGuard(_dataStore) OracleModule(_oracle) {
        eventEmitter = _eventEmitter;
    }

    receive() external payable {
        address wnt = dataStore.getAddress(Keys.WNT);
        if (msg.sender != wnt) {
            revert Errors.InvalidNativeTokenSender(msg.sender);
        }
    }
}
