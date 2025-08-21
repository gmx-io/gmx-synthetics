// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../glv/glvShift/GlvShiftUtils.sol";
import "./BaseOrderHandler.sol";
import "../oracle/Oracle.sol";
import "../swap/SwapHandler.sol";
import "../order/OrderStoreUtils.sol";
import "./GlvShiftHandler.sol";
import "./OrderHandler.sol";
import "./IJitOrderHandler.sol";

// Jit stands for Just-in-time liquidity
contract JitOrderHandler is IJitOrderHandler, BaseOrderHandler, ReentrancyGuard {
    using Order for Order.Props;
    using GlvDeposit for GlvDeposit.Props;
    using GlvShift for GlvShift.Props;
    using GlvWithdrawal for GlvWithdrawal.Props;

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
        OrderHandler _orderHandler,
        GlvShiftHandler _glvShiftHandler
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
        orderHandler = _orderHandler;
        glvShiftHandler = _glvShiftHandler;
    }

    function executeJitOrder(
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        bytes32 orderKey,
        OracleUtils.SetPricesParams calldata oracleParams
    ) override external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        FeatureUtils.validateFeature(dataStore, Keys.createGlvShiftFeatureDisabledKey(address(this)));

        uint256 startingGas = gasleft();

        Order.Props memory order = OrderStoreUtils.get(dataStore, orderKey);
        DataStore _dataStore = dataStore;
        _validateExecutionGas(_dataStore, startingGas, order, shiftParamsList.length);

        for (uint256 i = 0; i < shiftParamsList.length; i++) {
            if (order.market() != shiftParamsList[i].toMarket) {
                revert Errors.JitInvalidToMarket(shiftParamsList[i].toMarket, order.market());
            }

            _shiftLiquidity(_dataStore, shiftParamsList[i], orderKey, order.updatedAtTime());
        }


        orderHandler.executeOrderForController(
            orderKey,
            order,
            startingGas,
            GasUtils.getExecutionGas(_dataStore, gasleft()),
            false // isSimulation
        );
    }

    function simulateExecuteJitOrder(
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        bytes32 orderKey,
        OracleUtils.SimulatePricesParams memory oracleParams
    ) external globalNonReentrant withSimulatedOraclePrices(oracleParams) {
        DataStore _dataStore = dataStore;
        Order.Props memory order = OrderStoreUtils.get(dataStore, orderKey);

        for (uint256 i = 0; i < shiftParamsList.length; i++) {
            if (order.market() != shiftParamsList[i].toMarket) {
                revert Errors.JitInvalidToMarket(shiftParamsList[i].toMarket, order.market());
            }

            _shiftLiquidity(_dataStore, shiftParamsList[i], orderKey, order.updatedAtTime());
        }

        orderHandler._executeOrder(
            orderKey,
            order,
            msg.sender,
            true // isSimulation
        );
    }

    function _shiftLiquidity(
        DataStore _dataStore,
        GlvShiftUtils.CreateGlvShiftParams memory params,
        bytes32 orderKey,
        uint256 orderUpdatedAtTime
    ) internal {
        (bytes32 glvShiftKey, GlvShift.Props memory glvShift) = _createGlvShift(
            _dataStore,
            params,
            orderUpdatedAtTime,
            orderKey
        );

        glvShiftHandler._executeGlvShift(
            glvShiftKey,
            glvShift,
            msg.sender,
            true // skipRemoval
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

    function _validateExecutionGas(DataStore _dataStore, uint256 startingGas, Order.Props memory order, uint256 shiftsCount) internal view {
        uint256 glvShiftEstimatedGasLimit = GasUtils.estimateExecuteGlvShiftGasLimit(_dataStore) * shiftsCount;
        uint256 orderEstimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(_dataStore, order);

        uint256 estimatedGasLimit = glvShiftEstimatedGasLimit + orderEstimatedGasLimit;
        GasUtils.validateExecutionGas(_dataStore, startingGas, estimatedGasLimit);
    }
}
