// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";

import "./MultichainVault.sol";
import "./MultichainEventUtils.sol";
import "./IMultichainProvider.sol";

/**
 * @title MultichainUtils
 */
library MultichainUtils {
    using SafeERC20 for IERC20;

    /**
     * Records a deposit from another chain. IMultichainProvider has CONTROLLER role
     * @param multichainProvider the multichain provider contract
     * @param token address of the token being deposited
     * @param account user address on the source chain
     * @param srcChainId id of the source chain
     */
    function recordBridgeIn(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MultichainVault multichainVault,
        IMultichainProvider multichainProvider,
        address token,
        address account,
        uint256 srcChainId
    ) external {
        // token should have been transferred to multichainVault by IMultichainProvider
        uint256 amount = multichainVault.recordTransferIn(token);

        if (amount == 0) {
            revert Errors.EmptyMultichainTransferInAmount(account, token);
        }

        _increaseMultichainBalance(dataStore, eventEmitter, account, token, amount, srcChainId);

        MultichainEventUtils.emitMultichainBridgeIn(
            eventEmitter,
            address(multichainProvider),
            token,
            account,
            amount,
            srcChainId
        );
    }

    /**
     * Records a transfer of tokens into the multichain vault
     * @param account user address on the source chain
     * @param token address of the token being transferred
     * @param srcChainId id of the source chain
     */
    function recordTransferIn(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MultichainVault multichainVault,
        address token,
        address account,
        uint256 srcChainId
    ) external returns (uint256) {
        // token should have been transferred to multichainVault
        uint256 amount = multichainVault.recordTransferIn(token);
        if (amount == 0) {
            return 0;
        }

        _increaseMultichainBalance(dataStore, eventEmitter, account, token, amount, srcChainId);

        return amount;
    }

    function _increaseMultichainBalance(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address token,
        uint256 amount,
        uint256 srcChainId
    ) private {
        dataStore.incrementUint(Keys.multichainBalanceKey(account, token), amount);
        MultichainEventUtils.emitMultichainTransferIn(eventEmitter, token, account, amount, srcChainId);
    }

    /**
     * @dev transfer the specified amount of tokens from user's multichain balance to receiver
     * @param token the token to transfer
     * @param account the account for which the multichain balance is decreased
     * @param receiver the account to transfer to
     * @param amount the amount of tokens to transfer
     * @param srcChainId the source chain id
     */
    function transferOut(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MultichainVault multichainVault,
        address token,
        address account,
        address receiver,
        uint256 amount,
        uint256 srcChainId
    ) external {
        if (amount == 0) {
            return;
        }

        uint256 balance = getMultichainBalanceAmount(dataStore, account, token);
        if (balance < amount) {
            revert Errors.InsufficientMultichainBalance(account, token, balance, amount);
        }

        dataStore.decrementUint(Keys.multichainBalanceKey(account, token), amount);
        multichainVault.transferOut(token, receiver, amount);
        MultichainEventUtils.emitMultichainTransferOut(eventEmitter, token, account, receiver, amount, srcChainId);
    }

    function getMultichainBalanceAmount(
        DataStore dataStore,
        address account,
        address token
    ) public view returns (uint256) {
        return dataStore.getUint(Keys.multichainBalanceKey(account, token));
    }

    function validateMultichainProvider(DataStore dataStore, address provider) external view {
        bytes32 providerKey = Keys.isMultichainProviderEnabledKey(provider);
        if (!dataStore.getBool(providerKey)) {
            revert Errors.InvalidMultichainProvider(provider);
        }
    }

    function validateMultichainEndpoint(DataStore dataStore, address endpoint) external view {
        bytes32 endpointKey = Keys.isMultichainEndpointEnabledKey(endpoint);
        if (!dataStore.getBool(endpointKey)) {
            revert Errors.InvalidMultichainEndpoint(endpoint);
        }
    }
}
