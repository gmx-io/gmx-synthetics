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

    function simulateExecuteLatestDeposit(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        depositHandler.simulateExecuteDeposit(key, simulatedOracleParams);
    }

    function simulateExecuteLatestWithdrawal(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams,
        ISwapPricingUtils.SwapPricingType swapPricingType
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        withdrawalHandler.simulateExecuteWithdrawal(key, simulatedOracleParams, swapPricingType);
    }

    function simulateExecuteLatestShift(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        shiftHandler.simulateExecuteShift(key, simulatedOracleParams);
    }

    function simulateExecuteLatestOrder(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        orderHandler.simulateExecuteOrder(key, simulatedOracleParams);
    }

    function simulateExecuteLatestJitOrder(
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        jitOrderHandler.simulateExecuteJitOrder(shiftParamsList, key, simulatedOracleParams);
    }
}
