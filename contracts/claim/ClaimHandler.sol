// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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

    struct DepositParam {
        address account;
        uint256 amount;
    }

    struct WithdrawParam {
        address account;
        uint256 distributionId;
    }

    struct ClaimParam {
        address token;
        uint256 distributionId;
        bytes termsSignature;
    }

    struct TransferClaimCache {
        uint256 distributionId;
        bytes32 fromAccountKey;
        bytes32 toAccountKey;
        uint256 amount;
        uint256 nextAmount;
    }

    // @dev deposit funds for multiple accounts and tokens in batch
    // @param token the token to deposit
    // @param amounts array of deposit parameters
    function depositFunds(
        address token,
        uint256 distributionId,
        DepositParam[] calldata params
    ) external globalNonReentrant onlyConfigKeeper {
        if (params.length == 0) {
            revert Errors.InvalidParams("deposit params length is 0");
        }
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }

        uint256 totalTransferAmount;

        for (uint256 i = 0; i < params.length; i++) {
            DepositParam memory param = params[i];

            if (param.account == address(0)) {
                revert Errors.EmptyAccount();
            }
            if (param.amount == 0) {
                revert Errors.EmptyAmount();
            }

            uint256 nextAmount = dataStore.incrementUint(
                Keys.claimableFundsAmountKey(param.account, token, distributionId),
                param.amount
            );

            totalTransferAmount += param.amount;

            ClaimEventUtils.emitClaimFundsDeposited(
                eventEmitter,
                param.account,
                token,
                distributionId,
                param.amount,
                nextAmount
            );
        }

        IERC20(token).safeTransferFrom(msg.sender, address(claimVault), totalTransferAmount);
        dataStore.incrementUint(Keys.totalClaimableFundsAmountKey(token), totalTransferAmount);
    }

    // @dev withdraw funds from the claim vault for multiple accounts in batch
    // @param token the token to withdraw
    // @param params array of withdraw parameters
    // @param receiver the receiver of the funds
    function withdrawFunds(
        address token,
        WithdrawParam[] calldata params,
        address receiver
    ) external globalNonReentrant onlyTimelockMultisig {
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }
        if (params.length == 0) {
            revert Errors.InvalidParams("withdraw params length is 0");
        }
        if (receiver == address(0)) {
            revert Errors.EmptyReceiver();
        }

        uint256 totalWithdrawnAmount;
        for (uint256 i = 0; i < params.length; i++) {
            WithdrawParam memory param = params[i];

            if (param.account == address(0)) {
                revert Errors.EmptyAccount();
            }

            bytes32 claimableKey = Keys.claimableFundsAmountKey(param.account, token, param.distributionId);
            uint256 amount = dataStore.getUint(claimableKey);
            dataStore.setUint(claimableKey, 0);
            totalWithdrawnAmount += amount;

            ClaimEventUtils.emitClaimFundsWithdrawn(
                eventEmitter,
                param.account,
                token,
                param.distributionId,
                amount,
                receiver
            );
        }
        claimVault.transferOut(token, receiver, totalWithdrawnAmount);
        dataStore.decrementUint(Keys.totalClaimableFundsAmountKey(token), totalWithdrawnAmount);
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
            cache.distributionId = distributionIds[i];

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

    // @dev claim funds for the calling account for multiple tokens
    // @param params array of claim parameters
    // @param receiver the receiver of the funds
    function claimFunds(ClaimParam[] calldata params, address receiver) external globalNonReentrant {
        if (params.length == 0) {
            revert Errors.InvalidParams("claim params length is 0");
        }
        if (receiver == address(0)) {
            revert Errors.EmptyReceiver();
        }

        for (uint256 i = 0; i < params.length; i++) {
            ClaimParam memory param = params[i];

            if (param.token == address(0)) {
                revert Errors.EmptyToken();
            }

            validateTermsSignature(param.distributionId, msg.sender, param.termsSignature);

            bytes32 claimableKey = Keys.claimableFundsAmountKey(msg.sender, param.token, param.distributionId);
            uint256 claimableAmount = dataStore.getUint(claimableKey);

            if (claimableAmount == 0) {
                revert Errors.EmptyClaimableAmount(param.token);
            }

            dataStore.setUint(claimableKey, 0);
            dataStore.decrementUint(Keys.totalClaimableFundsAmountKey(param.token), claimableAmount);

            ClaimEventUtils.emitClaimFundsClaimed(
                eventEmitter,
                receiver,
                param.token,
                param.distributionId,
                claimableAmount
            );

            claimVault.transferOut(param.token, receiver, claimableAmount);
            uint256 totalAmountLeft = dataStore.getUint(Keys.totalClaimableFundsAmountKey(param.token));
            if (totalAmountLeft > IERC20(param.token).balanceOf(address(claimVault))) {
                revert Errors.InsufficientFunds(param.token);
            }
        }
    }

    function setTerms(uint256 distributionId, string calldata terms) external onlyConfigKeeper {
        if (distributionId == 0) {
            revert Errors.InvalidParams("distributionId is 0");
        }
        if (bytes(terms).length == 0) {
            revert Errors.InvalidParams("terms is empty");
        }

        bytes32 termsHash = keccak256(bytes(terms));
        bytes32 claimTermsBackrefKey = Keys.claimTermsBackrefKey(termsHash);
        uint256 existingDistributionId = dataStore.getUint(claimTermsBackrefKey);
        if (existingDistributionId != 0) {
            revert Errors.DuplicateClaimTerms(existingDistributionId);
        }

        dataStore.setUint(claimTermsBackrefKey, distributionId);
        dataStore.setString(Keys.claimTermsKey(distributionId), terms);

        ClaimEventUtils.emitClaimTermsSet(eventEmitter, distributionId, termsHash);
    }

    function removeTerms(uint256 distributionId) external onlyConfigKeeper {
        string memory terms = dataStore.getString(Keys.claimTermsKey(distributionId));
        if (bytes(terms).length == 0) {
            revert Errors.InvalidParams("terms not found");
        }

        bytes32 termsHash = keccak256(bytes(terms));
        bytes32 claimTermsBackrefKey = Keys.claimTermsBackrefKey(termsHash);
        dataStore.setUint(claimTermsBackrefKey, 0);
        dataStore.setString(Keys.claimTermsKey(distributionId), "");

        ClaimEventUtils.emitClaimTermsRemoved(eventEmitter, distributionId);
    }

    function validateTermsSignature(uint256 distributionId, address account, bytes memory signature) internal view {
        string memory terms = dataStore.getString(Keys.claimTermsKey(distributionId));
        if (bytes(terms).length == 0) {
            return;
        }

        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(bytes(terms));
        address recoveredSigner = ECDSA.recover(ethSignedMessageHash, signature);
        if (recoveredSigner != account) {
            revert Errors.InvalidClaimTermsSignature(recoveredSigner, account);
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
