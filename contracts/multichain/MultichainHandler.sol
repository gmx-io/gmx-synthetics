// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../oracle/OracleModule.sol";
import "../role/RoleModule.sol";
import "../utils/GlobalReentrancyGuard.sol";

import { RoleStore } from "../role/RoleStore.sol";
import { DataStore } from "../data/DataStore.sol";
import { EventEmitter } from "../event/EventEmitter.sol";
import { Oracle } from "../oracle/Oracle.sol";
import { Keys } from "../data/Keys.sol";
import { MultichainVault } from "./MultichainVault.sol";
import { MultichainUtils } from "./MultichainUtils.sol";
import { MultichainEventUtils } from "./MultichainEventUtils.sol";

import { PayableMulticall } from "../utils/PayableMulticall.sol"; // TODO: what contract is this?

/**
 * @title MultichainHandler
 */
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
     * @param account user address on the source chain
     * @param token address of the token being deposited
     * @param sourceChainId chain id of the source chain
     */
    function recordDeposit(address account, address token, uint256 sourceChainId) external onlyMultichainController {
        // token should have been transferred to multichainVault by IMultichainProvider
        uint256 amount = multichainVault.recordTransferIn(token);
        if (amount == 0) {
            revert Errors.EmptyMultichainDepositAmount();
        }

        address virtualAccount = MultichainUtils.getVirtualAccount(account, sourceChainId);

        dataStore.incrementUint(Keys.multichainBalanceKey(virtualAccount, token), amount);

        MultichainEventUtils.emitMultichainDeposit(eventEmitter, token, virtualAccount, amount, sourceChainId);
    }

    /**
     * Record a message from another chain. Executes a multicall.
     * The multicall arguments contains the function calls to be executed (e.g. createDeposit, createOrder, createWithdrawal, etc)
     * @param account user address on the source chain
     * @param sourceChainId chain id of the source chain
     * @param multicallArgs array of bytes containing the multicall arguments
     */
    function executeMulticall(
        address account,
        uint256 sourceChainId,
        bytes[] calldata multicallArgs
    ) external onlyMultichainController {
        address virtualAccount = MultichainUtils.getVirtualAccount(account, sourceChainId);

        // execute multicall
        payableMulticall.multicall(multicallArgs);

        MultichainEventUtils.emitMultichainMessage(eventEmitter, virtualAccount, sourceChainId);
    }

    /**
     * Record a withdrawal to another chain
     * @param account user address on the source chain
     * @param token address of the token being withdrawn
     * @param amount amount of token being withdrawn
     * @param sourceChainId chain id of the source chain
     */
    function recordWithdrawal(address account, address token, uint256 amount, uint256 sourceChainId, bytes[] memory multicallArgs) external onlyMultichainController {
        if (amount == 0) {
            revert Errors.EmptyMultichainWithdrawalAmount();
        }

        address virtualAccount = MultichainUtils.getVirtualAccount(account, sourceChainId);
        bytes32 balanceKey = Keys.multichainBalanceKey(virtualAccount, token);

        uint256 balance = dataStore.getUint(balanceKey);
        if (balance < amount) {
            revert Errors.InsufficientMultichainBalance();
            // should amount be capped instead of reverting? i.e. amount = balance;
        }

        dataStore.decrementUint(balanceKey, amount);

        // transfer tokens to IMultichainProvider
        multichainVault.transferOut(token, msg.sender, amount);

        MultichainEventUtils.emitMultichainWithdrawal(eventEmitter, token, virtualAccount, amount, sourceChainId);
    }
}
