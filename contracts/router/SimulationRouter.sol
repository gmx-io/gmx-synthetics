// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseRouter.sol";
import "../exchange/IDepositHandler.sol";
import "../exchange/IWithdrawalHandler.sol";
import "../exchange/IShiftHandler.sol";
import "../exchange/IOrderHandler.sol";
import "../exchange/IJitOrderHandler.sol";
import "../glv/glvShift/GlvShiftUtils.sol";
import "../nonce/NonceUtils.sol";
import "../oracle/OracleUtils.sol";
import "../pricing/ISwapPricingUtils.sol";

/**
 * @title SimulationRouter
 * @dev Stateless router exposing only simulation entrypoints (migrated from ExchangeRouter) to keep 
 *      ExchangeRouter within contract bytecode size limits. 
 *      Simulations execute against the latest keyed request via NonceUtils and do not move funds.
 */
contract SimulationRouter is BaseRouter {
    IDepositHandler public immutable depositHandler;
    IWithdrawalHandler public immutable withdrawalHandler;
    IShiftHandler public immutable shiftHandler;
    IOrderHandler public immutable orderHandler;
    IJitOrderHandler public immutable jitOrderHandler;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IDepositHandler _depositHandler,
        IWithdrawalHandler _withdrawalHandler,
        IShiftHandler _shiftHandler,
        IOrderHandler _orderHandler,
        IJitOrderHandler _jitOrderHandler
    ) BaseRouter(_router, _roleStore, _dataStore, _eventEmitter) {
        depositHandler = _depositHandler;
        withdrawalHandler = _withdrawalHandler;
        shiftHandler = _shiftHandler;
        orderHandler = _orderHandler;
        jitOrderHandler = _jitOrderHandler;
    }

    // @dev simulate execution of the latest deposit using provided oracle prices
    function simulateExecuteLatestDeposit(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        depositHandler.simulateExecuteDeposit(key, simulatedOracleParams);
    }

    // @dev simulate execution of the latest withdrawal using provided oracle prices and swap pricing type
    function simulateExecuteLatestWithdrawal(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams,
        ISwapPricingUtils.SwapPricingType swapPricingType
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        withdrawalHandler.simulateExecuteWithdrawal(key, simulatedOracleParams, swapPricingType);
    }

    // @dev simulate execution of the latest shift using provided oracle prices
    function simulateExecuteLatestShift(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        shiftHandler.simulateExecuteShift(key, simulatedOracleParams);
    }

    // @dev simulate execution of the latest order using provided oracle prices
    function simulateExecuteLatestOrder(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        orderHandler.simulateExecuteOrder(key, simulatedOracleParams);
    }

    // @dev simulate execution of the latest JIT order using provided oracle prices and GLV shift params
    function simulateExecuteLatestJitOrder(
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        jitOrderHandler.simulateExecuteJitOrder(shiftParamsList, key, simulatedOracleParams);
    }
}
