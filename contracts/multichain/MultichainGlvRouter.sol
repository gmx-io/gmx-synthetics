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
    ) MultichainRouter(params) {
        glvHandler = _glvHandler;
        glvVault = _glvVault;
    }

    function createGlvDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.TransferRequest[] calldata transferRequests,
        GlvDepositUtils.CreateGlvDepositParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (relayParams.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getCreateGlvDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, params.srcChainId);

        _processTransferRequests(account, transferRequests, params.srcChainId);

        return _createGlvDeposit(relayParams, account, params);
    }

    function _createGlvDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        GlvDepositUtils.CreateGlvDepositParams memory params
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: glvVault
        });

        // pay relay fee tokens from MultichainVault to GlvVault and decrease user's multichain balance
        params.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(glvVault),
            params.srcChainId
        );

        return glvHandler.createGlvDeposit(account, params);
    }

    function createGlvWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.TransferRequest[] calldata transferRequests,
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (relayParams.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getCreateGlvWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, params.srcChainId);

        _processTransferRequests(account, transferRequests, params.srcChainId);

        return _createGlvWithdrawal(relayParams, account, params);
    }

    function _createGlvWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: glvVault
        });

        // pay relay fee tokens from MultichainVault to GlvVault and decrease user's multichain balance
        params.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(glvVault), // residualFeeReceiver
            params.srcChainId
        );

        return GlvWithdrawalUtils.createGlvWithdrawal(
            dataStore,
            eventEmitter,
            glvVault,
            account,
            params
        );
    }
}
