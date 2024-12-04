// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../oracle/OracleModule.sol";
import "../role/RoleModule.sol";
import "../utils/GlobalReentrancyGuard.sol";

/**
 * @title MultichainHandler
 */
import { RoleStore } from "../role/RoleStore.sol";
import { DataStore } from "../data/DataStore.sol";
import { EventEmitter } from "../event/EventEmitter.sol";
import { Oracle } from "../oracle/Oracle.sol";
import { Keys } from "../data/Keys.sol";
import { MultichainVault } from "./MultichainVault.sol";
import { MultichainUtils } from "./MultichainUtils.sol";
import { MultichainEventUtils } from "./MultichainEventUtils.sol";

import {PayableMulticall} from "../utils/PayableMulticall.sol"; // TODO: what contract is this?

contract MultichainHandler is RoleModule, GlobalReentrancyGuard, OracleModule {
    MultichainVault public multichainVault;
    EventEmitter public eventEmitter;
    PayableMulticall public payableMulticall;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        MultichainVault _multichainVault,
        PayableMulticall _payableMulticall
    ) RoleModule(_roleStore) GlobalReentrancyGuard(_dataStore) OracleModule(_oracle) {
        multichainVault = _multichainVault;
        eventEmitter = _eventEmitter;
        payableMulticall = _payableMulticall;
    }

    /**
     * Record a deposit from another chain
     * @dev this contract needs controller role in order to record deposits
     * @param account user address on the source chain
     * @param token address of the token being deposited
     * @param sourceChainId chain id of the source chain
     */
    function recordDeposit(address account, address token, uint256 sourceChainId) external onlyController() {
        // token should have been transferred to multichainVault by IMultichainProvider
        uint256 amount = multichainVault.recordTransferIn(token);
        if (amount == 0) {
            revert Errors.EmptyMultichainAmount();
        }

        address virtualAccount = MultichainUtils.getVirtualAccount(account, sourceChainId);

        dataStore.incrementUint(Keys.multichainBalanceKey(virtualAccount, token), amount);

        MultichainEventUtils.emitMultichainDeposit(eventEmitter, token, virtualAccount, amount, sourceChainId);
    }

    function executeMessage(
        address account,
        uint256 sourceChainId,
        bytes[] calldata multicallArgs
    ) external onlyController() {
        address virtualAccount = MultichainUtils.getVirtualAccount(account, sourceChainId);

        // execute multicall
        payableMulticall.multicall(multicallArgs);

        MultichainEventUtils.emitMultichainMessageReceived(eventEmitter, virtualAccount, sourceChainId);
    }
}
