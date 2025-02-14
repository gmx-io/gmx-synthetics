// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";
import "../exchange/WithdrawalHandler.sol";
import "../withdrawal/WithdrawalVault.sol";

import "./MultichainRouter.sol";

contract MultichainGmRouter is MultichainRouter {

    DepositVault public depositVault;
    IDepositHandler public depositHandler;
    WithdrawalVault public withdrawalVault;
    WithdrawalHandler public withdrawalHandler;
    ShiftVault public shiftVault;

    constructor(
        BaseConstructorParams memory params,
        DepositVault _depositVault,
        IDepositHandler _depositHandler,
        WithdrawalVault _withdrawalVault,
        WithdrawalHandler _withdrawalHandler,
        ShiftVault _shiftVault
    ) MultichainRouter(params) {
        depositVault = _depositVault;
        depositHandler = _depositHandler;
        withdrawalVault = _withdrawalVault;
        withdrawalHandler = _withdrawalHandler;
        shiftVault = _shiftVault;
    }

    function createDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.TransferRequest[] calldata transferRequests,
        DepositUtils.CreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (relayParams.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getCreateDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, params.srcChainId);

        _processTransferRequests(account, transferRequests, params.srcChainId);

        return _createDeposit(relayParams, account, params);
    }

    function _createDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        DepositUtils.CreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: depositVault
        });

        // pay relay fee tokens from MultichainVault to DepositVault and decrease user's multichain balance
        params.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(depositVault), // residualFeeReceiver
            params.srcChainId
        );

        return depositHandler.createDeposit(account, params);
    }

    function createWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.TransferRequest[] calldata transferRequests,
        WithdrawalUtils.CreateWithdrawalParams memory params // can't use calldata because need to modify params.addresses.receiver & params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (relayParams.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getCreateWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, params.srcChainId);

        _processTransferRequests(account, transferRequests, params.srcChainId);

        return _createWithdrawal(relayParams, account, params);
    }

    function _createWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        WithdrawalUtils.CreateWithdrawalParams memory params // can't use calldata because need to modify params.addresses.receiver & params.numbers.executionFee
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: withdrawalVault
        });

        params.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(withdrawalVault), // residualFeeReceiver
            params.srcChainId
        );

        return withdrawalHandler.createWithdrawal(account, params);
    }

    function createShift(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.TransferRequest[] calldata transferRequests,
        ShiftUtils.CreateShiftParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (relayParams.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getCreateShiftStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, params.srcChainId);

        _processTransferRequests(account, transferRequests, params.srcChainId);

        return _createShift(relayParams, account, params);
    }

    function _createShift(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        ShiftUtils.CreateShiftParams memory params
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: shiftVault
        });

        params.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(shiftVault),
            params.srcChainId
        );

        return ShiftUtils.createShift(
            dataStore,
            eventEmitter,
            shiftVault,
            account,
            params
        );
    }
}
