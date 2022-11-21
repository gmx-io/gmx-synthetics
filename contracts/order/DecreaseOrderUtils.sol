// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./OrderBaseUtils.sol";
import "../swap/SwapUtils.sol";
import "../position/DecreasePositionUtils.sol";

library DecreaseOrderUtils {
    using Order for Order.Props;
    using Array for uint256[];

    function processOrder(OrderBaseUtils.ExecuteOrderParams memory params) external {
        Order.Props memory order = params.order;
        MarketUtils.validateNonEmptyMarket(params.market);

        bytes32 positionKey = PositionUtils.getPositionKey(order.account(), order.market(), order.initialCollateralToken(), order.isLong());
        Position.Props memory position = params.positionStore.get(positionKey);
        PositionUtils.validateNonEmptyPosition(position);

        validateOracleBlockNumbers(
            params.oracleBlockNumbers,
            order.orderType(),
            order.updatedAtBlock(),
            position.increasedAtBlock,
            position.decreasedAtBlock
        );

        (uint256 outputAmount, uint256 adjustedSizeDeltaUsd) = DecreasePositionUtils.decreasePosition(
            DecreasePositionUtils.DecreasePositionParams(
                params.dataStore,
                params.eventEmitter,
                params.positionStore,
                params.oracle,
                params.feeReceiver,
                params.market,
                order,
                position,
                positionKey,
                order.sizeDeltaUsd()
            )
        );

        if (
            order.orderType() == Order.OrderType.MarketDecrease ||
            order.orderType() == Order.OrderType.Liquidation ||
            adjustedSizeDeltaUsd == order.sizeDeltaUsd()
        ) {
            params.orderStore.remove(params.key, order.account());
        } else {
            order.setSizeDeltaUsd(adjustedSizeDeltaUsd);
            // clear execution fee as it would be fully used even for partial fills
            order.setExecutionFee(0);
            order.touch();
            params.orderStore.set(params.key, order);
        }

        if (order.swapPath().length == 0) {
            MarketToken(payable(order.market())).transferOut(
                WrapUtils.wnt(params.dataStore),
                order.initialCollateralToken(),
                outputAmount,
                order.receiver(),
                order.shouldUnwrapNativeToken()
            );
        } else {
            SwapUtils.swap(SwapUtils.SwapParams(
                params.dataStore,
                params.eventEmitter,
                params.oracle,
                params.feeReceiver,
                order.initialCollateralToken(),
                order.initialCollateralDeltaAmount(),
                params.swapPathMarkets,
                order.minOutputAmount(),
                order.receiver(),
                order.shouldUnwrapNativeToken()
            ));
        }
    }

    function validateOracleBlockNumbers(
        uint256[] memory oracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock,
        uint256 positionIncreasedAtBlock,
        uint256 positionDecreasedAtBlock
    ) internal pure {
        if (orderType == Order.OrderType.MarketDecrease) {
            if (!oracleBlockNumbers.areEqualTo(orderUpdatedAtBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        if (
            orderType == Order.OrderType.LimitDecrease ||
            orderType == Order.OrderType.StopLossDecrease
        ) {
            uint256 latestUpdatedAtBlock = orderUpdatedAtBlock > positionIncreasedAtBlock ? orderUpdatedAtBlock : positionIncreasedAtBlock;
            if (!oracleBlockNumbers.areGreaterThan(latestUpdatedAtBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        if (orderType == Order.OrderType.Liquidation) {
            uint256 latestUpdatedAtBlock = positionIncreasedAtBlock > positionDecreasedAtBlock ? positionIncreasedAtBlock : positionDecreasedAtBlock;

            if (!oracleBlockNumbers.areGreaterThan(latestUpdatedAtBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        OrderBaseUtils.revertUnsupportedOrderType();
    }

}
