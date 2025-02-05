// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/GelatoRelayRouter.sol";
import "../deposit/DepositUtils.sol";
import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";

import "./MultichainVaultHandler.sol";
import "./MultichainUtils.sol";

contract MultichainRouter is GelatoRelayRouter {
    struct GaslessCreateDepositParams {
        uint256 chainId;
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        DepositUtils.CreateDepositParams createDepositParams;
    }

    // TODO: extract multichain part from GaslessCreateDepositParams struct
    // struct MultichainCreateDepositParams {
    //     uint256 chainId;
    //     uint256 longTokenAmount;
    //     uint256 shortTokenAmount;
    // }

    bytes32 public constant CREATE_DEPOSIT_TYPEHASH =
        keccak256(
            bytes(
                "CreateDeposit(CreateDepositParams params,bytes32 relayParams)CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 chainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 chainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant GASLESS_CREATE_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "GaslessCreateDepositParams(uint256 chainId,uint256 longTokenAmount,uint256 shortTokenAmount,CreateDepositParams params)CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 chainId,bytes32[] dataList)"
            )
        );

    DepositVault depositVault;
    IDepositHandler depositHandler;
    MultichainVault multichainVault;
    MultichainVaultHandler multichainVaultHandler;

    constructor(
        Router _router,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IDepositHandler _depositHandler,
        DepositVault _depositVault,
        MultichainVault _multichainVault,
        MultichainVaultHandler _multichainVaultHandler
    ) GelatoRelayRouter(_router, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault) {
        depositVault = _depositVault;
        depositHandler = _depositHandler;
        multichainVault = _multichainVault;
        multichainVaultHandler = _multichainVaultHandler;
    }

    function createDeposit(
        RelayParams calldata relayParams,
        address account,
        GaslessCreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        bytes32 structHash = _getGaslessCreateDepositStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return _createDeposit(relayParams.tokenPermits, relayParams.fee, account, params);
    }

    function _createDeposit(
        TokenPermit[] calldata tokenPermits,
        RelayFeeParams calldata fee,
        address account,
        GaslessCreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            // TODO: confirm Contracts struct can be modified --> replace `OrderVault orderVault;` field with `StrictBank vault;`
            // otherwise, should probably overridde _handleRelay
            // A: yes, it can be modified
            orderVault: OrderVault(payable(depositVault))
        });

        // transfer long & short tokens from MultichainVault to DepositVault and decrement user's multichain balance
        _sendTokens(
            params.createDepositParams.initialLongToken,
            account,
            address(depositVault), // receiver
            params.longTokenAmount
        );
        _sendTokens(
            params.createDepositParams.initialShortToken,
            account,
            address(depositVault), // receiver
            params.shortTokenAmount
        );

        // On create step: can deduct relay fee fully or partially depending on user’s MultichainVault balance, save any excess pending relay fees and validate that the user has sufficient position collateral to pay for the remaining relay fee
        // On execute step: Deduct pending relay fees from user’s position collateral
        // TODO: confirm partial fee deduction logic

        // pay relay fee tokens from MultichainVault to DepositVault and decrease user's multichain balance
        params.createDepositParams.executionFee = _handleRelay(
            contracts,
            tokenPermits,
            fee, // feeAmount is relayFee + executionFee
            params.createDepositParams.chainId,
            account,
            NonceUtils.getKey(contracts.dataStore, NonceUtils.getCurrentNonce(dataStore) + 1), // calculate next key without incrementing
            // if initialLongTokenAmount or initialShortTokenAmount is wnt then executionFee will be subracted (in DepositUtils.createDeposit) from one of them
            // otherwise executionFee amount of wnt must be sent to DepositVault => it means the residualFeeReceiver should be the DepositVault
            address(depositVault) // residualFeeReceiver
        );

        // TODO: revisit and confirm this logic
        // executionFee will be paid (in DepositUtils.createDeposit) from long or short token
        // but _handleRelay has also transferred the executionFee to depositVault
        // send back executionFee to MultichainVault and re-increase user's multichain balance by the executionFee amount
        // by not doing this check, I think execution fee could get paid twice when initial long or short tokens are the wnt
        // the alternative would be to have MultichainVault as the residualFeeReceiver, but then if none of the initial tokens are wnt, DepositUtils.createDeposit expects the fee to have already been transferred to depositVault and reverts otherwise
        address wnt = TokenUtils.wnt(contracts.dataStore);
        if (params.createDepositParams.initialLongToken == wnt || params.createDepositParams.initialShortToken == wnt) {
            MultichainUtils.increaseBalance(dataStore, account, wnt, params.createDepositParams.executionFee);
            multichainVaultHandler.pluginTransfer(wnt, address(depositVault), address(multichainVault), params.createDepositParams.executionFee);
        }

        return depositHandler.createDeposit(account, params.createDepositParams);
    }

    function _sendTokens(address account, address token, address receiver, uint256 amount) internal override {
        AccountUtils.validateReceiver(receiver);
        MultichainUtils.decreaseBalance(dataStore, account, token, amount);
        multichainVaultHandler.pluginTransfer(token, address(multichainVault), receiver, amount);
    }

    function _transferResidualFee(address wnt, address residualFeeReceiver, uint256 residualFee, uint256 chainId, address account) internal override {
        if (chainId == 0) {
            // sent residualFee to residualFeeReceiver
            TokenUtils.transfer(dataStore, wnt, residualFeeReceiver, residualFee);
        } else {
            // sent residualFee to MultichainVault and increase user's multichain balance
            TokenUtils.multichainTransfer(dataStore, wnt, address(multichainVault), residualFee, account);
        }
    }

    function _getGaslessCreateDepositStructHash(
        RelayParams calldata relayParams,
        GaslessCreateDepositParams memory params
    ) internal pure returns (bytes32) {
        bytes32 relayParamsHash = keccak256(abi.encode(relayParams));

        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_TYPEHASH,
                    _getGaslessCreateDepositParamsStructHash(params),
                    relayParamsHash
                )
            );
    }

    function _getGaslessCreateDepositParamsStructHash(
        GaslessCreateDepositParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    GASLESS_CREATE_DEPOSIT_PARAMS_TYPEHASH,
                    params.chainId,
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
                    params.receiver,
                    params.callbackContract,
                    params.uiFeeReceiver,
                    params.market,
                    params.initialLongToken,
                    params.initialShortToken,
                    keccak256(abi.encodePacked(params.longTokenSwapPath)),
                    keccak256(abi.encodePacked(params.shortTokenSwapPath)),
                    params.minMarketTokens,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit
                )
            );
    }

    function createWithdrawal() external nonReentrant onlyGelatoRelay {}

    function createGlvDeposit() external nonReentrant onlyGelatoRelay {}

    function createGlvWithdrawal() external nonReentrant onlyGelatoRelay {}

    function createShift() external nonReentrant onlyGelatoRelay {}
}
