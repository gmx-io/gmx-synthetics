// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/GelatoRelayRouter.sol";
import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";
import "../exchange/WithdrawalHandler.sol";
import "../withdrawal/WithdrawalVault.sol";
import "../exchange/GlvHandler.sol";
import "../glv/GlvVault.sol";

import "./MultichainUtils.sol";

contract MultichainRouter is GelatoRelayRouter {

    DepositVault depositVault;
    IDepositHandler depositHandler;
    MultichainVault multichainVault;
    WithdrawalHandler withdrawalHandler;
    WithdrawalVault withdrawalVault;
    GlvHandler public glvHandler;
    GlvVault public glvVault;
    ShiftVault public shiftVault;

    constructor(
        Router _router,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler,
        IDepositHandler _depositHandler,
        DepositVault _depositVault,
        MultichainVault _multichainVault,
        WithdrawalHandler _withdrawalHandler,
        WithdrawalVault _withdrawalVault
        // GlvHandler _glvHandler, // TODO: place in a struct to fix stack to deep error
        // GlvVault _glvVault
        // ShiftVault _shiftVault
    ) GelatoRelayRouter(_router, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault, _externalHandler) {
        depositVault = _depositVault;
        depositHandler = _depositHandler;
        multichainVault = _multichainVault;
        withdrawalHandler = _withdrawalHandler;
        withdrawalVault = _withdrawalVault;
        // glvHandler = _glvHandler;
        // glvVault = _glvVault;
        // shiftVault = _shiftVault;
    }

    function createDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.MultichainCreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateDepositStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

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

        // transfer long & short tokens from MultichainVault to DepositVault and decrement user's multichain balance
        _sendTokens(
            account,
            params.createDepositParams.addresses.initialLongToken,
            address(depositVault), // receiver
            params.longTokenAmount,
            params.createDepositParams.srcChainId
        );
        _sendTokens(
            account,
            params.createDepositParams.addresses.initialShortToken,
            address(depositVault), // receiver
            params.shortTokenAmount,
            params.createDepositParams.srcChainId
        );

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
        RelayUtils.MultichainCreateWithdrawalParams memory params // can't use calldata because need to modify params.addresses.receiver & params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateWithdrawalStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

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

        // user already bridged the GM tokens to the MultichainVault and balance was increased
        // transfer the GM tokens from MultichainVault to WithdrawalVault
        _sendTokens(
            account,
            params.createWithdrawalParams.market,
            address(withdrawalVault), // receiver
            params.tokenAmount,
            params.createWithdrawalParams.srcChainId
        );

        params.createWithdrawalParams.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(withdrawalVault) // residualFeeReceiver
        );

        return withdrawalHandler.createWithdrawal(account, params.createWithdrawalParams);
    }

    function createGlvDeposit(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.MultichainCreateGlvDepositParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateGlvDepositStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

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

        // transfer long & short tokens from MultichainVault to GlvVault and decrement user's multichain balance
        _sendTokens(
            account,
            params.createGlvDepositParams.initialLongToken,
            address(glvVault), // receiver
            params.longTokenAmount,
            params.createGlvDepositParams.srcChainId
        );
        _sendTokens(
            account,
            params.createGlvDepositParams.initialShortToken,
            address(glvVault), // receiver
            params.shortTokenAmount,
            params.createGlvDepositParams.srcChainId
        );

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
        RelayUtils.MultichainCreateGlvWithdrawalParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateGlvWithdrawalStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

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

        // transfer GLV tokens from MultichainVault to GlvVault
        _sendTokens(
            account,
            params.createGlvWithdrawalParams.glv,
            address(glvVault), // receiver
            params.glvTokenAmount,
            params.createGlvWithdrawalParams.srcChainId
        );

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

    function createShift(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        RelayUtils.MultichainCreateShiftParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = RelayUtils.getMultichainCreateShiftStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

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

        _sendTokens(
            account,
            params.createShiftParams.fromMarket,
            address(shiftVault), // receiver
            params.marketTokenAmount,
            params.createShiftParams.srcChainId
        );

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

    function _sendTokens(address account, address token, address receiver, uint256 amount, uint256 srcChainId) internal override {
        AccountUtils.validateReceiver(receiver);
        if (srcChainId == 0) {
            router.pluginTransfer(token, account, receiver, amount);
        } else {
            MultichainUtils.transferOut(dataStore, eventEmitter, token, account, receiver, amount, srcChainId);
        }
    }

    function _transferResidualFee(address wnt, address residualFeeReceiver, uint256 residualFee, address account, uint256 srcChainId) internal override {
        TokenUtils.transfer(dataStore, wnt, residualFeeReceiver, residualFee);
        if (residualFeeReceiver == address(multichainVault)) {
            MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, wnt, account, srcChainId);
        }
    }
}
