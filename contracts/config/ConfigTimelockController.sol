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
import {PositionImpactPoolUtils} from "../market/PositionImpactPoolUtils.sol";
import {Chain} from "../chain/Chain.sol";
import {AccountUtils} from "../utils/AccountUtils.sol";

contract ConfigTimelockController is TimelockController, OracleModule {

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        Oracle oracle,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) TimelockController(minDelay, proposers, executors, msg.sender) OracleModule(oracle) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) {
            revert Errors.Unauthorized(msg.sender, "SELF");
        }
        _;
    }

    // note that if on-chain prices are used for market operations, there may
    // be some difference in pricing between the on-chain price and e.g.
    // an off-chain data stream price
    // it should be ensured that the changes to the market token price that
    // result from this execution are not too large that it would lead to
    // significant arbitrage opportunities
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
    ) external onlySelf {
        PositionImpactPoolUtils.withdrawFromPositionImpactPool(
            dataStore,
            eventEmitter,
            oracle,
            market,
            receiver,
            amount
        );
    }

    function reduceLentImpactAmount(
        address market,
        address fundingAccount,
        uint256 reductionAmount
    ) external onlySelf {
        PositionImpactPoolUtils.reduceLentAmount(
            dataStore,
            eventEmitter,
            oracle,
            market,
            fundingAccount,
            reductionAmount
        );
    }
}
