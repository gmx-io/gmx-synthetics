// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./DecreaseOrderUtils.sol";
import "../oracle/OracleUtils.sol";
import "../utils/Array.sol";

library LiquidationUtils {
    using Order for Order.Props;
    using Array for uint256[];

    error NonLiquidatablePosition();

    function processLiquidation(
        OrderUtils.ExecuteOrderParams memory params,
        address account,
        address collateralToken,
        bool isLong
    ) external {
        bytes32 positionKey = PositionUtils.getPositionKey(account, params.market.marketToken, collateralToken, isLong);
        Position.Props memory position = params.positionStore.get(positionKey);
        PositionUtils.validateNonEmptyPosition(position);

        if (!params.oracleBlockNumbers.areGreaterThan(position.increasedAtBlock)) {
            revert(Keys.ORACLE_ERROR);
        }

        Order.Props memory order;
        order.setAccount(account);
        order.setMarket(params.market.marketToken);
        order.setInitialCollateralToken(collateralToken);
        order.setSizeDeltaUsd(position.sizeInUsd);
        order.setAcceptablePrice(isLong ? 0 : type(uint256).max);
        order.setAcceptableUsdAdjustment(-type(int256).max);
        order.setOrderType(Order.OrderType.MarketDecrease);
        order.setIsLong(isLong);

        params.order = order;

        OrderUtils.setExactOrderPrice(
            params.oracle,
            params.market.indexToken,
            params.order.orderType(),
            params.order.acceptablePrice(),
            params.order.isLong()
        );

        MarketUtils.MarketPrices memory prices = MarketUtils.getPricesForPosition(
            params.market,
            params.oracle
        );

        if (!PositionUtils.isPositionLiquidatable(
            params.dataStore,
            position,
            params.market,
            prices
        )) {
            revert NonLiquidatablePosition();
        }

        DecreaseOrderUtils.processOrder(params, true);
    }

}
