// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/GelatoRelayRouter.sol";
import "../deposit/DepositUtils.sol";
import "../deposit/DepositVault.sol";
import "../exchange/IDepositHandler.sol";

import "./MultichainVaultHandler.sol";
import "./MultichainUtils.sol";

contract MultichainRouter is GelatoRelayRouter {
    bytes32 public constant CREATE_DEPOSIT_TYPEHASH =
        keccak256(
            bytes(
                "CreateDeposit(CreateDepositParams params,uint256 userNonce,uint256 deadline,bytes32 relayParams)CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit)"
            )
        );
    bytes32 public constant CREATE_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath, uint256 minMarketTokens, bool shouldUnwrapNativeToken, uint256 executionFee, uint256 callbackGasLimit)"
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

    // user funds are bridged into MultichainVault
    // inside depositHandler.createDeposit funds are recorded --> recordTransferIn
    // it is assumed that funds have already been transfered when recordTransferIn is reached
    // TODO: what is the amount and when are tokens transferred to DepositVault (from MultichainVault)? 

    function createDeposit(
        RelayParams calldata relayParams,
        address account,
        uint256 chainId,
        DepositUtils.CreateDepositParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        bytes32 structHash = _getCreateDepositStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        return _createDeposit(relayParams.tokenPermits, relayParams.fee, params, account, chainId);
    }

    function _createDeposit(
        TokenPermit[] calldata tokenPermits,
        RelayFeeParams calldata fee,
        DepositUtils.CreateDepositParams memory params, // can't use calldata because need to modify params.numbers.executionFee
        address account,
        uint256 chainId
    ) internal returns (bytes32) {
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            // TODO: confirm Contracts struct can be modified --> replace `OrderVault orderVault;` field with `StrictBank vault;`
            // otherwise, should probably overridde _handleRelay
            orderVault: OrderVault(payable(depositVault))
        });

        // calculate next key without incrementing (createDeposit will recalculate and increment)
        bytes32 nextKey = NonceUtils.getKey(contracts.dataStore, NonceUtils.getCurrentNonce(dataStore) + 1);

        // funds have already been transferred/bridged to multichain vault
        // pay relay fee from the multicahin vault and decrease user's multichain balance
        params.executionFee = _handleRelay(
            contracts,
            tokenPermits,
            fee,
            address(multichainVault), // account
            nextKey, // deposit key
            address(depositVault) // residualFeeReceiver
        );

        return depositHandler.createDeposit(account, params);
    }

    // TODO: confirm BaseGelatoRelayRouter._sendTokens override
    function _sendTokens(address account, address token, address receiver, uint256 amount) internal override {
        AccountUtils.validateReceiver(receiver);
        multichainVaultHandler.pluginTransfer(token, account, receiver, amount);

        // relay fee ise sent from MultichainVault, from the user's multichain balance

        // to access user's multichain balance --> chainId, account, token are needed
        // dataStore.decrementUint(Keys.sourceChainBalanceKey(chainId, account, token), amount);

        // TODO: means adding the chainId param but then can't override _sendTokens
        // should BaseGelatoRelayRouter._sendTokens also have the chainId param? 
    }

    function _getCreateDepositStructHash(
        RelayParams calldata relayParams,
        DepositUtils.CreateDepositParams memory params
    ) internal pure returns (bytes32) {
        bytes32 relayParamsHash = keccak256(abi.encode(relayParams));

        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_TYPEHASH,
                    _getCreateDepositParamsStructHash(params),
                    relayParamsHash
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
