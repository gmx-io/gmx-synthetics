// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import "../role/RoleModule.sol";
import "../utils/GlobalReentrancyGuard.sol";
import "../utils/StringUtils.sol";
import "../event/EventEmitter.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "./ClaimVault.sol";
import "./ClaimUtils.sol";
import "./ClaimEventUtils.sol";
import "../feature/FeatureUtils.sol";
import "../safe/SafeUtils.sol";

// @title ClaimHandler
// @dev Contract for distributing lost funds to users
contract ClaimHandler is RoleModule, GlobalReentrancyGuard {
    using Address for address;
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

    struct WithdrawParam {
        address account;
        uint256 distributionId;
    }

    struct ClaimParam {
        address token;
        uint256 distributionId;
        bytes termsSignature;
        string acceptedTerms;
    }

    struct TransferClaimParam {
        address token;
        uint256 distributionId;
        address fromAccount;
        address toAccount;
    }

    struct TransferClaimCache {
        bytes32 fromAccountKey;
        bytes32 toAccountKey;
        uint256 amount;
        uint256 nextAmount;
    }

    // @dev deposit funds for multiple accounts and tokens in batch
    // Rebasing tokens, tokens that change balance on transfer, with token burns, etc are not supported
    // If the distribution requires terms, then `setTerms` must be called before depositing funds
    // @param token the token to deposit
    // @param distributionId the distribution id
    // @param params array of deposit parameters
    function depositFunds(
        address token,
        uint256 distributionId,
        ClaimUtils.DepositParam[] calldata params
    ) external globalNonReentrant onlyClaimAdmin {
        uint256 totalTransferAmount = ClaimUtils.incrementClaims(
            dataStore,
            eventEmitter,
            token,
            distributionId,
            params
        );

        IERC20(token).safeTransferFrom(msg.sender, address(claimVault), totalTransferAmount);
        dataStore.incrementUint(Keys.totalClaimableFundsAmountKey(token), totalTransferAmount);

        ClaimUtils._validateTotalClaimableFundsAmount(dataStore, token, address(claimVault));
    }

    // @dev withdraw funds from the claim vault for multiple accounts in batch
    // this is an admin recovery function used when users cannot access their EOA
    // or when alternative distribution methods are needed. This zeros out user
    // claimable amounts and transfers funds to the specified receiver.
    // @param token the token to withdraw
    // @param params array of withdraw parameters
    // @param receiver the receiver of the funds
    function withdrawFunds(
        address token,
        WithdrawParam[] calldata params,
        address receiver
    ) external globalNonReentrant onlyTimelockMultisig {
        ClaimUtils._validateNonEmptyToken(token);
        _validateNonEmptyReceiver(receiver);

        if (params.length == 0) {
            revert Errors.InvalidParams("withdraw params length is 0");
        }

        uint256 totalWithdrawnAmount;
        for (uint256 i = 0; i < params.length; i++) {
            WithdrawParam memory param = params[i];

            ClaimUtils._validateNonEmptyAccount(param.account);
            ClaimUtils._validateNonZeroDistributionId(param.distributionId);

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
        ClaimUtils._validateTotalClaimableFundsAmount(dataStore, token, address(claimVault));
    }

    // @dev transfer claim funds between accounts
    // similar to admin recovery, allows for transferring funds between accounts
    // without the need to withdraw and deposit funds
    // @param token the token to transfer
    // @param params array of transfer parameters
    function transferClaim(
        address token,
        TransferClaimParam[] calldata params
    ) external globalNonReentrant onlyTimelockMultisig {
        if (params.length == 0) {
            revert Errors.InvalidParams("transfer params length is 0");
        }
        ClaimUtils._validateNonEmptyToken(token);

        TransferClaimCache memory cache;
        for (uint256 i = 0; i < params.length; i++) {
            TransferClaimParam memory param = params[i];

            if (param.fromAccount == param.toAccount) {
                revert Errors.InvalidParams("fromAccount and toAccount cannot be the same");
            }

            ClaimUtils._validateNonEmptyAccount(param.fromAccount);
            _validateNonEmptyReceiver(param.toAccount);
            ClaimUtils._validateNonZeroDistributionId(param.distributionId);

            cache.fromAccountKey = Keys.claimableFundsAmountKey(param.fromAccount, token, param.distributionId);
            cache.amount = dataStore.getUint(cache.fromAccountKey);

            if (cache.amount > 0) {
                dataStore.setUint(cache.fromAccountKey, 0);
                cache.toAccountKey = Keys.claimableFundsAmountKey(param.toAccount, token, param.distributionId);
                cache.nextAmount = dataStore.incrementUint(cache.toAccountKey, cache.amount);

                ClaimEventUtils.emitClaimFundsTransferred(
                    eventEmitter,
                    token,
                    param.distributionId,
                    param.fromAccount,
                    param.toAccount,
                    cache.amount,
                    cache.nextAmount
                );
            }
        }

        ClaimUtils._validateTotalClaimableFundsAmount(dataStore, token, address(claimVault));
    }

    // @dev claim funds for the calling account for multiple tokens
    // @param params array of claim parameters
    // @param receiver the receiver of the funds
    function acceptTermsAndClaim(ClaimParam[] calldata params, address receiver) external globalNonReentrant {
        if (params.length == 0) {
            revert Errors.InvalidParams("claim params length is 0");
        }
        _validateNonEmptyReceiver(receiver);

        for (uint256 i = 0; i < params.length; i++) {
            ClaimParam memory param = params[i];

            FeatureUtils.validateFeature(dataStore, Keys.generalClaimFeatureDisabled(param.distributionId));

            ClaimUtils._validateNonEmptyToken(param.token);
            ClaimUtils._validateNonZeroDistributionId(param.distributionId);

            _validateTermsSignature(param.distributionId, msg.sender, param.termsSignature, param.acceptedTerms);

            bytes32 claimableKey = Keys.claimableFundsAmountKey(msg.sender, param.token, param.distributionId);
            uint256 claimableAmount = dataStore.getUint(claimableKey);

            if (claimableAmount == 0) {
                revert Errors.EmptyClaimableAmount(param.token);
            }

            dataStore.setUint(claimableKey, 0);
            dataStore.decrementUint(Keys.totalClaimableFundsAmountKey(param.token), claimableAmount);

            ClaimEventUtils.emitClaimFundsClaimed(
                eventEmitter,
                msg.sender,
                receiver,
                param.token,
                param.distributionId,
                claimableAmount
            );

            claimVault.transferOut(param.token, receiver, claimableAmount);

            ClaimUtils._validateTotalClaimableFundsAmount(dataStore, param.token, address(claimVault));
        }
    }

    function setTerms(uint256 distributionId, string calldata terms) external globalNonReentrant onlyClaimAdmin {
        ClaimUtils._validateNonZeroDistributionId(distributionId);
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

    function removeTerms(uint256 distributionId) external globalNonReentrant onlyClaimAdmin {
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

    // note that signature can be empty here for signing by contracts
    function _validateTermsSignature(
        uint256 distributionId,
        address account,
        bytes memory signature,
        string memory acceptedTerms
    ) internal view {
        string memory terms = dataStore.getString(Keys.claimTermsKey(distributionId));
        if (bytes(terms).length == 0) {
            return;
        }

        if (StringUtils.compareStrings(terms, acceptedTerms)) {
            return;
        }

        bytes memory message = bytes(string.concat(
            terms,
            "\ndistributionId ",
            Strings.toString(distributionId),
            "\ncontract ",
            Strings.toHexString(address(this)),
            "\nchainId ",
            Strings.toString(block.chainid)
        ));

        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(message);
        (address recoveredSigner, ECDSA.RecoverError error) = ECDSA.tryRecover(ethSignedMessageHash, signature);

        if (error == ECDSA.RecoverError.NoError && recoveredSigner == account) {
            return;
        }

        if (!account.isContract()) {
            revert Errors.InvalidClaimTermsSignature(recoveredSigner, account);
        }

        bool isValidSignature = SignatureChecker.isValidERC1271SignatureNow(account, ethSignedMessageHash, signature);

        if (isValidSignature) { return; }

        // if the signature is still not valid, attempt to check signature validation for a safe account
        bytes32 safeMessageHash = SafeUtils.getMessageHash(account, message);

        isValidSignature = SignatureChecker.isValidERC1271SignatureNow(account, safeMessageHash, signature);

        if (isValidSignature) { return; }

        revert Errors.InvalidClaimTermsSignatureForContract(account);
    }

    function _validateNonEmptyReceiver(address receiver) internal pure {
        if (receiver == address(0)) {
            revert Errors.EmptyReceiver();
        }
    }
}
