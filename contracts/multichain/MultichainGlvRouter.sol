// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../exchange/IGlvDepositHandler.sol";
import "../exchange/IGlvWithdrawalHandler.sol";
import "../glv/GlvVault.sol";

import "./IMultichainGlvRouter.sol";
import "./MultichainRouter.sol";

contract MultichainGlvRouter is IMultichainGlvRouter, MultichainRouter {
    using SafeERC20 for IERC20;

    IGlvDepositHandler public immutable glvDepositHandler;
    GlvVault public immutable glvVault;
    IGlvWithdrawalHandler public immutable glvWithdrawalHandler;

    constructor(
        BaseConstructorParams memory params,
        IGlvDepositHandler _glvDepositHandler,
        IGlvWithdrawalHandler _glvWithdrawalHandler,
        GlvVault _glvVault
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        glvDepositHandler = _glvDepositHandler;
        glvWithdrawalHandler = _glvWithdrawalHandler;
        glvVault = _glvVault;
    }

    function createGlvDeposit(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvDepositUtils.CreateGlvDepositParams memory params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateGlvDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createGlvDeposit(account, srcChainId, transferRequests, params);
    }

    function createGlvDepositFromBridge(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvDepositUtils.CreateGlvDepositParams memory params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        _validateCallWithoutSignature(relayParams, srcChainId);

        return _createGlvDeposit(account, srcChainId, transferRequests, params);
    }

    function _createGlvDeposit(
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvDepositUtils.CreateGlvDepositParams memory params
    ) private returns (bytes32) {
        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(glvVault), params.executionFee);

        _processTransferRequests(account, transferRequests, srcChainId);

        return glvDepositHandler.createGlvDeposit(account, srcChainId, params);
    }

    function createGlvWithdrawal(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateGlvWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(glvVault), params.executionFee);

        _processTransferRequests(account, transferRequests, srcChainId);

        return glvWithdrawalHandler.createGlvWithdrawal(account, srcChainId, params);
    }
}
