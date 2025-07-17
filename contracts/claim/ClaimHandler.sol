// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../role/RoleModule.sol";
import "../utils/GlobalReentrancyGuard.sol";
import "../event/EventEmitter.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "./ClaimVault.sol";
import "./ClaimEventUtils.sol";

// @title ClaimHandler
// @dev Contract for distributing lost funds to users
contract ClaimHandler is RoleModule, GlobalReentrancyGuard {
    using SafeERC20 for IERC20;

    EventEmitter public immutable eventEmitter;
    ClaimVault public immutable claimVault;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        ClaimVault _claimVault
    ) RoleModule(_roleStore) GlobalReentrancyGuard(_dataStore) {
        eventEmitter = _eventEmitter;
        claimVault = _claimVault;
    }

    struct DepositAmount {
        address account;
        uint256 amount;
    }

    // @dev deposit funds for multiple accounts and tokens in batch
    // @param token the token to deposit
    // @param amounts array of deposit parameters
    function depositFunds(
        address token,
        DepositAmount[] calldata amounts
    ) external globalNonReentrant onlyOrderKeeper {
        if (amounts.length == 0) {
            revert Errors.InvalidParams("amounts length is 0");
        }
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }

        uint256 totalTransferAmount;

        for (uint256 i = 0; i < amounts.length; i++) {
            DepositAmount memory amount = amounts[i];

            if (amount.account == address(0)) {
                revert Errors.EmptyAccount();
            }
            if (amount.amount == 0) {
                revert Errors.EmptyAmount();
            }

            uint256 newAmount = dataStore.incrementUint(Keys.claimableFundsAmountKey(amount.account, token), amount.amount);

            totalTransferAmount += amount.amount;

            ClaimEventUtils.emitClaimFundsDeposited(eventEmitter, amount.account, token, amount.amount, newAmount);
        }

        dataStore.incrementUint(Keys.totalClaimableFundsAmountKey(token), totalTransferAmount);

        IERC20(token).safeTransferFrom(msg.sender, address(claimVault), totalTransferAmount);
    }

    // @dev withdraw funds from the claim vault for multiple accounts in batch
    // @param token the token to withdraw
    // @param accounts array of accounts to withdraw funds for
    // @param receiver the receiver of the funds
    function withdrawFunds(
        address token,
        address[] calldata accounts,
        address receiver
    ) external globalNonReentrant onlyTimelockMultisig {
        if (accounts.length == 0) {
            revert Errors.InvalidParams("accounts length is 0");
        }
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }
        if (receiver == address(0)) {
            revert Errors.EmptyReceiver();
        }

        uint256 totalWithdrawnAmount;
        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];

            bytes32 claimableKey = Keys.claimableFundsAmountKey(account, token);
            uint256 amount = dataStore.getUint(claimableKey);
            dataStore.setUint(claimableKey, 0);
            totalWithdrawnAmount += amount;

            claimVault.transferOut(token, receiver, amount);

            ClaimEventUtils.emitClaimFundsWithdrawn(eventEmitter, token, amount, receiver);
        }
        dataStore.decrementUint(Keys.totalClaimableFundsAmountKey(token), totalWithdrawnAmount);
    }

    // @dev claim funds for the calling account for multiple tokens
    // @param tokens array of tokens to claim
    // @param receiver the receiver of the funds
    function claimFunds(address[] calldata tokens, address receiver) external globalNonReentrant {
        if (tokens.length == 0) {
            revert Errors.InvalidParams("tokens length is 0");
        }

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];

            if (token == address(0)) {
                revert Errors.EmptyToken();
            }

            bytes32 claimableKey = Keys.claimableFundsAmountKey(msg.sender, token);
            uint256 claimableAmount = dataStore.getUint(claimableKey);

            if (claimableAmount == 0) {
                revert Errors.EmptyClaimableAmount(token);
            }

            dataStore.setUint(claimableKey, 0);
            dataStore.decrementUint(Keys.totalClaimableFundsAmountKey(token), claimableAmount);
            claimVault.transferOut(token, receiver, claimableAmount);

            ClaimEventUtils.emitClaimFundsClaimed(eventEmitter, receiver, token, claimableAmount);
        }
    }

    // @dev get the claimable amount for an account and token
    // @param account the account to check
    // @param token the token to check
    // @return the claimable amount
    function getClaimableAmount(address account, address token) external view returns (uint256) {
        return dataStore.getUint(Keys.claimableFundsAmountKey(account, token));
    }

    // @dev get the total claimable amount for a token
    // @param token the token to check
    // @return the total claimable amount
    function getTotalClaimableAmount(address token) external view returns (uint256) {
        return dataStore.getUint(Keys.totalClaimableFundsAmountKey(token));
    }
}
