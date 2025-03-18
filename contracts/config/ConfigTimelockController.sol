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
import {OracleUtils} from "../oracle/OracleUtils.sol";
import {Oracle} from "../oracle/Oracle.sol";
import { MarketPositionImpactPoolUtils } from "../market/MarketPositionImpactPoolUtils.sol";

contract ConfigTimelockController is TimelockController, OracleModule {

    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        Oracle oracle
    ) TimelockController(minDelay, proposers, executors, msg.sender) OracleModule(oracle) {}

    function executeAtomicWithOraclePrices(
        address target,
        uint256 value,
        bytes calldata payload,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external onlyRoleOrOpenRole(EXECUTOR_ROLE) withOraclePricesForAtomicAction(oracleParams) {
        execute(target, value, payload, 0, 0);
    }

    function withdrawFromPositionImpactPool(
        address market,
        address receiver,
        uint256 amount
    ) external  {
        require(msg.sender == address(this), "TimelockController: caller must be timelock");
        MarketPositionImpactPoolUtils.withdrawFromPositionImpactPool(
            oracle.dataStore(),
            oracle.eventEmitter(),
            market,
            receiver,
            amount,
            oracle
        );

    }
}
