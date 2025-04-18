// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../order/IBaseOrderUtils.sol";
import "../../feature/FeatureUtils.sol";
import "../../subaccount/SubaccountUtils.sol";
import "./BaseGelatoRelayRouter.sol";

library SubaccountRouterUtils {
    function validateCreateOrderParams(
        address account,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external pure {
        if (params.addresses.receiver != account) {
            revert Errors.InvalidReceiver(params.addresses.receiver);
        }

        if (params.addresses.cancellationReceiver != address(0) && params.addresses.cancellationReceiver != account) {
            revert Errors.InvalidCancellationReceiverForSubaccountOrder(params.addresses.cancellationReceiver, account);
        }
    }

    function handleSubaccountAction(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 actionsCount,
        SubaccountApproval calldata subaccountApproval,
        uint256 subaccountApprovalStoredNonce
    ) external {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        _handleSubaccountApproval(
            dataStore,
            eventEmitter,
            account,
            subaccountApproval,
            subaccountApprovalStoredNonce
        );

        SubaccountUtils.handleSubaccountAction(dataStore, eventEmitter, account, subaccount, actionType, actionsCount);
    }

    function _handleSubaccountApproval(DataStore dataStore, EventEmitter eventEmitter, address account, SubaccountApproval calldata subaccountApproval, uint256 subaccountApprovalStoredNonce) private {
        if (subaccountApproval.signature.length == 0) {
            return;
        }

        if (subaccountApproval.subaccount == address(0)) {
            revert Errors.InvalidSubaccountApprovalSubaccount();
        }

        if (block.timestamp > subaccountApproval.deadline) {
            revert Errors.SubaccountApprovalDeadlinePassed(block.timestamp, subaccountApproval.deadline);
        }

        if (subaccountApprovalStoredNonce != subaccountApproval.nonce) {
            revert Errors.InvalidSubaccountApprovalNonce(subaccountApprovalStoredNonce, subaccountApproval.nonce);
        }

        bytes32 domainSeparator = RelayUtils.getDomainSeparator(block.chainid);
        bytes32 structHash = RelayUtils.getSubaccountApprovalStructHash(subaccountApproval);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        RelayUtils.validateSignature(digest, subaccountApproval.signature, account, "subaccount approval");

        SubaccountUtils.handleSubaccountApproval(dataStore, eventEmitter, account, subaccountApproval);
    }
}
