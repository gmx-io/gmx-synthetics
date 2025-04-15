// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/IBaseOrderUtils.sol";
import "../router/Router.sol";
import "../feature/FeatureUtils.sol";
import "../subaccount/SubaccountUtils.sol";
import "./MultichainRouter.sol";

contract MultichainSubaccountRouter is MultichainRouter {
    mapping(address => uint256) public subaccountApprovalNonces;

    constructor(
        BaseConstructorParams memory params
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {}

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function batch(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        uint256 srcChainId,
        address subaccount,
        BatchParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) returns (bytes32[] memory) {
        _handleBatch(
            relayParams,
            subaccountApproval,
            account,
            srcChainId,
            subaccount,
            params
        );

        return _batch(
            account,
            srcChainId,
            params.createOrderParamsList,
            params.updateOrderParamsList,
            params.cancelOrderKeys,
            true // isSubaccount
        );
    }

    function _handleBatch(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        uint256 srcChainId,
        address subaccount,
        BatchParams calldata params
    ) private {
        bytes32 structHash = RelayUtils.getBatchStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);

        for (uint256 i = 0; i < params.createOrderParamsList.length; i++) {
            _validateCreateOrderParams(account, params.createOrderParamsList[i]);
        }

        uint256 actionsCount = params.createOrderParamsList.length +
            params.updateOrderParamsList.length +
            params.cancelOrderKeys.length;

        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, actionsCount, subaccountApproval);
    }

    function _validateCreateOrderParams(
        address account,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) internal pure {
        if (params.addresses.receiver != account) {
            revert Errors.InvalidReceiver(params.addresses.receiver);
        }

        if (params.addresses.cancellationReceiver != address(0) && params.addresses.cancellationReceiver != account) {
            revert Errors.InvalidCancellationReceiverForSubaccountOrder(params.addresses.cancellationReceiver, account);
        }
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function createOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) returns (bytes32) {
        _handleCreateOrder(
            relayParams,
            subaccountApproval,
            account,
            srcChainId,
            subaccount,
            params
        );

        return
            _createOrder(
                account,
                srcChainId,
                params,
                true // isSubaccount
            );
    }

    function _handleCreateOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) private {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        _validateCreateOrderParams(account, params);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function updateOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        UpdateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);

        _updateOrder(
            account,
            params,
            true // isSubaccount
        );
    }

    // @note all params except subaccount/srcChainId should be part of the corresponding struct hash
    function cancelOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        uint256 srcChainId,
        address subaccount,
        bytes32 key
    ) external nonReentrant withRelay(relayParams, account, srcChainId, true) {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, subaccountApproval, account, key);
        _validateCall(relayParams, subaccount, structHash, srcChainId);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
        _cancelOrder(account, key);
    }

    // @note all params except account/srcChainId should be part of the corresponding struct hash
    function removeSubaccount(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address subaccount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        // isSubaccount=false is passed to `withRelay` modifier because this action is signed by the main account
        bytes32 structHash = RelayUtils.getRemoveSubaccountStructHash(relayParams, subaccount);
        _validateCall(relayParams, account, structHash, srcChainId);

        SubaccountUtils.removeSubaccount(dataStore, eventEmitter, account, subaccount);
    }

    function _handleSubaccountAction(
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 actionsCount,
        SubaccountApproval calldata subaccountApproval
    ) internal {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        _handleSubaccountApproval(account, subaccountApproval);

        SubaccountUtils.handleSubaccountAction(dataStore, eventEmitter, account, subaccount, actionType, actionsCount);
    }

    function _handleSubaccountApproval(address account, SubaccountApproval calldata subaccountApproval) internal {
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

        bytes32 domainSeparator = _getDomainSeparator(block.chainid);
        bytes32 structHash = RelayUtils.getSubaccountApprovalStructHash(subaccountApproval);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        _validateSignature(digest, subaccountApproval.signature, account, "subaccount approval");

        SubaccountUtils.handleSubaccountApproval(dataStore, eventEmitter, account, subaccountApproval);
    }
}
