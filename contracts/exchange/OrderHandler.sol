// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "../feature/FeatureUtils.sol";

import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../order/Order.sol";
import "../order/OrderStore.sol";
import "../order/OrderUtils.sol";
import "../order/IncreaseOrderUtils.sol";
import "../order/DecreaseOrderUtils.sol";
import "../order/SwapOrderUtils.sol";

import "../position/PositionStore.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";

contract OrderHandler is RoleModule, ReentrancyGuard, OracleModule {
    using Order for Order.Props;

    DataStore public dataStore;
    MarketStore public marketStore;
    OrderStore public orderStore;
    PositionStore public positionStore;
    Oracle public oracle;
    FeeReceiver public feeReceiver;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        MarketStore _marketStore,
        OrderStore _orderStore,
        PositionStore _positionStore,
        Oracle _oracle,
        FeeReceiver _feeReceiver
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        marketStore = _marketStore;
        orderStore = _orderStore;
        positionStore = _positionStore;
        oracle = _oracle;
        feeReceiver = _feeReceiver;
    }

    receive() external payable {
        require(msg.sender == EthUtils.weth(dataStore), "OrderHandler: invalid sender");
    }

    function createOrder(
        address account,
        OrderUtils.CreateOrderParams memory params
    ) external nonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createOrderFeatureKey(address(this), uint256(params.orderType)));

        return OrderUtils.createOrder(
            dataStore,
            orderStore,
            marketStore,
            account,
            params
        );
    }

    function executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams
    ) external onlyOrderKeeper {
        uint256 startingGas = gasleft();

        try this._executeOrder(
            key,
            oracleParams,
            msg.sender,
            startingGas
        ) {
        } catch Error(string memory reason) {
            bytes32 reasonKey = keccak256(abi.encodePacked(reason));
            // revert instead of cancel if the reason for failure is due to oracle params
            // or order requirements not being met
            if (reasonKey == Keys.ORACLE_ERROR_KEY ||
                reasonKey == Keys.EMPTY_POSITION_ERROR_KEY ||
                reasonKey ==  Keys.INSUFFICIENT_SWAP_OUTPUT_AMOUNT_ERROR_KEY ||
                reasonKey == Keys.UNACCEPTABLE_USD_ADJUSTMENT_ERROR_KEY
            ) {
                revert(reason);
            }

            OrderUtils.cancelOrder(
                dataStore,
                orderStore,
                key,
                msg.sender,
                startingGas
            );
        }
    }

    function updateOrder(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 acceptablePrice,
        int256 acceptableUsdAdjustment
    ) external nonReentrant {
        OrderStore _orderStore = orderStore;
        Order.Props memory order = _orderStore.get(key);

        FeatureUtils.validateFeature(dataStore, Keys.updateOrderFeatureKey(address(this), uint256(order.orderType())));

        require(order.account() == msg.sender, "OrderHandler: forbidden");

        if (OrderUtils.isMarketOrder(order.orderType())) {
            revert("OrderHandler: invalid orderType");
        }

        order.setSizeDeltaUsd(sizeDeltaUsd);
        order.setAcceptablePrice(acceptablePrice);
        order.setAcceptableUsdAdjustment(acceptableUsdAdjustment);

        order.touch();
        _orderStore.set(key, order);
    }

    function cancelOrder(bytes32 key) external {
        uint256 startingGas = gasleft();

        OrderStore _orderStore = orderStore;
        Order.Props memory order = _orderStore.get(key);

        FeatureUtils.validateFeature(dataStore, Keys.cancelOrderFeatureKey(address(this), uint256(order.orderType())));

        require(order.account() == msg.sender, "OrderHandler: forbidden");

        if (OrderUtils.isMarketOrder(order.orderType())) {
            revert("OrderHandler: invalid orderType");
        }

        OrderUtils.cancelOrder(
            dataStore,
            orderStore,
            key,
            msg.sender,
            startingGas
        );
    }

    function _executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) public
        nonReentrant
        onlySelf
        withOraclePrices(oracle, dataStore, oracleParams)
    {
        OrderUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(key, oracleParams, keeper, startingGas);

        FeatureUtils.validateFeature(params.dataStore, Keys.executeOrderFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.setExactOrderPrice(
            params.oracle,
            params.market.indexToken,
            params.order.orderType(),
            params.order.acceptablePrice(),
            params.order.isLong()
        );

        uint256 estimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(params.dataStore, params.order);
        GasUtils.validateExecutionFee(params.dataStore, estimatedGasLimit, params.order.executionFee());

        _processOrder(params);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.orderStore,
            params.order.executionFee(),
            params.startingGas,
            params.keeper,
            params.order.account()
        );
    }

    function _processOrder(OrderUtils.ExecuteOrderParams memory params) internal {
        if (OrderUtils.isIncreaseOrder(params.order.orderType())) {
            IncreaseOrderUtils.processOrder(params);
            return;
        }

        if (OrderUtils.isDecreaseOrder(params.order.orderType())) {
            DecreaseOrderUtils.processOrder(params, false);
            return;
        }

        if (OrderUtils.isSwapOrder(params.order.orderType())) {
            SwapOrderUtils.processOrder(params);
            return;
        }

        OrderUtils.revertUnsupportedOrderType();
    }

    function _getExecuteOrderParams(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) internal view returns (OrderUtils.ExecuteOrderParams memory) {
        OrderUtils.ExecuteOrderParams memory params;

        params.key = key;
        params.order = orderStore.get(key);
        params.swapPathMarkets = MarketUtils.getMarkets(marketStore, params.order.swapPath());

        params.dataStore = dataStore;
        params.orderStore = orderStore;
        params.positionStore = positionStore;
        params.oracle = oracle;
        params.feeReceiver = feeReceiver;
        params.oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        if (params.order.market() != address(0)) {
            params.market = marketStore.get(params.order.market());
        }

        params.keeper = keeper;
        params.startingGas = startingGas;

        OrderUtils.validateNonEmptyOrder(params.order);

        return params;
    }
}
