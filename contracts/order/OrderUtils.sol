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
        address market;
        address initialCollateralToken;
        address[] swapPath;

        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        int256 acceptableUsdAdjustment;
        uint256 executionFee;
        uint256 minOutputAmount;

        Order.OrderType orderType;
        bool isLong;
        bool hasCollateralInETH;
    }

    struct ExecuteOrderParams {
        bytes32 key;
        Order.Props order;
        Market.Props[] swapPathMarkets;
        DataStore dataStore;
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

    function createOrder(
        DataStore dataStore,
        OrderStore orderStore,
        MarketStore marketStore,
        address account,
        CreateOrderParams memory params
    ) external returns (bytes32) {
        uint256 initialCollateralDeltaAmount;

        if (params.orderType == Order.OrderType.MarketSwap ||
            params.orderType == Order.OrderType.LimitSwap ||
            params.orderType == Order.OrderType.MarketIncrease ||
            params.orderType == Order.OrderType.LimitIncrease
        ) {
            initialCollateralDeltaAmount = orderStore.recordTransferIn(params.initialCollateralToken);
        }

        address weth = EthUtils.weth(dataStore);
        if (params.initialCollateralToken == weth) {
            initialCollateralDeltaAmount -= params.executionFee;
        } else {
            uint256 wethAmount = orderStore.recordTransferIn(weth);
            require(wethAmount == params.executionFee, "DepositUtils: invalid wethAmount");
        }

        // validate swap path markets
        MarketUtils.getMarkets(marketStore, params.swapPath);

        Order.Props memory order;

        order.setAccount(account);
        order.setMarket(params.market);
        order.setInitialCollateralToken(params.initialCollateralToken);
        order.setSwapPath(params.swapPath);
        order.setSizeDeltaUsd(params.sizeDeltaUsd);
        order.setInitialCollateralDeltaAmount(initialCollateralDeltaAmount);
        order.setAcceptablePrice(params.acceptablePrice);
        order.setAcceptableUsdAdjustment(params.acceptableUsdAdjustment);
        order.setExecutionFee(params.executionFee);
        order.setMinOutputAmount(params.minOutputAmount);
        order.setOrderType(params.orderType);
        order.setIsLong(params.isLong);
        order.setHasCollateralInETH(params.hasCollateralInETH);

        uint256 nonce = NonceUtils.incrementNonce(dataStore);
        bytes32 key = keccak256(abi.encodePacked(nonce));

        order.touch();
        orderStore.set(key, order);

        return key;
    }

    function cancelOrder(
        DataStore dataStore,
        OrderStore orderStore,
        bytes32 key,
        address keeper,
        uint256 startingGas
    ) external {
        Order.Props memory order = orderStore.get(key);
        validateNonEmptyOrder(order);

        if (isIncreaseOrder(order.orderType()) || isSwapOrder(order.orderType())) {
            if (order.initialCollateralDeltaAmount() > 0) {
                orderStore.transferOut(
                    EthUtils.weth(dataStore),
                    order.initialCollateralToken(),
                    order.initialCollateralDeltaAmount(),
                    order.account(),
                    order.hasCollateralInETH()
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
    }

    function validateNonEmptyOrder(Order.Props memory order) internal pure {
        if (order.account() == address(0)) {
            revert EmptyOrder();
        }
    }

    function isMarketOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketSwap ||
               orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.MarketDecrease;
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
               orderType == Order.OrderType.StopLossDecrease;
    }

    // more info on the logic here can be found in Order.sol
    function setExactOrderPrice(
        Oracle oracle,
        address indexToken,
        Order.OrderType orderType,
        uint256 acceptablePrice,
        bool isLong
    ) external {
        if (isSwapOrder(orderType)) {
            return;
        }

        // set secondary price to primary price since increase / decrease positions use the secondary price for index token values
        if (orderType == Order.OrderType.MarketIncrease || orderType == Order.OrderType.MarketDecrease) {
            uint256 price = oracle.getPrimaryPrice(indexToken);
            oracle.setSecondaryPrice(indexToken, price);
            return;
        }

        if (orderType == Order.OrderType.LimitIncrease) {
            uint256 price = oracle.getPrimaryPrice(indexToken);

            if (isLong) {
                if (price > acceptablePrice) { revert(Keys.ORACLE_ERROR); }
                oracle.setSecondaryPrice(indexToken, acceptablePrice);
            } else {
                if (price < acceptablePrice) { revert(Keys.ORACLE_ERROR); }
                oracle.setSecondaryPrice(indexToken, acceptablePrice);
            }

            return;
        }

        if (orderType == Order.OrderType.LimitDecrease) {
            uint256 price = oracle.getPrimaryPrice(indexToken);

            if (isLong) {
                if (price < acceptablePrice) { revert(Keys.ORACLE_ERROR); }
                oracle.setSecondaryPrice(indexToken, acceptablePrice);
            } else {
                if (price > acceptablePrice) { revert(Keys.ORACLE_ERROR); }
                oracle.setSecondaryPrice(indexToken, acceptablePrice);
            }

            return;
        }

        if (orderType == Order.OrderType.StopLossDecrease) {
            uint256 primaryPrice = oracle.getPrimaryPrice(indexToken);
            uint256 secondaryPrice = oracle.getSecondaryPrice(indexToken);

            if (isLong) {
                // to use the acceptablePrice for a stop loss decrease for a long position
                // the earlier price (primaryPrice) must be more than the acceptablePrice
                // and the later price (secondaryPrice) must be less than the acceptablePrice
                bool hasAcceptablePrices = primaryPrice >= acceptablePrice && secondaryPrice <= acceptablePrice;
                if (!hasAcceptablePrices) { revert(Keys.ORACLE_ERROR); }
                oracle.setSecondaryPrice(indexToken, acceptablePrice);
            } else {
                // to use the acceptablePrice for a stop loss decrease for a short position
                // the earlier price (primaryPrice) must be less than the acceptablePrice
                // and the later price (secondaryPrice) must be most than the acceptablePrice
                bool hasAcceptablePrices = primaryPrice <= acceptablePrice && secondaryPrice >= acceptablePrice;
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
            orderType == Order.OrderType.LimitIncrease
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
}
