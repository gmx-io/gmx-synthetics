// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { RoleStore } from "../role/RoleStore.sol";
import { RoleModule } from "../role/RoleModule.sol";
import { DataStore } from "../data/DataStore.sol";
import { Keys } from "../data/Keys.sol";
import { Oracle } from "../oracle/Oracle.sol";
import { OracleModule } from "../oracle/OracleModule.sol";
import { EventEmitter } from "../event/EventEmitter.sol";
import { Errors } from "../error/Errors.sol";
import { GlobalReentrancyGuard } from "../utils/GlobalReentrancyGuard.sol";
import { ExchangeRouter } from "../router/ExchangeRouter.sol";

import { MultichainVault } from "./MultichainVault.sol";
import { MultichainUtils } from "./MultichainUtils.sol";
import { MultichainEventUtils } from "./MultichainEventUtils.sol";

/**
 * @title MultichainVaultHandler
 */
contract MultichainVaultHandler is RoleModule, GlobalReentrancyGuard, OracleModule {
    using SafeERC20 for IERC20;

    MultichainVault public multichainVault;
    EventEmitter public eventEmitter;
    ExchangeRouter public exchangeRouter;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        MultichainVault _multichainVault,
        ExchangeRouter _exchangeRouter
    ) RoleModule(_roleStore) GlobalReentrancyGuard(_dataStore) OracleModule(_oracle) {
        multichainVault = _multichainVault;
        eventEmitter = _eventEmitter;
        exchangeRouter = _exchangeRouter;
    }

    /**
     * Executes the multicall for the given args
     * The multicall arguments contains the function calls to be executed (e.g. createDeposit, createOrder, createWithdrawal, etc)
     * @param account user address on the source chain
     * @param srcChainId chain id of the source chain
     * @param multicallArgs array of bytes containing the multicall arguments
     */
    function executeMulticall(
        address account,
        uint256 srcChainId,
        bytes[] calldata multicallArgs
    ) external onlyController {
        // execute multicall
        exchangeRouter.multicall(multicallArgs);

        MultichainEventUtils.emitMultichainMessage(eventEmitter, account, srcChainId);
    }
}
