// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/IBaseOrderUtils.sol";
import "../router/Router.sol";
import "./BaseGelatoRelayRouter.sol";

contract MultichainGelatoRelayRouter is BaseGelatoRelayRouter {
    bytes32 public constant _MULTICHAIN_MESSAGE_TYPEHASH =
        keccak256(bytes("GelatoRelayRouterMultichainMessage(bytes message,uint256 userNonce,uint256 deadline)"));

    mapping(address => uint256) public userNonces;

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
        uint256 collateralAmount,
        IBaseOrderUtils.CreateOrderParams memory params, // can't use calldata because need to modify params.numbers.executionFee
        address account,
        uint256 userNonce,
        uint256 deadline,
        uint256 sourceChainId,
        bytes calldata signature
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) returns (bytes32) {
        _validateNonceAndDeadline(account, userNonce, deadline);
        bytes memory message = _getCreateOrderSignatureMessage(relayParams, collateralAmount, params);
        _validateMultichainSignature(message, userNonce, deadline, sourceChainId, signature, account);
        return _createOrder(relayParams.tokenPermit, relayParams.fee, collateralAmount, params, account);
    }

    function _validateNonceAndDeadline(address account, uint256 userNonce, uint256 deadline) internal {
        if (block.timestamp > deadline) {
            revert Errors.DeadlinePassed(block.timestamp, deadline);
        }

        uint256 storedUserNonce = userNonces[account];
        if (storedUserNonce != userNonce) {
            revert Errors.InvalidUserNonce(storedUserNonce, userNonce);
        }
        userNonces[account] = userNonce + 1;
    }

    function _validateMultichainSignature(
        bytes memory message,
        uint256 userNonce,
        uint256 deadline,
        uint256 sourceChainId,
        bytes calldata signature,
        address expectedSigner
    ) internal view {
        bytes32 domainSeparator = _getDomainSeparator(sourceChainId);
        bytes32 structHash = keccak256(abi.encode(_MULTICHAIN_MESSAGE_TYPEHASH, message, userNonce, deadline));
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        _validateSignature(digest, signature, expectedSigner);
    }
}
