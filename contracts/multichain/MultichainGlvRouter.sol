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
        RelayUtils.MultichainCreateGlvDepositParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateGlvDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash);

        _processTransferRequests(account, transferRequests, params.createGlvDepositParams.srcChainId);

        return _createGlvDeposit(relayParams, account, params);
    }

    function _createGlvDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.MultichainCreateGlvDepositParams memory params
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: glvVault
        });

        // pay relay fee tokens from MultichainVault to GlvVault and decrease user's multichain balance
        params.createGlvDepositParams.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(glvVault)
        );

        return glvHandler.createGlvDeposit(account, params.createGlvDepositParams);
    }

    function createGlvWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.TransferRequest[] calldata transferRequests,
        RelayUtils.MultichainCreateGlvWithdrawalParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateGlvWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash);

        _processTransferRequests(account, transferRequests, params.createGlvWithdrawalParams.srcChainId);

        return _createGlvWithdrawal(relayParams, account, params);
    }

    function _createGlvWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.MultichainCreateGlvWithdrawalParams memory params
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: glvVault
        });

        // pay relay fee tokens from MultichainVault to GlvVault and decrease user's multichain balance
        params.createGlvWithdrawalParams.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(glvVault) // residualFeeReceiver
        );

        return GlvWithdrawalUtils.createGlvWithdrawal(
            dataStore,
            eventEmitter,
            glvVault,
            account,
            params.createGlvWithdrawalParams
        );
    }
}
