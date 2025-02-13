// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/GelatoRelayRouter.sol";
import "../deposit/DepositUtils.sol";
import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";

import "./MultichainUtils.sol";

contract MultichainRouter is GelatoRelayRouter {
    struct MultichainCreateDepositParams {
        uint256 desChainId;
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        DepositUtils.CreateDepositParams createDepositParams;
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

    DepositVault depositVault;
    IDepositHandler depositHandler;
    MultichainVault multichainVault;

    constructor(
        Router _router,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IDepositHandler _depositHandler,
        DepositVault _depositVault,
        MultichainVault _multichainVault
    ) GelatoRelayRouter(_router, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault) {
        depositVault = _depositVault;
        depositHandler = _depositHandler;
        multichainVault = _multichainVault;
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

        return _createDeposit(relayParams.tokenPermits, relayParams.fee, account, params);
    }

    function _createDeposit(
        TokenPermit[] calldata tokenPermits,
        RelayFeeParams calldata fee,
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
            params.createDepositParams.addresses.initialLongToken,
            account,
            address(depositVault), // receiver
            params.longTokenAmount,
            params.createDepositParams.srcChainId
        );
        _sendTokens(
            params.createDepositParams.addresses.initialShortToken,
            account,
            address(depositVault), // receiver
            params.shortTokenAmount,
            params.createDepositParams.srcChainId
        );

        // pay relay fee tokens from MultichainVault to DepositVault and decrease user's multichain balance
        params.createDepositParams.executionFee = _handleRelay(
            contracts,
            tokenPermits,
            fee, // feeAmount is relayFee + executionFee
            params.createDepositParams.srcChainId,
            account,
            NonceUtils.getKey(contracts.dataStore, NonceUtils.getCurrentNonce(dataStore) + 1), // calculate next key without incrementing
            // if initialLongTokenAmount or initialShortTokenAmount is wnt then executionFee will be subracted (in DepositUtils.createDeposit) from one of them
            // otherwise executionFee amount of wnt must be sent to DepositVault => it means the residualFeeReceiver should be the DepositVault
            address(depositVault) // residualFeeReceiver
        );

        return depositHandler.createDeposit(account, params.createDepositParams);
    }

    function _processTransferRequests(address account, RelayUtils.TransferRequest[] calldata transferRequests, uint256 srcChainId) internal {
        for (uint256 i = 0; i < transferRequests.length; i++) {
            RelayUtils.TransferRequest calldata transferRequest = transferRequests[i];
            _sendTokens(account, transferRequest.token, transferRequest.receiver, transferRequest.amount, srcChainId);
        }
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

    function createWithdrawal() external nonReentrant onlyGelatoRelay {}

    function createGlvDeposit() external nonReentrant onlyGelatoRelay {}

    function createGlvWithdrawal() external nonReentrant onlyGelatoRelay {}

    function createShift() external nonReentrant onlyGelatoRelay {}
}
