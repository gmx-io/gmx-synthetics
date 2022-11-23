// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./OrderBaseUtils.sol";
import "../swap/SwapUtils.sol";
import "../position/IncreasePositionUtils.sol";

library IncreaseOrderUtils {
    using Order for Order.Props;
    using Array for uint256[];

    function processOrder(OrderBaseUtils.ExecuteOrderParams memory params) external {
        params.orderStore.transferOut(params.order.initialCollateralToken(), params.order.initialCollateralDeltaAmount(), params.order.market());
        MarketUtils.validateNonEmptyMarket(params.market);

        (address collateralToken, uint256 collateralDeltaAmount) = SwapUtils.swap(SwapUtils.SwapParams(
            params.dataStore,
            params.eventEmitter,
            params.oracle,
            params.feeReceiver,
            params.order.initialCollateralToken(),
            params.order.initialCollateralDeltaAmount(),
            params.swapPathMarkets,
            params.order.minOutputAmount(),
            address(0),
            false
        ));

        bytes32 positionKey = PositionUtils.getPositionKey(params.order.account(), params.order.market(), collateralToken, params.order.isLong());
        Position.Props memory position = params.positionStore.get(positionKey);

        // initialize position
        if (position.account == address(0)) {
            position.account = params.order.account();
            if (position.market != address(0) || position.collateralToken != address(0)) {
                PositionUtils.revertUnexpectedPositionState();
            }

            position.market = params.order.market();
            position.collateralToken = collateralToken;
            position.isLong = params.order.isLong();
        }

        validateOracleBlockNumbers(
            params.oracleBlockNumbers,
            params.order.orderType(),
            params.order.updatedAtBlock(),
            position.increasedAtBlock
        );

        if (collateralToken != params.market.longToken && collateralToken != params.market.shortToken) {
            revert("OrderUtils: invalid collateralToken");
        }

        IncreasePositionUtils.increasePosition(
            IncreasePositionUtils.IncreasePositionParams(
                params.dataStore,
                params.eventEmitter,
                params.positionStore,
                params.oracle,
                params.feeReceiver,
                params.referralStorage,
                params.market,
                params.order,
                position,
                positionKey,
                collateralToken,
                collateralDeltaAmount
            )
        );

        params.orderStore.remove(params.key, params.order.account());
    }

    function validateOracleBlockNumbers(
        uint256[] memory oracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock,
        uint256 positionIncreasedAtBlock
    ) internal pure {
        if (orderType == Order.OrderType.MarketIncrease) {
            if (!oracleBlockNumbers.areEqualTo(orderUpdatedAtBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        if (orderType == Order.OrderType.LimitIncrease) {
            uint256 laterBlock = orderUpdatedAtBlock > positionIncreasedAtBlock ? orderUpdatedAtBlock : positionIncreasedAtBlock;
            if (!oracleBlockNumbers.areGreaterThan(laterBlock)) {
                revert(Keys.ORACLE_ERROR);
            }
            return;
        }

        OrderBaseUtils.revertUnsupportedOrderType();
    }
}
