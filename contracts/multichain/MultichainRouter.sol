// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/GelatoRelayRouter.sol";
import "../deposit/DepositUtils.sol";
import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";
import "../withdrawal/WithdrawalUtils.sol";
import "../exchange/WithdrawalHandler.sol";
import "../withdrawal/WithdrawalVault.sol";
import "../exchange/GlvHandler.sol";
import "../glv/GlvVault.sol";

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
        uint256 tokenAmount;
        WithdrawalUtils.CreateWithdrawalParams createWithdrawalParams;
    }

    struct MultichainCreateGlvDepositParams {
        uint256 desChainId;
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        GlvDepositUtils.CreateGlvDepositParams createGlvDepositParams;
    }

    struct MultichainCreateGlvWithdrawalParams {
        uint256 desChainId;
        uint256 glvTokenAmount;
        GlvWithdrawalUtils.CreateGlvWithdrawalParams createGlvWithdrawalParams;
    }

    struct MultichainCreateShiftParams {
        uint256 desChainId;
        uint256 marketTokenAmount;
        ShiftUtils.CreateShiftParams createShiftParams;
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
                "MultichainCreateDepositParams(uint256 desChainId,uint256 longTokenAmount,uint256 shortTokenAmount,CreateDepositParams params)CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
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
                "MultichainCreateWithdrawalParams(uint256 desChainId,uint256 tokenAmount,CreateWithdrawalParams params)CreateWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_WITHDRAWAL_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    bytes32 public constant CREATE_GLV_DEPOSIT_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvDeposit(CreateGlvDepositParams params,bytes32 relayParams)CreateGlvDepositParams(address account,address market,address initialLongToken,address initialShortToken,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant MULTICHAIN_CREATE_GLV_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "MultichainCreateGlvDepositParams(uint256 desChainId,uint256 tokenAmount,CreateGlvDepositParams params)CreateGlvDepositParams(address glv,address market,address receiver,address callbackContract,address uiFeeReceiver,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minGlvTokens,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bool shouldUnwrapNativeToken,bool isMarketTokenDeposit,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_GLV_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvDepositParams(address glv,address market,address receiver,address callbackContract,address uiFeeReceiver,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minGlvTokens,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bool shouldUnwrapNativeToken,bool isMarketTokenDeposit,bytes32[] dataList)"
            )
        );

    bytes32 public constant CREATE_GLV_WITHDRAWAL_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvWithdrawal(CreateGlvWithdrawalParams params,bytes32 relayParams)"
                "CreateGlvWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    bytes32 public constant MULTICHAIN_CREATE_GLV_WITHDRAWAL_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "MultichainCreateGlvWithdrawalParams(uint256 desChainId,uint256 glvTokenAmount,CreateGlvWithdrawalParams params)"
                "CreateGlvWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    bytes32 public constant CREATE_GLV_WITHDRAWAL_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    bytes32 public constant CREATE_SHIFT_TYPEHASH = keccak256(
        "CreateShift(CreateShiftParams params,bytes32 relayParams)CreateShiftParams(address receiver,address callbackContract,address uiFeeReceiver,address fromMarket,address toMarket,uint256 minMarketTokens,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
    );

    bytes32 public constant MULTICHAIN_CREATE_SHIFT_PARAMS_TYPEHASH = keccak256(
        "MultichainCreateShiftParams(uint256 desChainId,uint256 marketTokenAmount,CreateShiftParams params)CreateShiftParams(address receiver,address callbackContract,address uiFeeReceiver,address fromMarket,address toMarket,uint256 minMarketTokens,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
    );

    bytes32 public constant CREATE_SHIFT_PARAMS_TYPEHASH = keccak256(
        "CreateShiftParams(address receiver,address callbackContract,address uiFeeReceiver,address fromMarket,address toMarket,uint256 minMarketTokens,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
    );

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
        MultichainCreateWithdrawalParams memory params // can't use calldata because need to modify params.addresses.receiver & params.numbers.executionFee
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
        MultichainCreateWithdrawalParams memory params // can't use calldata because need to modify params.addresses.receiver & params.numbers.executionFee
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
            params.tokenAmount, // TODO: should remove MultichainCreateWithdrawalParams.tokenAmount and send everything instead? (i.e. sent entire GM multichain balance to WithdrawalVault)
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
        RelayParams calldata relayParams,
        address account,
        MultichainCreateGlvDepositParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = _getMultichainCreateGlvDepositStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return _createGlvDeposit(relayParams, account, params);
    }

    function _createGlvDeposit(
        RelayParams calldata relayParams,
        address account,
        MultichainCreateGlvDepositParams memory params
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
        RelayParams calldata relayParams,
        address account,
        MultichainCreateGlvWithdrawalParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = _getMultichainCreateGlvWithdrawalStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return _createGlvWithdrawal(relayParams, account, params);
    }

    function _createGlvWithdrawal(
        RelayParams calldata relayParams,
        address account,
        MultichainCreateGlvWithdrawalParams memory params
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
        RelayParams calldata relayParams,
        address account,
        MultichainCreateShiftParams memory params
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        if (params.desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }

        bytes32 structHash = _getMultichainCreateShiftStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return _createShift(relayParams, account, params);
    }

    function _createShift(
        RelayParams calldata relayParams,
        address account,
        MultichainCreateShiftParams memory params
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
                    params.tokenAmount,
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

    function _getMultichainCreateGlvDepositStructHash(
        RelayParams calldata relayParams,
        MultichainCreateGlvDepositParams memory params
    ) internal pure returns (bytes32) {
        bytes32 relayParamsHash = keccak256(abi.encode(relayParams));
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_DEPOSIT_TYPEHASH,
                    _getMultichainCreateGlvDepositParamsStructHash(params),
                    relayParamsHash
                )
            );
    }

    function _getMultichainCreateGlvDepositParamsStructHash(
        MultichainCreateGlvDepositParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    MULTICHAIN_CREATE_GLV_DEPOSIT_PARAMS_TYPEHASH,
                    params.desChainId,
                    params.longTokenAmount,
                    params.shortTokenAmount,
                    _getCreateGlvDepositParamsStructHash(params.createGlvDepositParams)
                )
            );
    }

    function _getCreateGlvDepositParamsStructHash(
        GlvDepositUtils.CreateGlvDepositParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_DEPOSIT_PARAMS_TYPEHASH,
                    params.glv,
                    params.market,
                    params.receiver,
                    params.callbackContract,
                    params.uiFeeReceiver,
                    // params.initialLongToken,
                    // params.initialShortToken,
                    // keccak256(abi.encodePacked(params.longTokenSwapPath)),
                    // keccak256(abi.encodePacked(params.shortTokenSwapPath)), // TODO: split CreateGlvDepositParams into groups to fix slot too deep error
                    params.minGlvTokens,
                    params.executionFee,
                    params.callbackGasLimit,
                    params.srcChainId,
                    params.shouldUnwrapNativeToken,
                    params.isMarketTokenDeposit,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function _getMultichainCreateGlvWithdrawalStructHash(
        RelayParams calldata relayParams,
        MultichainCreateGlvWithdrawalParams memory params
    ) internal view returns (bytes32) {
        bytes32 relayParamsHash = keccak256(abi.encode(relayParams));
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_WITHDRAWAL_TYPEHASH,
                    _getMultichainCreateGlvWithdrawalParamsStructHash(params),
                    relayParamsHash
                )
            );
    }

    function _getMultichainCreateGlvWithdrawalParamsStructHash(
        MultichainCreateGlvWithdrawalParams memory params
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    MULTICHAIN_CREATE_GLV_WITHDRAWAL_PARAMS_TYPEHASH,
                    block.chainid,
                    params.glvTokenAmount,
                    _getCreateGlvWithdrawalParamsStructHash(params.createGlvWithdrawalParams)
                )
            );
    }

    function _getCreateGlvWithdrawalParamsStructHash(
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_WITHDRAWAL_PARAMS_TYPEHASH,
                    params.receiver,
                    params.callbackContract,
                    params.uiFeeReceiver,
                    params.market,
                    params.glv,
                    keccak256(abi.encodePacked(params.longTokenSwapPath)),
                    keccak256(abi.encodePacked(params.shortTokenSwapPath)),
                    params.minLongTokenAmount,
                    params.minShortTokenAmount,
                    // params.shouldUnwrapNativeToken, // TODO: split CreateGlvWithdrawalParams into groups to fix slot too deep error
                    params.executionFee,
                    params.callbackGasLimit,
                    params.srcChainId,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function _getMultichainCreateShiftStructHash(
        RelayParams calldata relayParams,
        MultichainCreateShiftParams memory params
    ) internal view returns (bytes32) {
        bytes32 relayParamsHash = keccak256(abi.encode(relayParams));
        return keccak256(
            abi.encode(
                CREATE_SHIFT_TYPEHASH,
                _getMultichainCreateShiftParamsStructHash(params),
                relayParamsHash
            )
        );
    }

    function _getMultichainCreateShiftParamsStructHash(
        MultichainCreateShiftParams memory params
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                MULTICHAIN_CREATE_SHIFT_PARAMS_TYPEHASH,
                block.chainid,
                params.marketTokenAmount,
                _getCreateShiftParamsStructHash(params.createShiftParams)
            )
        );
    }

    function _getCreateShiftParamsStructHash(
        ShiftUtils.CreateShiftParams memory params
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                CREATE_SHIFT_PARAMS_TYPEHASH,
                params.receiver,
                params.callbackContract,
                params.uiFeeReceiver,
                params.fromMarket,
                params.toMarket,
                params.minMarketTokens,
                params.executionFee,
                params.callbackGasLimit,
                params.srcChainId,
                keccak256(abi.encodePacked(params.dataList))
            )
        );
    }

    function createGlvWithdrawal() external nonReentrant onlyGelatoRelay {}

    function createShift() external nonReentrant onlyGelatoRelay {}
}
