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
        uint256 srcChainId,
        address subaccount,
        bytes32 actionType,
        uint256 actionsCount,
        SubaccountApproval calldata subaccountApproval,
        mapping(address => uint256) storage subaccountApprovalNonces
    ) external {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        SubaccountUtils.validateIntegrationId(dataStore, account, subaccount);

        _handleSubaccountApproval(
            dataStore,
            eventEmitter,
            account,
            srcChainId,
            subaccountApproval,
            subaccountApprovalNonces
        );

        SubaccountUtils.handleSubaccountAction(dataStore, eventEmitter, account, subaccount, actionType, actionsCount);
    }

    function _handleSubaccountApproval(DataStore dataStore, EventEmitter eventEmitter, address account, uint256 srcChainId, SubaccountApproval calldata subaccountApproval, mapping(address => uint256) storage subaccountApprovalNonces) private {
        if (subaccountApproval.signature.length == 0) {
            return;
        }

        if (subaccountApproval.subaccount == address(0)) {
            revert Errors.InvalidSubaccountApprovalSubaccount();
        }

        if (block.timestamp > subaccountApproval.deadline) {
            revert Errors.SubaccountApprovalDeadlinePassed(block.timestamp, subaccountApproval.deadline);
        }

        uint256 storedNonce = subaccountApprovalNonces[account];

        if (storedNonce != subaccountApproval.nonce) {
            revert Errors.InvalidSubaccountApprovalNonce(storedNonce, subaccountApproval.nonce);
        }
        
        subaccountApprovalNonces[account] = storedNonce + 1;

        bytes32 domainSeparator = RelayUtils.getDomainSeparator(srcChainId);
        bytes32 structHash = RelayUtils.getSubaccountApprovalStructHash(subaccountApproval);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        RelayUtils.validateSignature(digest, subaccountApproval.signature, account, "subaccount approval");

        SubaccountUtils.handleSubaccountApproval(dataStore, eventEmitter, account, subaccountApproval);
    }
}
