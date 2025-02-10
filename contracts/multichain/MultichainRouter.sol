// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/GelatoRelayRouter.sol";
import "../deposit/DepositUtils.sol";
import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";
import "../withdrawal/WithdrawalUtils.sol";
import "../exchange/WithdrawalHandler.sol";
import "../withdrawal/WithdrawalVault.sol";

import "./MultichainUtils.sol";

contract MultichainRouter is GelatoRelayRouter {
    struct MultichainCreateDepositParams {
        uint256 desChainId;
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        DepositUtils.CreateDepositParams createDepositParams;
    }

    struct MultichainCreateWithdrawalParams {
        uint256 desChainId;
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        WithdrawalUtils.CreateWithdrawalParams createWithdrawalParams;
    }

    bytes32 public constant CREATE_DEPOSIT_TYPEHASH =
        keccak256(
            bytes(
                "CreateDeposit(CreateDepositParams params,bytes32 relayParams)CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant MULTICHAIN_CREATE_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "MultichainCreateDepositParams(uint256 desChainId,uint256 longTokenAmount,uint256 shortTokenAmount,CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_DEPOSIT_PARAMS_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateDepositParamsAdresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
            )
        );

    bytes32 public constant CREATE_WITHDRAWAL_TYPEHASH =
        keccak256(
            bytes(
                "CreateWithdrawal(CreateWithdrawalParams params,bytes32 relayParams)CreateWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    bytes32 public constant MULTICHAIN_CREATE_WITHDRAWAL_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "MultichainCreateWithdrawalParams(uint256 desChainId,uint256 longTokenAmount,uint256 shortTokenAmount,CreateWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    bytes32 public constant CREATE_WITHDRAWAL_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    DepositVault depositVault;
    IDepositHandler depositHandler;
    MultichainVault multichainVault;
    WithdrawalHandler withdrawalHandler;
    WithdrawalVault withdrawalVault;

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
    ) GelatoRelayRouter(_router, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault, _externalHandler) {
        depositVault = _depositVault;
        depositHandler = _depositHandler;
        multichainVault = _multichainVault;
        withdrawalHandler = _withdrawalHandler;
        withdrawalVault = _withdrawalVault;
    }

    function createDeposit(
        RelayParams calldata relayParams,
        address account,
        MultichainCreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = _getMultichainCreateDepositStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return _createDeposit(relayParams, account, params);
    }

    function _createDeposit(
        RelayParams calldata relayParams,
        address account,
        MultichainCreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
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
        RelayParams calldata relayParams,
        address account,
        MultichainCreateWithdrawalParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = _getMultichainCreateWithdrawalStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return _createWithdrawal(relayParams, account, params);
    }

    function _createWithdrawal(
        RelayParams calldata relayParams,
        address account,
        MultichainCreateWithdrawalParams memory params
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: withdrawalVault
        });

        // user already bridged the GM / GLV tokens to the MultichainVault and balance was increased
        // transfer the GM / GLV tokens from multichainVault to withdrawalVault
        _sendTokens(
            account,
            params.createWithdrawalParams.market,
            address(withdrawalVault), // receiver
            params.longTokenAmount, // TODO: should amount be provided by the user, or everything should be withdrawn?
            params.createWithdrawalParams.srcChainId
        );

        params.createWithdrawalParams.executionFee = _handleRelay(
            contracts,
            relayParams,
            account,
            address(withdrawalVault)
        );

        return withdrawalHandler.createWithdrawal(account, params.createWithdrawalParams);
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

    function _getMultichainCreateDepositStructHash(
        RelayParams calldata relayParams,
        MultichainCreateDepositParams memory params
    ) internal view returns (bytes32) {
        bytes32 relayParamsHash = keccak256(abi.encode(relayParams));

        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_TYPEHASH,
                    _getMultichainCreateDepositParamsStructHash(params),
                    relayParamsHash
                )
            );
    }

    function _getMultichainCreateDepositParamsStructHash(
        MultichainCreateDepositParams memory params
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    MULTICHAIN_CREATE_DEPOSIT_PARAMS_TYPEHASH,
                    block.chainid,
                    params.longTokenAmount,
                    params.shortTokenAmount,
                    _getCreateDepositParamsStructHash(params.createDepositParams)
                )
            );
    }

    function _getCreateDepositParamsStructHash(
        DepositUtils.CreateDepositParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_PARAMS_TYPEHASH,
                    _getCreateDepositParamsAdressesStructHash(params.addresses),
                    params.minMarketTokens,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit,
                    params.srcChainId,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function _getCreateDepositParamsAdressesStructHash(
        DepositUtils.CreateDepositParamsAdresses memory addresses
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_PARAMS_ADDRESSES_TYPEHASH,
                    addresses.receiver,
                    addresses.callbackContract,
                    addresses.uiFeeReceiver,
                    addresses.market,
                    addresses.initialLongToken,
                    addresses.initialShortToken,
                    keccak256(abi.encodePacked(addresses.longTokenSwapPath)),
                    keccak256(abi.encodePacked(addresses.shortTokenSwapPath))
                )
            );
    }

    function _getMultichainCreateWithdrawalStructHash(
        RelayParams calldata relayParams,
        MultichainCreateWithdrawalParams memory params
    ) internal view returns (bytes32) {
        bytes32 relayParamsHash = keccak256(abi.encode(relayParams));
        return
            keccak256(
                abi.encode(
                    CREATE_WITHDRAWAL_TYPEHASH,
                    _getMultichainCreateWithdrawalParamsStructHash(params),
                    relayParamsHash
                )
            );
    }

    function _getMultichainCreateWithdrawalParamsStructHash(
        MultichainCreateWithdrawalParams memory params
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    MULTICHAIN_CREATE_WITHDRAWAL_PARAMS_TYPEHASH,
                    block.chainid,
                    params.longTokenAmount,
                    params.shortTokenAmount,
                    _getCreateWithdrawalParamsStructHash(params.createWithdrawalParams)
                )
            );
    }

    function _getCreateWithdrawalParamsStructHash(
        WithdrawalUtils.CreateWithdrawalParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_WITHDRAWAL_PARAMS_TYPEHASH,
                    params.receiver,
                    params.callbackContract,
                    params.uiFeeReceiver,
                    params.market,
                    keccak256(abi.encodePacked(params.longTokenSwapPath)),
                    keccak256(abi.encodePacked(params.shortTokenSwapPath)),
                    params.minLongTokenAmount,
                    params.minShortTokenAmount,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit,
                    params.srcChainId,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function createGlvDeposit() external nonReentrant onlyGelatoRelay {}

    function createGlvWithdrawal() external nonReentrant onlyGelatoRelay {}

    function createShift() external nonReentrant onlyGelatoRelay {}
}
