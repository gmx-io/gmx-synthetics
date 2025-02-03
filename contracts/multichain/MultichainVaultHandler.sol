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
     * Records a deposit from another chain. IMultichainProvider has CONTROLLER role
     * @param account user address on the source chain
     * @param token address of the token being deposited
     * @param multichainId chain id of the destination chain
     */
    function recordDeposit(
        address account,
        address token,
        uint256 multichainId
    ) external onlyController {
        // token should have been transferred to multichainVault by IMultichainProvider
        uint256 amount = multichainVault.recordTransferIn(token);
        if (amount == 0) {
            revert Errors.EmptyMultichainDepositAmount();
        }

        dataStore.incrementUint(Keys.multichainBalanceKey(multichainId, account, token), amount);

        MultichainEventUtils.emitMultichainDeposit(eventEmitter, token, account, amount, multichainId);
    }

    /**
     * @dev transfer the specified amount of tokens from account to receiver
     * @param token the token to transfer
     * @param account the account to transfer from
     * @param receiver the account to transfer to
     * @param amount the amount of tokens to transfer
     */
    function pluginTransfer(address token, address account, address receiver, uint256 amount) external onlyRouterPlugin { // TODO: confirm access control
        IERC20(token).safeTransferFrom(account, receiver, amount);
    }

    /**
     * Executes the multicall for the given args
     * The multicall arguments contains the function calls to be executed (e.g. createDeposit, createOrder, createWithdrawal, etc)
     * @param account user address on the source chain
     * @param multichainId chain id of the destination chain
     * @param multicallArgs array of bytes containing the multicall arguments
     */
    function executeMulticall(
        address account,
        uint256 multichainId,
        bytes[] calldata multicallArgs
    ) external onlyController {
        // execute multicall
        exchangeRouter.multicall(multicallArgs);

        MultichainEventUtils.emitMultichainMessage(eventEmitter, account, multichainId);
    }

    /**
     * Record a withdrawal to another chain. IMultichainProvider has CONTROLLER role
     * @param account user address on the source chain
     * @param token address of the token being withdrawn
     * @param amount amount of token being withdrawn
     * @param multichainId chain id of the destination chain
     */
    function recordWithdrawal(
        address account,
        address token,
        uint256 amount,
        uint256 multichainId
    ) external onlyController {
        if (amount == 0) {
            revert Errors.EmptyMultichainWithdrawalAmount();
        }

        bytes32 balanceKey = Keys.multichainBalanceKey(multichainId, account, token);

        uint256 balance = dataStore.getUint(balanceKey);
        if (balance < amount) {
            revert Errors.InsufficientMultichainBalance();
            // TODO: should amount be capped instead of reverting? i.e. amount = balance;
        }

        dataStore.decrementUint(balanceKey, amount);

        // transfer tokens to IMultichainProvider
        multichainVault.transferOut(token, msg.sender, amount);

        MultichainEventUtils.emitMultichainWithdrawal(eventEmitter, token, account, amount, multichainId);
    }
}
