// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../exchange/GlvHandler.sol";
import "../glv/GlvVault.sol";

import "./MultichainRouter.sol";

contract MultichainGlvRouter is MultichainRouter {
    using SafeERC20 for IERC20;

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
        TransferRequests calldata transferRequests,
        GlvDepositUtils.CreateGlvDepositParams memory params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateGlvDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(glvVault), params.executionFee);

        _processTransferRequests(account, transferRequests, srcChainId);

        return glvHandler.createGlvDeposit(account, srcChainId, params);
    }

    function createGlvWithdrawal(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        TransferRequests calldata transferRequests,
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateGlvWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(glvVault), params.executionFee);

        _processTransferRequests(account, transferRequests, srcChainId);

        return glvHandler.createGlvWithdrawal(account, srcChainId, params);
    }
}
