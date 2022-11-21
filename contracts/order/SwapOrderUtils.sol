// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./OrderBaseUtils.sol";
import "../swap/SwapUtils.sol";

library SwapOrderUtils {
    using Order for Order.Props;
    using Array for uint256[];

    error UnexpectedMarket();

    function processOrder(OrderBaseUtils.ExecuteOrderParams memory params) external {
        if (params.order.market() != address(0)) {
            revert UnexpectedMarket();
        }

        validateOracleBlockNumbers(
            params.oracleBlockNumbers,
            params.order.orderType(),
            params.order.updatedAtBlock()
        );

        Order.Props memory order = params.order;
        params.orderStore.transferOut(
            order.initialCollateralToken(),
            order.initialCollateralDeltaAmount(),
            params.order.swapPath()[0]
        );

        SwapUtils.swap(SwapUtils.SwapParams(
            params.dataStore,
            params.eventEmitter,
            params.oracle,
            params.feeReceiver,
            params.order.initialCollateralToken(),
            params.order.initialCollateralDeltaAmount(),
            params.swapPathMarkets,
            params.order.minOutputAmount(),
            params.order.receiver(),
            order.shouldUnwrapNativeToken()
        ));

        params.orderStore.remove(params.key, params.order.account());
    }

    function validateOracleBlockNumbers(
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

        OrderBaseUtils.revertUnsupportedOrderType();
    }
}
