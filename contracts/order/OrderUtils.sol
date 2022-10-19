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
import "../events/EventEmitter.sol";

import "./IncreaseOrderUtils.sol";
import "./DecreaseOrderUtils.sol";
import "./SwapOrderUtils.sol";
import "./OrderBaseUtils.sol";

import "../market/MarketStore.sol";
import "../swap/SwapUtils.sol";

import "../gas/GasUtils.sol";
import "../eth/EthUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";

library OrderUtils {
    using Order for Order.Props;
    using Position for Position.Props;
    using Array for uint256[];

    function createOrder(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OrderStore orderStore,
        MarketStore marketStore,
        address account,
        OrderBaseUtils.CreateOrderParams memory params
    ) internal returns (bytes32) {
        uint256 initialCollateralDeltaAmount;

        address weth = EthUtils.weth(dataStore);

        if (params.initialCollateralToken == weth ||
            params.orderType == Order.OrderType.MarketSwap ||
            params.orderType == Order.OrderType.LimitSwap ||
            params.orderType == Order.OrderType.MarketIncrease ||
            params.orderType == Order.OrderType.LimitIncrease
        ) {
            initialCollateralDeltaAmount = orderStore.recordTransferIn(params.initialCollateralToken);
        }

        if (params.initialCollateralToken == weth) {
            require(initialCollateralDeltaAmount >= params.executionFee, "OrderUtils: invalid executionFee");
            initialCollateralDeltaAmount -= params.executionFee;
        } else {
            uint256 wethAmount = orderStore.recordTransferIn(weth);
            require(wethAmount == params.executionFee, "OrderUtils: invalid wethAmount");
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
        order.setAcceptablePrice(params.acceptablePrice);
        order.setAcceptablePriceImpactUsd(params.acceptablePriceImpactUsd);
        order.setExecutionFee(params.executionFee);
        order.setCallbackGasLimit(params.callbackGasLimit);
        order.setMinOutputAmount(params.minOutputAmount);
        order.setOrderType(params.orderType);
        order.setIsLong(params.isLong);
        order.setShouldConvertETH(params.shouldConvertETH);

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

        setExactOrderPrice(
            params.oracle,
            params.market.indexToken,
            params.order.orderType(),
            params.order.acceptablePrice(),
            params.order.isLong()
        );

        processOrder(params);

        params.eventEmitter.emitOrderExecuted(params.key);

        CallbackUtils.handleExecution(params.key, params.order);

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
        bytes32 reason
    ) internal {
        Order.Props memory order = orderStore.get(key);
        OrderBaseUtils.validateNonEmptyOrder(order);

        if (OrderBaseUtils.isIncreaseOrder(order.orderType()) || OrderBaseUtils.isSwapOrder(order.orderType())) {
            if (order.initialCollateralDeltaAmount() > 0) {
                orderStore.transferOut(
                    EthUtils.weth(dataStore),
                    order.initialCollateralToken(),
                    order.initialCollateralDeltaAmount(),
                    order.account(),
                    order.shouldConvertETH()
                );
            }
        }

        orderStore.remove(key, order.account());

        eventEmitter.emitOrderCancelled(key, reason);

        CallbackUtils.handleCancellation(key, order);

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
        bytes32 reason
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
    }

    // more info on the logic here can be found in Order.sol
    function setExactOrderPrice(
        Oracle oracle,
        address indexToken,
        Order.OrderType orderType,
        uint256 acceptablePrice,
        bool isLong
    ) internal {
        if (OrderBaseUtils.isSwapOrder(orderType)) {
            return;
        }

        // set secondary price to primary price since increase / decrease positions use the secondary price for index token values
        if (orderType == Order.OrderType.MarketIncrease ||
            orderType == Order.OrderType.MarketDecrease ||
            orderType == Order.OrderType.Liquidation) {
            Price.Props memory price = oracle.getPrimaryPrice(indexToken);
            oracle.setSecondaryPrice(indexToken, price);
            return;
        }

        if (orderType == Order.OrderType.LimitIncrease ||
            orderType == Order.OrderType.LimitDecrease ||
            orderType == Order.OrderType.StopLossDecrease
        ) {
            uint256 primaryPrice = oracle.getPrimaryPrice(indexToken);
            uint256 secondaryPrice = oracle.getSecondaryPrice(indexToken);

            bool shouldValidateAscendingPrice;
            if (orderType == Order.OrderType.LimitIncrease) {
                // for long increase orders, the oracle prices should be descending
                // for short increase orders, the oracle prices should be ascending
                shouldValidateAscendingPrice = !isLong;
            } else {
                // for long decrease orders, the oracle prices should be ascending
                // for short decrease orders, the oracle prices should be descending
                shouldValidateAscendingPrice = isLong;
            }

            if (shouldValidateAscendingPrice) {
                // check that the earlier price (primaryPrice) is smaller than the acceptablePrice
                // and that the later price (secondaryPrice) is larger than the acceptablePrice
                bool hasAcceptablePrices = primaryPrice <= acceptablePrice && secondaryPrice >= acceptablePrice;
                if (!hasAcceptablePrices) { revert(Keys.ORACLE_ERROR); }
                oracle.setSecondaryPrice(indexToken, acceptablePrice);
            } else {
                // check that the earlier price (primaryPrice) is larger than the acceptablePrice
                // and that the later price (secondaryPrice) is smaller than the acceptablePrice
                bool hasAcceptablePrices = primaryPrice >= acceptablePrice && secondaryPrice <= acceptablePrice;
                if (!hasAcceptablePrices) { revert(Keys.ORACLE_ERROR); }
                oracle.setSecondaryPrice(indexToken, acceptablePrice);
            }

            return;
        }

        OrderBaseUtils.revertUnsupportedOrderType();
    }
}
