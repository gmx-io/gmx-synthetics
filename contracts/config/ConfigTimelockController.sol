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
import {OracleModule} from "../oracle/OracleModule.sol";

contract ConfigTimelockController is TimelockController, OracleModule {

    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors
    ) TimelockController(minDelay, proposers, executors, msg.sender) {}

    function executeAtomicWithOraclePrices(
        address target,
        uint256 value,
        bytes calldata payload
    ) external onlyRoleOrOpenRole(EXECUTOR_ROLE) withOraclePricesForAtomicAction {
        execute(target, value, payload, 0, 0);
    }

    function withdrawFromPositionImpactPool(
    ) internal {

    }
}
