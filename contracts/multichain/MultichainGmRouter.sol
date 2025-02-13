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
        RelayUtils.MultichainCreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash);

        _processTransferRequests(account, transferRequests, params.createDepositParams.srcChainId);

        return _createDeposit(relayParams, account, params);
    }

    function _createDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.MultichainCreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: depositVault
        });

        // pay relay fee tokens from MultichainVault to DepositVault and decrease user's multichain balance
        params.createDepositParams.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(depositVault) // residualFeeReceiver
        );

        return depositHandler.createDeposit(account, params.createDepositParams);
    }

    function createWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.TransferRequest[] calldata transferRequests,
        RelayUtils.MultichainCreateWithdrawalParams memory params // can't use calldata because need to modify params.addresses.receiver & params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash);

        _processTransferRequests(account, transferRequests, params.createWithdrawalParams.srcChainId);

        return _createWithdrawal(relayParams, account, params);
    }

    function _createWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.MultichainCreateWithdrawalParams memory params // can't use calldata because need to modify params.addresses.receiver & params.numbers.executionFee
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: withdrawalVault
        });

        params.createWithdrawalParams.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(withdrawalVault) // residualFeeReceiver
        );

        return withdrawalHandler.createWithdrawal(account, params.createWithdrawalParams);
    }

    function createShift(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.TransferRequest[] calldata transferRequests,
        RelayUtils.MultichainCreateShiftParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateShiftStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash);

        _processTransferRequests(account, transferRequests, params.createShiftParams.srcChainId);

        return _createShift(relayParams, account, params);
    }

    function _createShift(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.MultichainCreateShiftParams memory params
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: shiftVault
        });

        params.createShiftParams.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(shiftVault)
        );

        return ShiftUtils.createShift(
            dataStore,
            eventEmitter,
            shiftVault,
            account,
            params.createShiftParams
        );
    }
}
