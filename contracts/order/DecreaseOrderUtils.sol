// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./OrderUtils.sol";

library DecreaseOrderUtils {
    using Order for Order.Props;

    function processOrder(OrderUtils.ExecuteOrderParams memory params, bool forLiquidation) external {
        Order.Props memory order = params.order;
        MarketUtils.validateNonEmptyMarket(params.market);

        bytes32 positionKey = PositionUtils.getPositionKey(order.account(), order.market(), order.initialCollateralToken(), order.isLong());
        Position.Props memory position = params.positionStore.get(positionKey);
        PositionUtils.validateNonEmptyPosition(position);

        OrderUtils.validateOracleBlockNumbersForPosition(
            params.oracleBlockNumbers,
            params.order.orderType(),
            params.order.updatedAtBlock(),
            position.increasedAtBlock
        );

        (uint256 outputAmount, uint256 adjustedSizeDeltaUsd) = DecreasePositionUtils.decreasePosition(
            DecreasePositionUtils.DecreasePositionParams(
                params.dataStore,
                params.positionStore,
                params.oracle,
                params.feeReceiver,
                params.market,
                order,
                position,
                positionKey,
                params.order.sizeDeltaUsd(),
                forLiquidation
            )
        );

        if (adjustedSizeDeltaUsd == params.order.sizeDeltaUsd()) {
            params.orderStore.remove(params.key, params.order.account());
        } else {
            params.order.setSizeDeltaUsd(adjustedSizeDeltaUsd);
            // the order is updated but we do not call order.touch() here
            // this should not be gameable
            params.orderStore.set(params.key, params.order);
        }

        if (order.swapPath().length == 0) {
            MarketToken(order.market()).transferOut(
                EthUtils.weth(params.dataStore),
                order.initialCollateralToken(),
                outputAmount,
                order.account(),
                order.hasCollateralInETH()
            );
        } else {
            SwapUtils.swap(SwapUtils.SwapParams(
                params.dataStore,
                params.oracle,
                params.feeReceiver,
                params.order.initialCollateralToken(),
                params.order.initialCollateralDeltaAmount(),
                params.swapPathMarkets,
                params.order.minOutputAmount(),
                params.order.account()
            ));
        }
    }
}
