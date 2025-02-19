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
        uint256 srcChainId,
        RelayUtils.TransferRequests calldata transferRequests,
        DepositUtils.CreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        _validateDesChainId(relayParams.desChainId);

        bytes32 structHash = RelayUtils.getCreateDepositStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _processTransferRequests(account, transferRequests, srcChainId);

        return _createDeposit(relayParams, account, srcChainId, params);
    }

    function _createDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
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
            false, // isSubaccount
            srcChainId
        );

        return depositHandler.createDeposit(account, srcChainId, params);
    }

    function createWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        RelayUtils.TransferRequests calldata transferRequests,
        WithdrawalUtils.CreateWithdrawalParams memory params // can't use calldata because need to modify params.addresses.receiver & params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        _validateDesChainId(relayParams.desChainId);

        bytes32 structHash = RelayUtils.getCreateWithdrawalStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _processTransferRequests(account, transferRequests, srcChainId);

        return _createWithdrawal(relayParams, account, srcChainId, params);
    }

    function _createWithdrawal(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
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
            false, // isSubaccount
            srcChainId
        );

        return withdrawalHandler.createWithdrawal(account, srcChainId, params);
    }

    function createShift(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        RelayUtils.TransferRequests calldata transferRequests,
        ShiftUtils.CreateShiftParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        _validateDesChainId(relayParams.desChainId);

        bytes32 structHash = RelayUtils.getCreateShiftStructHash(relayParams, transferRequests, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _processTransferRequests(account, transferRequests, srcChainId);

        return _createShift(relayParams, account, srcChainId, params);
    }

    function _createShift(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
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
            false, // isSubaccount
            srcChainId
        );

        return ShiftUtils.createShift(
            dataStore,
            eventEmitter,
            shiftVault,
            account,
            srcChainId,
            params
        );
    }
}
