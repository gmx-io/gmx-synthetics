// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";
import "./EventUtils.sol";

// @title EventEmitter
// @dev Contract to emit events
// This allows main events to be emitted from a single contract
// Logic contracts can be updated while re-using the same eventEmitter contract
// Peripheral services like monitoring or analytics would be able to continue
// to work without an update and without segregating historical data
contract EventEmitter2 is RoleModule {
    event Log(
        string eventName,
        EventUtils.AddressItems addressItems,
        EventUtils.UintItems uintItems,
        EventUtils.IntItems intItems,
        EventUtils.BoolItems boolItems,
        EventUtils.Bytes32Items bytes32Items,
        EventUtils.DataItems dataItems
    );

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function log(
        string memory eventName,
        EventUtils.AddressItems memory addressItems,
        EventUtils.UintItems memory uintItems,
        EventUtils.IntItems memory intItems,
        EventUtils.BoolItems memory boolItems,
        EventUtils.Bytes32Items memory bytes32Items,
        EventUtils.DataItems memory dataItems
    ) external onlyController {
        emit Log(
            eventName,
            addressItems,
            uintItems,
            intItems,
            boolItems,
            bytes32Items,
            dataItems
        );
    }
}
