// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../exchange/GlvHandler.sol";
import "../glv/GlvVault.sol";

import "./MultichainRouter.sol";

contract MultichainGlvRouter is MultichainRouter {
    GlvVault public immutable glvVault;
    GlvHandler public immutable glvHandler;

    constructor(
        BaseConstructorParams memory params,
        GlvHandler _glvHandler,
        GlvVault _glvVault
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        glvHandler = _glvHandler;
        glvVault = _glvVault;
    }

    function createGlvDeposit(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        RelayUtils.TransferRequests calldata transferRequests,
        GlvDepositUtils.CreateGlvDepositParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCreateGlvDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _processTransferRequests(account, transferRequests, srcChainId);

        return _createGlvDeposit(relayParams, account, srcChainId, params);
    }

    function _createGlvDeposit(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        GlvDepositUtils.CreateGlvDepositParams memory params
    ) internal returns (bytes32) {

        return glvHandler.createGlvDeposit(account, srcChainId, params);
    }

    function createGlvWithdrawal(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        RelayUtils.TransferRequests calldata transferRequests,
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCreateGlvWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _processTransferRequests(account, transferRequests, srcChainId);

        return _createGlvWithdrawal(relayParams, account, srcChainId, params);
    }

    function _createGlvWithdrawal(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) internal returns (bytes32) {

        return GlvWithdrawalUtils.createGlvWithdrawal(dataStore, eventEmitter, glvVault, account, srcChainId, params);
    }
}
