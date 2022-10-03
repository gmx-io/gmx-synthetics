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

        address firstMarket = params.order.swapPath()[0];
        address lastMarket = params.order.swapPath()[params.order.swapPath().length - 1];

        OrderUtils.validateOracleBlockNumbersForSwap(
            params.oracleBlockNumbers,
            params.order.orderType(),
            params.order.updatedAtBlock()
        );

        Order.Props memory order = params.order;
        params.orderStore.transferOut(
            order.initialCollateralToken(),
            order.initialCollateralDeltaAmount(),
            firstMarket
        );

        (address tokenOut, uint256 outputAmount) = SwapUtils.swap(SwapUtils.SwapParams(
            params.dataStore,
            params.oracle,
            params.feeReceiver,
            params.order.initialCollateralToken(),
            params.order.initialCollateralDeltaAmount(),
            params.swapPathMarkets,
            params.order.minOutputAmount(),
            address(0)
        ));

        params.orderStore.remove(params.key, params.order.account());

        MarketToken(lastMarket).transferOut(
            EthUtils.weth(params.dataStore),
            tokenOut,
            outputAmount,
            order.account(),
            order.hasCollateralInETH()
        );
    }
}
