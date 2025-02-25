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

contract ConfigTimelockController is TimelockController {

    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors
    ) TimelockController(minDelay, proposers, executors, msg.sender) {}

    function signal(address target, bytes calldata payload) external override onlyRole(PROPOSER_ROLE) {
        schedule(
            target,
            0,
            payload,
            0,
            0,
            getMinDelay()
        );
    }

    function signalBatch(
        address[] calldata targets,
        bytes[] calldata payloads,
        uint256[] calldata values
    ) external override onlyRole(PROPOSER_ROLE) {
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
