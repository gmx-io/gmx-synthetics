// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

import "../role/RoleModule.sol";
import "../feature/FeatureUtils.sol";
import "../callback/CallbackUtils.sol";

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
import "../events/EventEmitter.sol";

contract OrderHandler is ReentrancyGuard, Multicall, RoleModule, OracleModule {
    using Order for Order.Props;

    DataStore immutable dataStore;
    MarketStore immutable marketStore;
    OrderStore immutable orderStore;
    PositionStore immutable positionStore;
    Oracle immutable oracle;
    EventEmitter immutable eventEmitter;
    FeeReceiver immutable feeReceiver;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MarketStore _marketStore,
        OrderStore _orderStore,
        PositionStore _positionStore,
        Oracle _oracle,
        FeeReceiver _feeReceiver
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
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
            eventEmitter,
            orderStore,
            marketStore,
            account,
            params
        );
    }

    function executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams
    ) external nonReentrant onlyOrderKeeper {
        uint256 startingGas = gasleft();

        try this._executeOrder(
            key,
            oracleParams,
            msg.sender,
            startingGas
        ) {
        } catch Error(string memory reason) {
            bytes32 reasonKey = keccak256(abi.encode(reason));

            if (
                reasonKey == Keys.ORACLE_ERROR_KEY ||
                reasonKey == Keys.FROZEN_ORDER_ERROR_KEY ||
                reasonKey == Keys.EMPTY_POSITION_ERROR_KEY
            ) {
                revert(reason);
            }

            _handleOrderError(key, startingGas);
        } catch {
            _handleOrderError(key, startingGas);
        }
    }

    function updateOrder(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 acceptablePrice,
        int256 acceptablePriceImpactUsd
    ) external payable nonReentrant {
        OrderStore _orderStore = orderStore;
        Order.Props memory order = _orderStore.get(key);

        FeatureUtils.validateFeature(dataStore, Keys.updateOrderFeatureKey(address(this), uint256(order.orderType())));

        require(order.account() == msg.sender, "OrderHandler: forbidden");

        if (OrderUtils.isMarketOrder(order.orderType())) {
            revert("OrderHandler: invalid orderType");
        }

        order.setSizeDeltaUsd(sizeDeltaUsd);
        order.setAcceptablePrice(acceptablePrice);
        order.setAcceptablePriceImpactUsd(acceptablePriceImpactUsd);
        order.setIsFrozen(false);

        // allow topping up of executionFee as partially filled or frozen orders
        //  will have their executionFee reduced
        uint256 receivedWeth = EthUtils.sendWeth(dataStore, address(_orderStore));
        order.setExecutionFee(order.executionFee() + receivedWeth);

        uint256 estimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(dataStore, order);
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, order.executionFee());

        order.touch();
        _orderStore.set(key, order);

        eventEmitter.emitOrderUpdated(key, sizeDeltaUsd, acceptablePrice, acceptablePriceImpactUsd);
    }

    function cancelOrder(bytes32 key) external nonReentrant {
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
            eventEmitter,
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
        onlySelf
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        OrderUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(key, oracleParams, keeper, startingGas);
        // limit swaps require frozen order keeper as well since on creation it can fail due to output amount
        // which would automatically cause the order to be frozen
        // limit increase and decrease positions may fail due to output amount as well and become frozen
        // but only if their acceptablePrice is reached
        if (params.order.isFrozen() || params.order.orderType() == Order.OrderType.LimitSwap) {
            _validateFrozenOrderKeeper(keeper);
        }

        FeatureUtils.validateFeature(params.dataStore, Keys.executeOrderFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.setExactOrderPrice(
            params.oracle,
            params.market.indexToken,
            params.order.orderType(),
            params.order.acceptablePrice(),
            params.order.isLong()
        );

        _processOrder(params);

        eventEmitter.emitOrderExecuted(params.key);

        CallbackUtils.handleCallback(key, params.order);

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
            DecreaseOrderUtils.processOrder(params);
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
        params.eventEmitter = eventEmitter;
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

    function _handleOrderError(bytes32 key, uint256 startingGas) internal {
        Order.Props memory order = orderStore.get(key);
        bool isMarketOrder = OrderUtils.isMarketOrder(order.orderType());

        if (isMarketOrder) {
            OrderUtils.cancelOrder(
                dataStore,
                eventEmitter,
                orderStore,
                key,
                msg.sender,
                startingGas
            );
        } else {
            // freeze unfulfillable orders to prevent the order system from being gamed
            // an example of gaming would be if a user creates a limit order
            // with size greater than the available amount in the pool
            // the user waits for their limit price to be hit, and if price
            // moves in their favour after, they can deposit into the pool
            // to allow the order to be executed then close the order for a profit
            //
            // frozen order keepers will have additional validations before executing
            // frozen orders to prevent gaming
            //
            // alternatively, the user can call updateOrder to unfreeze the order
            OrderUtils.freezeOrder(
                dataStore,
                eventEmitter,
                orderStore,
                key,
                msg.sender,
                startingGas
            );
        }
    }

    function _validateFrozenOrderKeeper(address keeper) internal view {
        require(roleStore.hasRole(keeper, Role.FROZEN_ORDER_KEEPER), Keys.FROZEN_ORDER_ERROR);
    }
}
