// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./OrderUtils.sol";

library SwapOrderUtils {
    using Order for Order.Props;

    error UnexpectedMarket();

    function processOrder(OrderUtils.ExecuteOrderParams memory params) external {
        if (params.order.market() != address(0)) {
            revert UnexpectedMarket();
        }

        OrderUtils.validateOracleBlockNumbersForSwap(
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

        params.orderStore.remove(params.key, params.order.account());

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
            order.shouldConvertETH()
        ));
    }
}
