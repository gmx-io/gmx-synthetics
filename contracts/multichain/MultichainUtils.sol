// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";

import "./MultichainVault.sol";
import "./MultichainEventUtils.sol";

/**
 * @title MultichainUtils
 */
library MultichainUtils {
    using SafeERC20 for IERC20;

     /**
     * Records a deposit from another chain. IMultichainProvider has CONTROLLER role
     * @param account user address on the source chain
     * @param token address of the token being deposited
     * @param srcChainId id of the source chain
     */
    function recordTransferIn(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MultichainVault multichainVault,
        address token,
        address account,
        uint256 srcChainId
    ) internal {
        // token should have been transferred to multichainVault by IMultichainProvider
        uint256 amount = multichainVault.recordTransferIn(token);
        if (amount == 0) {
            revert Errors.EmptyMultichainTransferInAmount();
        }

        dataStore.incrementUint(Keys.multichainBalanceKey(account, token), amount);

        MultichainEventUtils.emitMultichainTransferIn(eventEmitter, token, account, amount, srcChainId);
    }

    /**
     * @dev transfer the specified amount of tokens from account to receiver
     * @param token the token to transfer
     * @param account the account to transfer from
     * @param receiver the account to transfer to
     * @param amount the amount of tokens to transfer
     */
    function transferOut(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address token,
        address account,
        address receiver,
        uint256 amount,
        uint256 srcChainId
    ) internal {
        if (amount == 0) {
            revert Errors.EmptyMultichainTransferOutAmount();
        }

        bytes32 balanceKey = Keys.multichainBalanceKey(account, token);

        uint256 balance = dataStore.getUint(balanceKey);
        if (balance < amount) {
            revert Errors.InsufficientMultichainBalance();
        }

        IERC20(token).safeTransferFrom(account, receiver, amount);
        dataStore.decrementUint(Keys.multichainBalanceKey(account, token), amount);
        MultichainEventUtils.emitMultichainTransferOut(eventEmitter, token, account, amount, srcChainId);
    }
}
