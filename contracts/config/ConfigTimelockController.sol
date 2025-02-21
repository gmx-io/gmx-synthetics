// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {DataStore} from "../data/DataStore.sol";
import {Keys} from "../data/Keys.sol";
import {Errors} from "../error/Errors.sol";
import {EventEmitter} from "../event/EventEmitter.sol";
import {EventUtils} from "../event/EventUtils.sol";
import {Multicall3} from "../mock/Multicall3.sol";
import {OracleStore} from "../oracle/OracleStore.sol";
import {RoleStore} from "../role/RoleStore.sol";
import {Precision} from "../utils/Precision.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ITimelockController} from "./ITimelockController.sol";

contract ConfigTimelockController is TimelockController, ITimelockController {

    constructor(
        uint256 minDelay
    ) TimelockController(minDelay, address[](0), address[](0), msg.sender) {}

    function signal(address target, bytes32 callData) external override onlyRole(PROPOSER_ROLE) {
        schedule(
            target,
            0,
            callData,
            0,
            0,
            getMinDelay()
        );
    }

    function signalBatch(
        address[] calldata targets, bytes32[] calldata payloads
    ) external override onlyRole(PROPOSER_ROLE) {
        uint256 values = new uint256[](targets.length);
        scheduleBatch(
            targets,
            values,
            payloads,
            0,
            0,
            getMinDelay()
        );
    }
}
