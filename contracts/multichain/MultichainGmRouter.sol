// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../exchange/IDepositHandler.sol";
import "../exchange/IWithdrawalHandler.sol";
import "../exchange/IShiftHandler.sol";

import "../deposit/DepositVault.sol";
import "../withdrawal/WithdrawalVault.sol";
import "../shift/ShiftVault.sol";

import "./IMultichainGmRouter.sol";
import "./MultichainRouter.sol";

contract MultichainGmRouter is IMultichainGmRouter, MultichainRouter {
    using SafeERC20 for IERC20;

    DepositVault public immutable depositVault;
    IDepositHandler public immutable depositHandler;
    WithdrawalVault public immutable withdrawalVault;
    IWithdrawalHandler public immutable withdrawalHandler;
    ShiftVault public immutable shiftVault;
    IShiftHandler public immutable shiftHandler;

    constructor(
        BaseConstructorParams memory params,
        DepositVault _depositVault,
        IDepositHandler _depositHandler,
        WithdrawalVault _withdrawalVault,
        IWithdrawalHandler _withdrawalHandler,
        ShiftVault _shiftVault,
        IShiftHandler _shiftHandler
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        depositVault = _depositVault;
        depositHandler = _depositHandler;
        withdrawalVault = _withdrawalVault;
        withdrawalHandler = _withdrawalHandler;
        shiftVault = _shiftVault;
        shiftHandler = _shiftHandler;
    }

    function createDeposit(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IDepositUtils.CreateDepositParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createDeposit(account, srcChainId, transferRequests, params);
    }

    function _createDeposit(
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IDepositUtils.CreateDepositParams calldata params
    ) private returns (bytes32) {
        _processTransferRequests(account, transferRequests, srcChainId);

        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(depositVault), params.executionFee);

        return depositHandler.createDeposit(account, srcChainId, params);
    }

    function createWithdrawal(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IWithdrawalUtils.CreateWithdrawalParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _processTransferRequests(account, transferRequests, srcChainId);

        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(withdrawalVault), params.executionFee);

        return withdrawalHandler.createWithdrawal(account, srcChainId, params);
    }

    function createShift(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IShiftUtils.CreateShiftParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateShiftStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _processTransferRequests(account, transferRequests, srcChainId);

        address wnt = TokenUtils.wnt(dataStore);
        IERC20(wnt).safeTransfer(address(shiftVault), params.executionFee);

        return shiftHandler.createShift(account, srcChainId, params);
    }
}
