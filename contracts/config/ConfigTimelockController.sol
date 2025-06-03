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
import {MarketPositionImpactPoolUtils} from "../market/MarketPositionImpactPoolUtils.sol";
import {Chain} from "../chain/Chain.sol";

contract ConfigTimelockController is TimelockController, OracleModule {

    DataStore public immutable dataStore;

    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        Oracle oracle,
        DataStore _dataStore
    ) TimelockController(minDelay, proposers, executors, msg.sender) OracleModule(oracle) {
        dataStore = _dataStore;
    }

    function executeWithOraclePrices(
        address target,
        uint256 value,
        bytes calldata payload,
        bytes32 predecessor,
        bytes32 salt,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external onlyRoleOrOpenRole(EXECUTOR_ROLE) withOraclePricesForAtomicAction(oracleParams) {
        execute(target, value, payload, predecessor, salt);
    }

    function withdrawFromPositionImpactPool(
        address market,
        address receiver,
        uint256 amount
    ) external  {
        if (msg.sender != address(this)) {
            revert Errors.Unauthorized(msg.sender, "self");
        }
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
