// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// import "./BaseHandler.sol";

// import "../glv/glvDeposit/GlvDepositUtils.sol";
// import "../glv/glvWithdrawal/GlvWithdrawalUtils.sol";
import "../glv/glvShift/GlvShiftUtils.sol";
import "./BaseOrderHandler.sol";
import "../oracle/Oracle.sol";
import "../swap/SwapHandler.sol";
import "../order/OrderStoreUtils.sol";
import "./IOrderExecutor.sol";
import "../order/OrderUtils.sol";
import "../order/ExecuteOrderUtils.sol";
import "./GlvShiftHandler.sol";
import "./OrderHandler.sol";

// Jit stands for Just-in-time liquidity
contract JitOrderHandler is BaseOrderHandler, ReentrancyGuard {
    using Order for Order.Props;
    using GlvDeposit for GlvDeposit.Props;
    using GlvShift for GlvShift.Props;
    using GlvWithdrawal for GlvWithdrawal.Props;

    GlvVault public immutable glvVault;
    ShiftVault public immutable shiftVault;

    GlvShiftHandler public immutable glvShiftHandler;
    OrderHandler public immutable orderHandler;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        MultichainVault _multichainVault,
        OrderVault _orderVault,
        SwapHandler _swapHandler,
        IReferralStorage _referralStorage,
        GlvVault _glvVault,
        ShiftVault _shiftVault,
        OrderHandler _orderHandler
    )
        BaseOrderHandler(
            _roleStore,
            _dataStore,
            _eventEmitter,
            _oracle,
            _multichainVault,
            _orderVault,
            _swapHandler,
            _referralStorage
        )
    {
        glvVault = _glvVault;
        shiftVault = _shiftVault;
        orderHandler = _orderHandler;
    }

    function shiftLiquidityAndExecuteOrder(
        GlvShiftUtils.CreateGlvShiftParams memory params,
        bytes32 orderKey,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        FeatureUtils.validateFeature(dataStore, Keys.createGlvShiftFeatureDisabledKey(address(this)));

        uint256 startingGas = gasleft();
        DataStore _dataStore = dataStore;

        Order.Props memory order = OrderStoreUtils.get(dataStore, orderKey);

        if (order.market() != params.toMarket) {
            revert Errors.GlvInvalidToMarket(params.toMarket, order.market());
        }

        _validateExecutionGas(_dataStore, startingGas, order);

        (bytes32 glvShiftKey, GlvShift.Props memory glvShift) = _createGlvShift(
            _dataStore,
            params,
            order.updatedAtTime(),
            orderKey
        );

        glvShiftHandler.executeGlvShiftForController(
            glvShiftKey,
            glvShift,
            GasUtils.getExecutionGas(_dataStore, gasleft())
        );

        orderHandler.executeOrderForController(
            orderKey,
            order,
            startingGas,
            GasUtils.getExecutionGas(_dataStore, gasleft())
        );
    }

    function _createGlvShift(
        DataStore _dataStore,
        GlvShiftUtils.CreateGlvShiftParams memory params,
        uint256 orderUpdatedAtTime,
        bytes32 orderKey
    ) internal returns (bytes32, GlvShift.Props memory) {
        GlvShiftUtils.validateGlvShift(_dataStore, params);
        GlvShift.Props memory glvShift = GlvShift.Props(
            GlvShift.Addresses({ glv: params.glv, fromMarket: params.fromMarket, toMarket: params.toMarket }),
            GlvShift.Numbers({
                marketTokenAmount: params.marketTokenAmount,
                minMarketTokens: params.minMarketTokens,
                updatedAtTime: orderUpdatedAtTime
            })
        );
        bytes32 glvShiftKey = keccak256(abi.encode(orderKey, "glvShift"));
        GlvShiftEventUtils.emitGlvShiftCreated(eventEmitter, glvShiftKey, glvShift);

        return (glvShiftKey, glvShift);
    }

    function _validateExecutionGas(DataStore _dataStore, uint256 startingGas, Order.Props memory order) internal view {
        uint256 glvShiftEstimatedGasLimit = GasUtils.estimateExecuteGlvShiftGasLimit(_dataStore);
        uint256 orderEstimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(_dataStore, order);

        uint256 estimatedGasLimit = glvShiftEstimatedGasLimit + orderEstimatedGasLimit;
        GasUtils.validateExecutionGas(_dataStore, startingGas, estimatedGasLimit);
    }
}
