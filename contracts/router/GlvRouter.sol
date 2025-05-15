// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseRouter.sol";
import "../exchange/IGlvWithdrawalHandler.sol";
import "../exchange/IGlvDepositHandler.sol";
import "../external/IExternalHandler.sol";
import "../glv/glvDeposit/GlvDepositStoreUtils.sol";
import "../glv/glvWithdrawal/GlvWithdrawalStoreUtils.sol";
import "../nonce/NonceUtils.sol";

contract GlvRouter is BaseRouter {
    using GlvDeposit for GlvDeposit.Props;
    using GlvWithdrawal for GlvWithdrawal.Props;

    IGlvDepositHandler public immutable glvDepositHandler;
    IGlvWithdrawalHandler public immutable glvWithdrawalHandler;
    IExternalHandler public immutable externalHandler;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IGlvDepositHandler _glvDepositHandler,
        IGlvWithdrawalHandler _glvWithdrawalHandler,
        IExternalHandler _externalHandler
    ) BaseRouter(_router, _roleStore, _dataStore, _eventEmitter) {
        glvDepositHandler = _glvDepositHandler;
        glvWithdrawalHandler = _glvWithdrawalHandler;
        externalHandler = _externalHandler;
    }

    receive() external payable {
        address wnt = TokenUtils.wnt(dataStore);
        if (msg.sender != wnt) {
            revert Errors.InvalidNativeTokenSender(msg.sender);
        }
    }

    function createGlvDeposit(
        IGlvDepositUtils.CreateGlvDepositParams calldata params
    ) external payable nonReentrant returns (bytes32) {
        address account = msg.sender;

        return glvDepositHandler.createGlvDeposit(account, 0, params); // srcChainId is the current block.chainId
    }

    function cancelGlvDeposit(bytes32 key) external nonReentrant {
        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(dataStore, key);
        if (glvDeposit.account() == address(0)) {
            revert Errors.EmptyGlvDeposit();
        }

        if (glvDeposit.account() != msg.sender) {
            revert Errors.Unauthorized(msg.sender, "account for cancelGlvDeposit");
        }

        glvDepositHandler.cancelGlvDeposit(key);
    }

    function simulateExecuteGlvDeposit(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        glvDepositHandler.simulateExecuteGlvDeposit(key, simulatedOracleParams);
    }

    function simulateExecuteLatestGlvDeposit(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        glvDepositHandler.simulateExecuteGlvDeposit(key, simulatedOracleParams);
    }

    function createGlvWithdrawal(
        IGlvWithdrawalUtils.CreateGlvWithdrawalParams calldata params
    ) external payable nonReentrant returns (bytes32) {
        address account = msg.sender;

        return glvWithdrawalHandler.createGlvWithdrawal(account, 0, params); // srcChainId is the current block.chainId
    }

    function cancelGlvWithdrawal(bytes32 key) external nonReentrant {
        GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawalStoreUtils.get(dataStore, key);
        if (glvWithdrawal.account() == address(0)) {
            revert Errors.EmptyGlvWithdrawal();
        }

        if (glvWithdrawal.account() != msg.sender) {
            revert Errors.Unauthorized(msg.sender, "account for cancelGlvWithdrawal");
        }

        glvWithdrawalHandler.cancelGlvWithdrawal(key);
    }

    function simulateExecuteGlvWithdrawal(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        glvWithdrawalHandler.simulateExecuteGlvWithdrawal(key, simulatedOracleParams);
    }

    function simulateExecuteLatestGlvWithdrawal(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        glvWithdrawalHandler.simulateExecuteGlvWithdrawal(key, simulatedOracleParams);
    }

    // makeExternalCalls can be used to perform an external swap before
    // an action
    // example:
    // - ExchangeRouter.sendTokens(token: WETH, receiver: externalHandler, amount: 1e18)
    // - ExchangeRouter.makeExternalCalls(
    //     WETH.approve(spender: aggregator, amount: 1e18),
    //     aggregator.swap(amount: 1, from: WETH, to: USDC, receiver: orderHandler)
    // )
    // - ExchangeRouter.createOrder
    // the msg.sender for makeExternalCalls would be externalHandler
    // refundTokens can be used to retrieve any excess tokens that may
    // be left in the externalHandler
    function makeExternalCalls(
        address[] memory externalCallTargets,
        bytes[] memory externalCallDataList,
        address[] memory refundTokens,
        address[] memory refundReceivers
    ) external payable nonReentrant {
        externalHandler.makeExternalCalls(
            externalCallTargets,
            externalCallDataList,
            refundTokens,
            refundReceivers
        );
    }
}
