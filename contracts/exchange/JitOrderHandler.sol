// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/glvShift/GlvShiftUtils.sol";
import "./BaseOrderHandler.sol";
import "../oracle/Oracle.sol";
import "../swap/SwapHandler.sol";
import "../order/OrderStoreUtils.sol";
import "./GlvShiftHandler.sol";
import "./OrderHandler.sol";
import "./IJitOrderHandler.sol";

// Jit stands for Just-in-time liquidity
contract JitOrderHandler is IJitOrderHandler, BaseOrderHandler {
    using Order for Order.Props;

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
    ) external override globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        _executeJitOrder(shiftParamsList, orderKey, false);
    }

    function simulateExecuteJitOrder(
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        bytes32 orderKey,
        OracleUtils.SimulatePricesParams memory oracleParams
    ) external override withSimulatedOraclePrices(oracleParams) globalNonReentrant {
        _executeJitOrder(shiftParamsList, orderKey, true);
    }

    function _executeJitOrder(
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        bytes32 orderKey,
        bool isSimulation
    ) internal {
        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.jitFeatureDisabledKey(address(this)));
        Order.Props memory order = OrderStoreUtils.get(_dataStore, orderKey);
        _validateOrder(order);

        _processShifts(_dataStore, shiftParamsList, order, orderKey);

        // should be called after shifts are processed and right before the order execution for gasleft() to be accurate
        uint256 estimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(_dataStore, order);
        GasUtils.validateExecutionGas(_dataStore, gasleft(), estimatedGasLimit);

        // order should not be cancelled on execution failure otherwise incorrect orders could manipulate GLV to shift liquidity
        orderHandler.doExecuteOrder(
            orderKey,
            order,
            msg.sender,
            isSimulation
        );
    }

    function _validateOrder(Order.Props memory order) internal pure {
        if (!Order.isIncreaseOrder(order.orderType())) {
            revert Errors.JitUnsupportedOrderType(uint256(order.orderType()));
        }
    }

    function _processShifts(
        DataStore _dataStore,
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        Order.Props memory order,
        bytes32 orderKey
    ) internal {
        if (shiftParamsList.length == 0) {
            revert Errors.JitEmptyShiftParams();
        }

        // @note GLV shifts should use the latest prices other if GLV oracle price is used
        // then there may be a discrepancy between GM prices used to calculate GLV oracle price and current GM prices
        // MAX_ATOMIC_ORACLE_PRICE_AGE is used to enforce this
        uint256 updatedAtTime = block.timestamp - _dataStore.getUint(Keys.MAX_ATOMIC_ORACLE_PRICE_AGE);
        if (updatedAtTime < order.updatedAtTime()) {
            updatedAtTime = order.updatedAtTime();
        }

        for (uint256 i = 0; i < shiftParamsList.length; i++) {
            if (order.market() != shiftParamsList[i].toMarket) {
                revert Errors.JitInvalidToMarket(shiftParamsList[i].toMarket, order.market());
            }

            (bytes32 glvShiftKey, GlvShift.Props memory glvShift) = _createGlvShift(
                _dataStore,
                shiftParamsList[i],
                updatedAtTime,
                orderKey,
                i
            );

            glvShiftHandler.doExecuteGlvShift(
                glvShiftKey,
                glvShift,
                msg.sender,
                true // skipRemoval
            );
        }
    }

    function _createGlvShift(
        DataStore _dataStore,
        GlvShiftUtils.CreateGlvShiftParams memory params,
        uint256 updatedAtTime,
        bytes32 orderKey,
        uint256 index
    ) internal returns (bytes32, GlvShift.Props memory) {
        GlvShiftUtils.validateGlvShift(_dataStore, params);
        GlvShift.Props memory glvShift = GlvShift.Props(
            GlvShift.Addresses({ glv: params.glv, fromMarket: params.fromMarket, toMarket: params.toMarket }),
            GlvShift.Numbers({
                marketTokenAmount: params.marketTokenAmount,
                minMarketTokens: params.minMarketTokens,
                updatedAtTime: updatedAtTime
            })
        );
        bytes32 glvShiftKey = keccak256(abi.encode(orderKey, "glvShift", index));
        GlvShiftEventUtils.emitGlvShiftCreated(eventEmitter, glvShiftKey, glvShift);

        return (glvShiftKey, glvShift);
    }
}
