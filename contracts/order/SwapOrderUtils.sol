// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./OrderBaseUtils.sol";
import "../swap/SwapUtils.sol";

// @title SwapOrderUtils
// @dev Libary for functions to help with processing a swap order
library SwapOrderUtils {
    using Order for Order.Props;
    using Array for uint256[];

    error UnexpectedMarket();

    // @dev process a swap order
    // @param params OrderBaseUtils.ExecuteOrderParams
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
        params.contracts.orderStore.transferOut(
            order.initialCollateralToken(),
            params.order.swapPath()[0],
            order.initialCollateralDeltaAmount()
        );

        SwapUtils.swap(SwapUtils.SwapParams(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.contracts.oracle,
            params.contracts.feeReceiver,
            params.order.initialCollateralToken(),
            params.order.initialCollateralDeltaAmount(),
            params.swapPathMarkets,
            params.order.minOutputAmount(),
            params.order.receiver(),
            order.shouldUnwrapNativeToken()
        ));

        params.contracts.orderStore.remove(params.key, params.order.account());
    }

    // @dev validate the oracle block numbers used for the prices in the oracle
    // @param oracleBlockNumbers the oracle block numbers
    // @param orderType the order type
    // @param orderUpdatedAtBlock the block at which the order was last updated
    function validateOracleBlockNumbers(
        uint256[] memory oracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock
    ) internal pure {
        if (orderType == Order.OrderType.MarketSwap) {
            if (!oracleBlockNumbers.areEqualTo(orderUpdatedAtBlock)) {
                OracleUtils.revertOracleBlockNumbersAreNotEqual(oracleBlockNumbers, orderUpdatedAtBlock);
            }
            return;
        }

        if (orderType == Order.OrderType.LimitSwap) {
            if (!oracleBlockNumbers.areGreaterThan(orderUpdatedAtBlock)) {
                OracleUtils.revertOracleBlockNumbersAreSmallerThanRequired(oracleBlockNumbers, orderUpdatedAtBlock);
            }
            return;
        }

        OrderBaseUtils.revertUnsupportedOrderType();
    }
}
