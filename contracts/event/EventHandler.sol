// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./EventEmitter.sol";

// @title EventHandler
// @dev Contract to emit events via EventEmitter using the EVENT_CONTROLLER role
// Emitting events directly via EventEmitter requires having the CONTROLLER role
// This allows contracts that should not have the CONTROLLER role to emit events
contract EventHandler is RoleModule {
    EventEmitter public immutable eventEmitter;

    constructor(RoleStore _roleStore, EventEmitter _eventEmitter) RoleModule(_roleStore) {
        eventEmitter = _eventEmitter;
    }

    // @dev emit a general event log
    // @param eventName the name of the event
    // @param eventData the event data
    function emitEventLog(
        string memory eventName,
        EventUtils.EventLogData memory eventData
    ) external onlyEventController {
        eventEmitter.emitEventLog(msg.sender, eventName, eventData);
    }

    // @dev emit a general event log
    // @param eventName the name of the event
    // @param topic1 topic1 for indexing
    // @param eventData the event data
    function emitEventLog1(
        string memory eventName,
        bytes32 topic1,
        EventUtils.EventLogData memory eventData
    ) external onlyEventController {
        eventEmitter.emitEventLog1(msg.sender, eventName, topic1, eventData);
    }

    // @dev emit a general event log
    // @param eventName the name of the event
    // @param topic1 topic1 for indexing
    // @param topic2 topic2 for indexing
    // @param eventData the event data
    function emitEventLog2(
        string memory eventName,
        bytes32 topic1,
        bytes32 topic2,
        EventUtils.EventLogData memory eventData
    ) external onlyEventController {
        eventEmitter.emitEventLog2(msg.sender, eventName, topic1, topic2, eventData);
    }
}
