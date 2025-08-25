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
    ) external override globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.jitFeatureDisabledKey(address(this)));

        Order.Props memory order = OrderStoreUtils.get(_dataStore, orderKey);
        _validateOrder(order);

        _processShifts(_dataStore, shiftParamsList, order, orderKey);

        uint256 estimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(dataStore, order);
        // use gasleft() instead of startingGas to account for gas spent on GLV shifts
        GasUtils.validateExecutionGas(dataStore, gasleft(), estimatedGasLimit);

        orderHandler.executeOrderFromController(
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
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.jitFeatureDisabledKey(address(this)));
        Order.Props memory order = OrderStoreUtils.get(_dataStore, orderKey);
        _validateOrder(order);

        _processShifts(_dataStore, shiftParamsList, order, orderKey);

        orderHandler.executeOrderFromController(
            orderKey,
            order,
            startingGas,
            GasUtils.getExecutionGas(_dataStore, gasleft()),
            true // isSimulation
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

        for (uint256 i = 0; i < shiftParamsList.length; i++) {
            if (order.market() != shiftParamsList[i].toMarket) {
                revert Errors.JitInvalidToMarket(shiftParamsList[i].toMarket, order.market());
            }

            (bytes32 glvShiftKey, GlvShift.Props memory glvShift) = _createGlvShift(
                _dataStore,
                shiftParamsList[i],
                order.updatedAtTime(),
                orderKey
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
}
