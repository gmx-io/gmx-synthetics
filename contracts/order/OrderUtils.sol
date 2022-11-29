// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../fee/FeeReceiver.sol";

import "./Order.sol";
import "./OrderStore.sol";

import "../nonce/NonceUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";
import "../event/EventEmitter.sol";

import "./IncreaseOrderUtils.sol";
import "./DecreaseOrderUtils.sol";
import "./SwapOrderUtils.sol";
import "./OrderBaseUtils.sol";

import "../market/MarketStore.sol";
import "../swap/SwapUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";

library OrderUtils {
    using Order for Order.Props;
    using Position for Position.Props;
    using Price for Price.Props;
    using Array for uint256[];

    function createOrder(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OrderStore orderStore,
        MarketStore marketStore,
        address account,
        OrderBaseUtils.CreateOrderParams memory params
    ) external returns (bytes32) {
        uint256 initialCollateralDeltaAmount;

        address wnt = TokenUtils.wnt(dataStore);

        if (params.initialCollateralToken == wnt ||
            params.orderType == Order.OrderType.MarketSwap ||
            params.orderType == Order.OrderType.LimitSwap ||
            params.orderType == Order.OrderType.MarketIncrease ||
            params.orderType == Order.OrderType.LimitIncrease
        ) {
            initialCollateralDeltaAmount = orderStore.recordTransferIn(params.initialCollateralToken);
        }

        if (params.initialCollateralToken == wnt) {
            require(initialCollateralDeltaAmount >= params.executionFee, "OrderUtils: invalid executionFee");
            initialCollateralDeltaAmount -= params.executionFee;
        } else {
            uint256 wntAmount = orderStore.recordTransferIn(wnt);
            require(wntAmount == params.executionFee, "OrderUtils: invalid wntAmount");
        }

        // validate swap path markets
        MarketUtils.getMarkets(marketStore, params.swapPath);

        Order.Props memory order;

        order.setAccount(account);
        order.setReceiver(params.receiver);
        order.setCallbackContract(params.callbackContract);
        order.setMarket(params.market);
        order.setInitialCollateralToken(params.initialCollateralToken);
        order.setSwapPath(params.swapPath);
        order.setSizeDeltaUsd(params.sizeDeltaUsd);
        order.setInitialCollateralDeltaAmount(initialCollateralDeltaAmount);
        order.setTriggerPrice(params.triggerPrice);
        order.setAcceptablePrice(params.acceptablePrice);
        order.setExecutionFee(params.executionFee);
        order.setCallbackGasLimit(params.callbackGasLimit);
        order.setMinOutputAmount(params.minOutputAmount);
        order.setOrderType(params.orderType);
        order.setIsLong(params.isLong);
        order.setShouldUnwrapNativeToken(params.shouldUnwrapNativeToken);

        uint256 estimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(dataStore, order);
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, order.executionFee());

        bytes32 key = NonceUtils.getNextKey(dataStore);

        order.touch();
        orderStore.set(key, order);

        eventEmitter.emitOrderCreated(key, order);

        return key;
    }

    function executeOrder(OrderBaseUtils.ExecuteOrderParams memory params) internal {
        OrderBaseUtils.validateNonEmptyOrder(params.order);

        OrderBaseUtils.setExactOrderPrice(
            params.oracle,
            params.market.indexToken,
            params.order.orderType(),
            params.order.triggerPrice(),
            params.order.isLong()
        );

        CallbackUtils.beforeOrderExecution(params.key, params.order);

        processOrder(params);

        params.eventEmitter.emitOrderExecuted(params.key);

        CallbackUtils.afterOrderExecution(params.key, params.order);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.orderStore,
            params.order.executionFee(),
            params.startingGas,
            params.keeper,
            params.order.account()
        );
    }

    function processOrder(OrderBaseUtils.ExecuteOrderParams memory params) internal {
        if (OrderBaseUtils.isIncreaseOrder(params.order.orderType())) {
            IncreaseOrderUtils.processOrder(params);
            return;
        }

        if (OrderBaseUtils.isDecreaseOrder(params.order.orderType())) {
            DecreaseOrderUtils.processOrder(params);
            return;
        }

        if (OrderBaseUtils.isSwapOrder(params.order.orderType())) {
            SwapOrderUtils.processOrder(params);
            return;
        }

        OrderBaseUtils.revertUnsupportedOrderType();
    }

    function cancelOrder(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OrderStore orderStore,
        bytes32 key,
        address keeper,
        uint256 startingGas,
        string memory reason
    ) internal {
        Order.Props memory order = orderStore.get(key);
        OrderBaseUtils.validateNonEmptyOrder(order);

        if (OrderBaseUtils.isIncreaseOrder(order.orderType()) || OrderBaseUtils.isSwapOrder(order.orderType())) {
            if (order.initialCollateralDeltaAmount() > 0) {
                orderStore.transferOut(
                    TokenUtils.wnt(dataStore),
                    order.initialCollateralToken(),
                    order.initialCollateralDeltaAmount(),
                    order.account(),
                    order.shouldUnwrapNativeToken()
                );
            }
        }

        orderStore.remove(key, order.account());

        eventEmitter.emitOrderCancelled(key, reason);

        CallbackUtils.afterOrderCancellation(key, order);

        GasUtils.payExecutionFee(
            dataStore,
            orderStore,
            order.executionFee(),
            startingGas,
            keeper,
            order.account()
        );
    }

    function freezeOrder(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OrderStore orderStore,
        bytes32 key,
        address keeper,
        uint256 startingGas,
        string memory reason
    ) internal {
        Order.Props memory order = orderStore.get(key);
        OrderBaseUtils.validateNonEmptyOrder(order);

        uint256 executionFee = order.executionFee();

        order.setExecutionFee(0);
        order.setIsFrozen(true);
        orderStore.set(key, order);

        GasUtils.payExecutionFee(
            dataStore,
            orderStore,
            executionFee,
            startingGas,
            keeper,
            order.account()
        );

        eventEmitter.emitOrderFrozen(key, reason);

        CallbackUtils.afterOrderFrozen(key, order);
    }
}
