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

// @title OrderUtils
// @dev Library for order functions
library OrderUtils {
    using Order for Order.Props;
    using Position for Position.Props;
    using Price for Price.Props;
    using Array for uint256[];

    // @dev creates an order in the order store
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param orderStore OrderStore
    // @param marketStore MarketStore
    // @param account the order account
    // @param params OrderBaseUtils.CreateOrderParams
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

        if (params.addresses.initialCollateralToken == wnt ||
            params.orderType == Order.OrderType.MarketSwap ||
            params.orderType == Order.OrderType.LimitSwap ||
            params.orderType == Order.OrderType.MarketIncrease ||
            params.orderType == Order.OrderType.LimitIncrease
        ) {
            initialCollateralDeltaAmount = orderStore.recordTransferIn(params.addresses.initialCollateralToken);
        }

        if (params.addresses.initialCollateralToken == wnt) {
            require(initialCollateralDeltaAmount >= params.numbers.executionFee, "OrderUtils: invalid executionFee");
            initialCollateralDeltaAmount -= params.numbers.executionFee;
        } else {
            uint256 wntAmount = orderStore.recordTransferIn(wnt);
            require(wntAmount == params.numbers.executionFee, "OrderUtils: invalid wntAmount");
        }

        // validate swap path markets
        MarketUtils.getMarkets(marketStore, params.addresses.swapPath);

        Order.Props memory order;

        order.setAccount(account);
        order.setReceiver(params.addresses.receiver);
        order.setCallbackContract(params.addresses.callbackContract);
        order.setMarket(params.addresses.market);
        order.setInitialCollateralToken(params.addresses.initialCollateralToken);
        order.setSwapPath(params.addresses.swapPath);
        order.setSizeDeltaUsd(params.numbers.sizeDeltaUsd);
        order.setInitialCollateralDeltaAmount(initialCollateralDeltaAmount);
        order.setTriggerPrice(params.numbers.triggerPrice);
        order.setAcceptablePrice(params.numbers.acceptablePrice);
        order.setExecutionFee(params.numbers.executionFee);
        order.setCallbackGasLimit(params.numbers.callbackGasLimit);
        order.setMinOutputAmount(params.numbers.minOutputAmount);
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

    // @dev executes an order
    // @param params OrderBaseUtils.ExecuteOrderParams
    function executeOrder(OrderBaseUtils.ExecuteOrderParams memory params) internal {
        OrderBaseUtils.validateNonEmptyOrder(params.order);

        OrderBaseUtils.setExactOrderPrice(
            params.contracts.oracle,
            params.market.indexToken,
            params.order.orderType(),
            params.order.triggerPrice(),
            params.order.isLong()
        );

        CallbackUtils.beforeOrderExecution(params.key, params.order);

        processOrder(params);

        params.contracts.eventEmitter.emitOrderExecuted(params.key);

        CallbackUtils.afterOrderExecution(params.key, params.order);

        GasUtils.payExecutionFee(
            params.contracts.dataStore,
            params.contracts.orderStore,
            params.order.executionFee(),
            params.startingGas,
            params.keeper,
            params.order.account()
        );
    }

    // @dev process an order execution
    // @param params OrderBaseUtils.ExecuteOrderParams
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

    // @dev cancels an order
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param orderStore OrderStore
    // @param key the key of the order to cancel
    // @param keeper the keeper sending the transaction
    // @param startingGas the starting gas of the transaction
    // @param reason the reason for cancellation
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
                    dataStore,
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

    // @dev freezes an order
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param orderStore OrderStore
    // @param key the key of the order to freeze
    // @param keeper the keeper sending the transaction
    // @param startingGas the starting gas of the transaction
    // @param reason the reason the order was frozen
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
