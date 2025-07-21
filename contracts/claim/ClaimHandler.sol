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
        uint256 distributionId,
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external globalNonReentrant onlyConfigKeeper {
        if (amounts.length == 0) {
            revert Errors.InvalidParams("amounts length is 0");
        }
        if (accounts.length != amounts.length) {
            revert Errors.InvalidParams("accounts and amounts length mismatch");
        }
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }

        uint256 totalTransferAmount;

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 amount = amounts[i];

            if (account == address(0)) {
                revert Errors.EmptyAccount();
            }
            if (amount == 0) {
                revert Errors.EmptyAmount();
            }

            uint256 nextAmount = dataStore.incrementUint(
                Keys.claimableFundsAmountKey(account, token, distributionId),
                amount
            );

            totalTransferAmount += amount;

            ClaimEventUtils.emitClaimFundsDeposited(eventEmitter, account, token, distributionId, amount, nextAmount);
        }

        IERC20(token).safeTransferFrom(msg.sender, address(claimVault), totalTransferAmount);
        dataStore.incrementUint(Keys.totalClaimableFundsAmountKey(token), totalTransferAmount);
    }

    // @dev withdraw funds from the claim vault for multiple accounts in batch
    // @param token the token to withdraw
    // @param accounts array of accounts to withdraw funds for
    // @param receiver the receiver of the funds
    function withdrawFunds(
        address token,
        address[] calldata accounts,
        uint256[] calldata distributionIds,
        address receiver
    ) external globalNonReentrant onlyTimelockMultisig {
        if (accounts.length == 0) {
            revert Errors.InvalidParams("accounts length is 0");
        }
        if (distributionIds.length == 0) {
            revert Errors.InvalidParams("distributionIds length is 0");
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

            if (account == address(0)) {
                revert Errors.EmptyAccount();
            }

            for (uint256 j = 0; j < distributionIds.length; j++) {
                // uint256 distributionId = distributionIds[j];
                bytes32 claimableKey = Keys.claimableFundsAmountKey(account, token, distributionIds[j]);
                uint256 amount = dataStore.getUint(claimableKey);
                dataStore.setUint(claimableKey, 0);
                totalWithdrawnAmount += amount;

                ClaimEventUtils.emitClaimFundsWithdrawn(
                    eventEmitter,
                    account,
                    token,
                    distributionIds[j],
                    amount,
                    receiver
                );
            }
        }
        claimVault.transferOut(token, receiver, totalWithdrawnAmount);
        dataStore.decrementUint(Keys.totalClaimableFundsAmountKey(token), totalWithdrawnAmount);
    }

    struct TransferClaimCache {
        uint256 distributionId;
        bytes32 fromAccountKey;
        bytes32 toAccountKey;
        uint256 amount;
        uint256 nextAmount;
    }

    // @dev transfer claim funds between accounts
    // @param token the token to transfer
    // @param fromAccounts array of accounts to transfer from
    // @param toAccounts array of accounts to transfer to
    function transferClaim(
        address token,
        uint256[] calldata distributionIds,
        address[] calldata fromAccounts,
        address[] calldata toAccounts
    ) external globalNonReentrant onlyTimelockMultisig {
        if (fromAccounts.length == 0) {
            revert Errors.InvalidParams("accounts length is 0");
        }
        if (fromAccounts.length != toAccounts.length) {
            revert Errors.InvalidParams("accounts and receivers length mismatch");
        }
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }

        TransferClaimCache memory cache;
        for (uint256 i = 0; i < fromAccounts.length; i++) {
            if (fromAccounts[i] == address(0)) {
                revert Errors.EmptyAccount();
            }
            if (toAccounts[i] == address(0)) {
                revert Errors.EmptyReceiver();
            }

            for (uint256 j = 0; j < distributionIds.length; j++) {
                cache.distributionId = distributionIds[j];
                cache.fromAccountKey = Keys.claimableFundsAmountKey(fromAccounts[i], token, cache.distributionId);
                cache.amount = dataStore.getUint(cache.fromAccountKey);

                if (cache.amount > 0) {
                    dataStore.setUint(cache.fromAccountKey, 0);
                    cache.toAccountKey = Keys.claimableFundsAmountKey(toAccounts[i], token, cache.distributionId);
                    cache.nextAmount = dataStore.incrementUint(cache.toAccountKey, cache.amount);

                    ClaimEventUtils.emitClaimFundsTransferred(
                        eventEmitter,
                        token,
                        cache.distributionId,
                        fromAccounts[i],
                        toAccounts[i],
                        cache.amount,
                        cache.nextAmount
                    );
                }
            }
        }
    }

    // @dev claim funds for the calling account for multiple tokens
    // @param tokens array of tokens to claim
    // @param receiver the receiver of the funds
    function claimFunds(
        address[] calldata tokens,
        uint256[] calldata distributionIds,
        address receiver
    ) external globalNonReentrant {
        if (tokens.length == 0) {
            revert Errors.InvalidParams("tokens length is 0");
        }
        if (receiver == address(0)) {
            revert Errors.EmptyReceiver();
        }

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];

            if (token == address(0)) {
                revert Errors.EmptyToken();
            }

            uint256 totalClaimedAmount;
            for (uint256 j = 0; j < distributionIds.length; j++) {
                uint256 distributionId = distributionIds[j];
                bytes32 claimableKey = Keys.claimableFundsAmountKey(msg.sender, token, distributionId);
                uint256 claimableAmount = dataStore.getUint(claimableKey);

                if (claimableAmount == 0) {
                    revert Errors.EmptyClaimableAmount(token);
                }

                totalClaimedAmount += claimableAmount;
                dataStore.setUint(claimableKey, 0);
                dataStore.decrementUint(Keys.totalClaimableFundsAmountKey(token), claimableAmount);

                ClaimEventUtils.emitClaimFundsClaimed(eventEmitter, receiver, token, distributionId, claimableAmount);
            }

            claimVault.transferOut(token, receiver, totalClaimedAmount);
            uint256 totalAmountLeft = dataStore.getUint(Keys.totalClaimableFundsAmountKey(token));
            if (totalAmountLeft > IERC20(token).balanceOf(address(claimVault))) {
                revert Errors.InsufficientFunds(token);
            }
        }
    }

    // @dev get the claimable amount for an account and token
    // @param account the account to check
    // @param token the token to check
    // @return the claimable amount
    function getClaimableAmount(
        address account,
        address token,
        uint256[] calldata distributionIds
    ) external view returns (uint256) {
        uint256 totalClaimableAmount;
        for (uint256 i = 0; i < distributionIds.length; i++) {
            uint256 distributionId = distributionIds[i];
            totalClaimableAmount += dataStore.getUint(Keys.claimableFundsAmountKey(account, token, distributionId));
        }
        return totalClaimableAmount;
    }

    // @dev get the total claimable amount for a token
    // @param token the token to check
    // @return the total claimable amount
    function getTotalClaimableAmount(address token) external view returns (uint256) {
        return dataStore.getUint(Keys.totalClaimableFundsAmountKey(token));
    }
}
