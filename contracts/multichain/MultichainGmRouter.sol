// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";
import "../exchange/WithdrawalHandler.sol";
import "../exchange/ShiftHandler.sol";
import "../withdrawal/WithdrawalVault.sol";

import "./MultichainRouter.sol";

contract MultichainGmRouter is MultichainRouter {
    using SafeERC20 for IERC20;

    DepositVault public immutable depositVault;
    IDepositHandler public immutable depositHandler;
    WithdrawalVault public immutable withdrawalVault;
    WithdrawalHandler public immutable withdrawalHandler;
    ShiftVault public immutable shiftVault;
    ShiftHandler public immutable shiftHandler;

    constructor(
        BaseConstructorParams memory params,
        DepositVault _depositVault,
        IDepositHandler _depositHandler,
        WithdrawalVault _withdrawalVault,
        WithdrawalHandler _withdrawalHandler,
        ShiftVault _shiftVault,
        ShiftHandler _shiftHandler
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        depositVault = _depositVault;
        depositHandler = _depositHandler;
        withdrawalVault = _withdrawalVault;
        withdrawalHandler = _withdrawalHandler;
        shiftVault = _shiftVault;
        shiftHandler = _shiftHandler;
    }

    function createDeposit(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        TransferRequests calldata transferRequests,
        DepositUtils.CreateDepositParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createDeposit(account, srcChainId, transferRequests, params);
    }

    function createDepositFromBridge(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        TransferRequests calldata transferRequests,
        DepositUtils.CreateDepositParams calldata params
    ) external nonReentrant onlyController withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        _validateCallWithoutSignature(relayParams, srcChainId);

        return _createDeposit(account, srcChainId, transferRequests, params);
    }

    function _createDeposit(
        address account,
        uint256 srcChainId,
        TransferRequests calldata transferRequests,
        DepositUtils.CreateDepositParams calldata params
    ) private returns (bytes32) {
        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(depositVault), params.executionFee);

        _processTransferRequests(account, transferRequests, srcChainId);

        return depositHandler.createDeposit(account, srcChainId, params);
    }

    function createWithdrawal(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        TransferRequests calldata transferRequests,
        WithdrawalUtils.CreateWithdrawalParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(withdrawalVault), params.executionFee);

        _processTransferRequests(account, transferRequests, srcChainId);

        return withdrawalHandler.createWithdrawal(account, srcChainId, params);
    }

    function createShift(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        TransferRequests calldata transferRequests,
        ShiftUtils.CreateShiftParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateShiftStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(shiftVault), params.executionFee);

        _processTransferRequests(account, transferRequests, srcChainId);

        return shiftHandler.createShift(account, srcChainId, params);
    }
}
