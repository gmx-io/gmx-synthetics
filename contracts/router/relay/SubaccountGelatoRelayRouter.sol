// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../order/IBaseOrderUtils.sol";
import "../../router/Router.sol";
import "../../feature/FeatureUtils.sol";
import "../../subaccount/SubaccountUtils.sol";
import "./BaseGelatoRelayRouter.sol";
import "./SubaccountRelayUtils.sol";

contract SubaccountGelatoRelayRouter is BaseGelatoRelayRouter {
    using Order for Order.Props;

    mapping(address => uint256) public subaccountApprovalNonces;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler
    )
        BaseGelatoRelayRouter(_oracle, _orderHandler, _orderVault, _externalHandler)
        BaseRouter(_router, _roleStore, _dataStore, _eventEmitter)

    {}

    // @note all params except subaccount should be part of the corresponding struct hash
    function createOrder(
        RelayUtils.RelayParams calldata relayParams,
        SubaccountRelayUtils.SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    )
        external
        nonReentrant
        withOraclePricesForAtomicAction(relayParams.oracleParams)
        onlyGelatoRelay
        returns (bytes32)
    {
        _validateGaslessFeature();
        bytes32 structHash = SubaccountRelayUtils.getCreateOrderStructHash(
            relayParams,
            subaccountApproval,
            account,
            collateralDeltaAmount,
            params
        );
        _validateCall(relayParams, subaccount, structHash, 0 /* srcChainId */);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, subaccountApproval);

        if (params.addresses.receiver != account) {
            revert Errors.InvalidReceiver(params.addresses.receiver);
        }

        if (params.addresses.cancellationReceiver != address(0) && params.addresses.cancellationReceiver != account) {
            revert Errors.InvalidCancellationReceiverForSubaccountOrder(params.addresses.cancellationReceiver, account);
        }

        return
            _createOrder(
                relayParams,
                account,
                collateralDeltaAmount,
                0, // srcChainId
                params,
                true // isSubaccount
            );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function updateOrder(
        RelayUtils.RelayParams calldata relayParams,
        SubaccountRelayUtils.SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        bytes32 key,
        RelayUtils.UpdateOrderParams calldata params,
        bool increaseExecutionFee
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();

        bytes32 structHash = SubaccountRelayUtils.getUpdateOrderStructHash(
            relayParams,
            subaccountApproval,
            account,
            key,
            params,
            increaseExecutionFee
        );
        _validateCall(relayParams, subaccount, structHash, 0 /* srcChainId */);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, subaccountApproval);
        _updateOrder(
            relayParams,
            account,
            key,
            params,
            increaseExecutionFee,
            true // isSubaccount
        );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function cancelOrder(
        RelayUtils.RelayParams calldata relayParams,
        SubaccountRelayUtils.SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();

        bytes32 structHash = SubaccountRelayUtils.getCancelOrderStructHash(relayParams, subaccountApproval, account, key);
        _validateCall(relayParams, subaccount, structHash, 0 /* srcChainId */);

        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, subaccountApproval);
        _cancelOrder(
            relayParams,
            account,
            key,
            true // isSubaccount
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function removeSubaccount(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        address subaccount
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();
        bytes32 structHash = SubaccountRelayUtils.getRemoveSubaccountStructHash(relayParams, subaccount);
        _validateCall(relayParams, account, structHash, 0 /* srcChainId */);

        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: orderVault
        });
        _handleRelay(
            contracts,
            relayParams,
            account,
            account,
            false, // isSubaccount is false because the `removeSubaccount` call is signed by the main account
            0 // srcChainId
        );

        SubaccountUtils.removeSubaccount(dataStore, eventEmitter, account, subaccount);
    }

    function _handleSubaccountAction(
        address account,
        address subaccount,
        bytes32 actionType,
        SubaccountRelayUtils.SubaccountApproval calldata subaccountApproval
    ) internal {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        _handleSubaccountApproval(account, subaccountApproval);

        SubaccountUtils.handleSubaccountAction(dataStore, eventEmitter, account, subaccount, actionType);
    }

    function _handleSubaccountApproval(address account, SubaccountRelayUtils.SubaccountApproval calldata subaccountApproval) internal {
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
        bytes32 structHash = SubaccountRelayUtils.getSubaccountApprovalStructHash(subaccountApproval);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        _validateSignature(digest, subaccountApproval.signature, account, "subaccount approval");

        if (subaccountApproval.maxAllowedCount > 0) {
            SubaccountUtils.setMaxAllowedSubaccountActionCount(
                dataStore,
                eventEmitter,
                account,
                subaccountApproval.subaccount,
                subaccountApproval.actionType,
                subaccountApproval.maxAllowedCount
            );
        }

        if (subaccountApproval.expiresAt > 0) {
            SubaccountUtils.setSubaccountExpiresAt(
                dataStore,
                eventEmitter,
                account,
                subaccountApproval.subaccount,
                subaccountApproval.actionType,
                subaccountApproval.expiresAt
            );
        }

        if (subaccountApproval.shouldAdd) {
            SubaccountUtils.addSubaccount(dataStore, eventEmitter, account, subaccountApproval.subaccount);
        }
    }
}
