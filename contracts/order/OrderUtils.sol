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

import "../position/PositionUtils.sol";
import "../position/IncreasePositionUtils.sol";
import "../position/DecreasePositionUtils.sol";

import "../market/MarketStore.sol";
import "../swap/SwapUtils.sol";

import "../gas/GasUtils.sol";
import "../eth/EthUtils.sol";

import "../utils/Array.sol";

library OrderUtils {
    using Order for Order.Props;
    using Position for Position.Props;
    using Array for uint256[];

    struct CreateOrderParams {
        address receiver;
        address callbackContract;
        address market;
        address initialCollateralToken;
        address[] swapPath;

        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        int256 acceptablePriceImpactUsd;
        uint256 executionFee;
        uint256 callbackGasLimit;
        uint256 minOutputAmount;

        Order.OrderType orderType;
        bool isLong;
        bool shouldConvertETH;
    }

    struct ExecuteOrderParams {
        bytes32 key;
        Order.Props order;
        Market.Props[] swapPathMarkets;
        DataStore dataStore;
        EventEmitter eventEmitter;
        OrderStore orderStore;
        PositionStore positionStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        uint256[] oracleBlockNumbers;
        Market.Props market;
        address keeper;
        uint256 startingGas;
        bytes32 positionKey;
    }

    error EmptyOrder();
    error UnsupportedOrderType();
    error UnacceptablePriceImpactUsd(int256 priceImpactUsd, int256 acceptablePriceImpactUsd);

    function createOrder(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OrderStore orderStore,
        MarketStore marketStore,
        address account,
        CreateOrderParams memory params
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

        uint256 nonce = NonceUtils.incrementNonce(dataStore);
        bytes32 key = keccak256(abi.encode(nonce));

        order.touch();
        orderStore.set(key, order);

        eventEmitter.emitOrderCreated(key, order);

        return key;
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
        validateNonEmptyOrder(order);

        if (isIncreaseOrder(order.orderType()) || isSwapOrder(order.orderType())) {
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

        GasUtils.payExecutionFee(
            dataStore,
            orderStore,
            order.executionFee(),
            startingGas,
            keeper,
            order.account()
        );

        eventEmitter.emitOrderCancelled(key, reason);
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
        validateNonEmptyOrder(order);

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

    function validateNonEmptyOrder(Order.Props memory order) internal pure {
        if (order.account() == address(0)) {
            revert EmptyOrder();
        }
    }

    function isMarketOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketSwap ||
               orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.MarketDecrease ||
               orderType == Order.OrderType.Liquidation;
    }

    function isLimitOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.LimitSwap ||
               orderType == Order.OrderType.LimitIncrease ||
               orderType == Order.OrderType.LimitDecrease;
    }

    function isSwapOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketSwap ||
               orderType == Order.OrderType.LimitSwap;
    }

    function isPositionOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.LimitIncrease;
    }

    function isIncreaseOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.LimitIncrease;
    }

    function isDecreaseOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketDecrease ||
               orderType == Order.OrderType.LimitDecrease ||
               orderType == Order.OrderType.StopLossDecrease ||
               orderType == Order.OrderType.Liquidation;
    }

    function isLiquidationOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.Liquidation;
    }

    // more info on the logic here can be found in Order.sol
    function setExactOrderPrice(
        Oracle oracle,
        address indexToken,
        Order.OrderType orderType,
        uint256 acceptablePrice,
        bool isLong
    ) internal {
        if (isSwapOrder(orderType)) {
            return;
        }

        // set secondary price to primary price since increase / decrease positions use the secondary price for index token values
        if (orderType == Order.OrderType.MarketIncrease ||
            orderType == Order.OrderType.MarketDecrease ||
            orderType == Order.OrderType.Liquidation) {
            uint256 price = oracle.getPrimaryPrice(indexToken);
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

        revert("OrderUtils: unsupported order type");
    }

    function validateOracleBlockNumbersForSwap(
        uint256[] memory oracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock
    ) internal pure {
        if (orderType == Order.OrderType.MarketSwap) {
            if (!oracleBlockNumbers.areEqualTo(orderUpdatedAtBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        if (orderType == Order.OrderType.LimitSwap) {
            if (!oracleBlockNumbers.areGreaterThan(orderUpdatedAtBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        revertUnsupportedOrderType();
    }

    function validateOracleBlockNumbersForPosition(
        uint256[] memory oracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock,
        uint256 positionIncreasedAtBlock
    ) internal pure {
        if (
            orderType == Order.OrderType.MarketIncrease ||
            orderType == Order.OrderType.MarketDecrease ||
            orderType == Order.OrderType.Liquidation
        ) {
            if (!oracleBlockNumbers.areEqualTo(orderUpdatedAtBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        if (
            orderType == Order.OrderType.LimitIncrease ||
            orderType == Order.OrderType.LimitDecrease ||
            orderType == Order.OrderType.StopLossDecrease
        ) {
            uint256 laterBlock = orderUpdatedAtBlock > positionIncreasedAtBlock ? orderUpdatedAtBlock : positionIncreasedAtBlock;
            if (!oracleBlockNumbers.areGreaterThan(laterBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        revertUnsupportedOrderType();
    }

    function revertUnsupportedOrderType() internal pure {
        revert UnsupportedOrderType();
    }

    function revertUnacceptablePriceImpactUsd(int256 priceImpactUsd, int256 acceptablePriceImpactUsd) internal pure {
        revert UnacceptablePriceImpactUsd(priceImpactUsd, acceptablePriceImpactUsd);
    }
}
