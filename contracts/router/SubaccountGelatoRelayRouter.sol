// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/IBaseOrderUtils.sol";
import "../router/Router.sol";
import "../feature/FeatureUtils.sol";
import "../subaccount/SubaccountUtils.sol";
import "./BaseGelatoRelayRouter.sol";

contract SubaccountGelatoRelayRouter is BaseGelatoRelayRouter {
    struct SubaccountApproval {
        bytes32 id; // for replay attack protection
        address subaccount;
        uint256 expiresAt;
        uint256 maxAllowedCount;
        bytes32 actionType;
        uint256 deadline;
        bytes signature;
    }

    bytes32 public constant _SUBACCOUNT_APPROVAL_TYPEHASH =
        keccak256(
            bytes(
                "SubaccountGelatoRelayRouter_SubaccountApproval(bytes32 id,address subaccount,uint256 expiresAt,uint256 maxAllowedCount,bytes32 actionType,bytes signature)"
            )
        );

    mapping(bytes32 => bool) public handledSubaccountApprovals;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault
    ) BaseGelatoRelayRouter(_router, _roleStore, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault) {}

    function createOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        uint256 collateralAmount,
        IBaseOrderUtils.CreateOrderParams memory params, // can't use calldata because need to modify params.numbers.executionFee
        address account
    )
        external
        nonReentrant
        withOraclePricesForAtomicAction(relayParams.oracleParams)
        onlyGelatoRelayERC2771
        returns (bytes32)
    {
        _handleSubaccount(account, Keys.SUBACCOUNT_ORDER_ACTION, subaccountApproval);
        return _createOrder(relayParams.tokenPermit, relayParams.fee, collateralAmount, params, account);
    }

    function updateOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        bytes32 key,
        UpdateOrderParams calldata params
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelayERC2771 {
        _handleSubaccount(account, Keys.SUBACCOUNT_ORDER_ACTION, subaccountApproval);
        _updateOrder(relayParams, account, key, params);
    }

    function cancelOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelayERC2771 {
        _handleSubaccount(account, Keys.SUBACCOUNT_ORDER_ACTION, subaccountApproval);
        _cancelOrder(relayParams, account, key);
    }

    function _handleSubaccount(
        address account,
        bytes32 actionType,
        SubaccountApproval calldata subaccountApproval
    ) internal {
        _handleSubaccountApproval(account, subaccountApproval);
        _handleSubaccountAction(account, actionType);
    }

    function _handleSubaccountAction(address account, bytes32 actionType) internal {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        // should not use msg.sender directly because Gelato relayer passes it in calldata
        address subaccount = _getMsgSender();
        SubaccountUtils.validateSubaccount(dataStore, account, subaccount);

        SubaccountUtils.incrementSubaccountActionCount(dataStore, eventEmitter, account, subaccount, actionType);
    }

    function _handleSubaccountApproval(address account, SubaccountApproval calldata subaccountApproval) internal {
        if (subaccountApproval.signature.length == 0) {
            return;
        }

        if (subaccountApproval.deadline > 0 && block.timestamp > subaccountApproval.deadline) {
            revert Errors.SubaccountApprovalDeadlinePassed(block.timestamp, subaccountApproval.deadline);
        }

        if (handledSubaccountApprovals[subaccountApproval.id]) {
            revert Errors.SubaccountApprovalAlreadyHandled(subaccountApproval.id);
        }
        handledSubaccountApprovals[subaccountApproval.id] = true;

        bytes32 domainSeparator = _getDomainSeparator(block.chainid);
        bytes32 structHash = _getSubaccountApprovalStructHash(subaccountApproval);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        _validateSignature(digest, subaccountApproval.signature, account);

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

        if (subaccountApproval.subaccount != address(0)) {
            address msgSender = _getMsgSender();
            if (subaccountApproval.subaccount != msgSender) {
                revert Errors.InvalidSubaccount(subaccountApproval.subaccount, msgSender);
            }

            SubaccountUtils.addSubaccount(dataStore, eventEmitter, account, subaccountApproval.subaccount);
        }
    }

    function _getSubaccountApprovalStructHash(
        SubaccountApproval calldata subaccountApproval
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _SUBACCOUNT_APPROVAL_TYPEHASH,
                    subaccountApproval.id,
                    subaccountApproval.subaccount,
                    subaccountApproval.expiresAt,
                    subaccountApproval.maxAllowedCount,
                    subaccountApproval.actionType
                )
            );
    }
}
