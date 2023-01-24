// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderUtils.sol";
import "../swap/SwapUtils.sol";
import "../order/OrderStoreUtils.sol";

// @title SwapOrderUtils
// @dev Library for functions to help with processing a swap order
library SwapOrderUtils {
    using Order for Order.Props;
    using Array for uint256[];

    error UnexpectedMarket();

    // @dev process a swap order
    // @param params BaseOrderUtils.ExecuteOrderParams
    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) external {
        if (params.order.market() != address(0)) {
            revert UnexpectedMarket();
        }

        validateOracleBlockNumbers(
            params.minOracleBlockNumbers,
            params.maxOracleBlockNumbers,
            params.order.orderType(),
            params.order.updatedAtBlock()
        );

        SwapUtils.swap(SwapUtils.SwapParams(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.contracts.oracle,
            params.contracts.orderVault,
            params.order.initialCollateralToken(),
            params.order.initialCollateralDeltaAmount(),
            params.swapPathMarkets,
            params.order.minOutputAmount(),
            params.order.receiver(),
            params.order.shouldUnwrapNativeToken()
        ));

        OrderStoreUtils.remove(params.contracts.dataStore, params.key, params.order.account());
    }

    // @dev validate the oracle block numbers used for the prices in the oracle
    // @param oracleBlockNumbers the oracle block numbers
    // @param orderType the order type
    // @param orderUpdatedAtBlock the block at which the order was last updated
    function validateOracleBlockNumbers(
        uint256[] memory minOracleBlockNumbers,
        uint256[] memory maxOracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock
    ) internal pure {
        if (orderType == Order.OrderType.MarketSwap) {
            OracleUtils.validateBlockNumberWithinRange(
                minOracleBlockNumbers,
                maxOracleBlockNumbers,
                orderUpdatedAtBlock
            );
            return;
        }

        if (orderType == Order.OrderType.LimitSwap) {
            if (!minOracleBlockNumbers.areGreaterThan(orderUpdatedAtBlock)) {
                OracleUtils.revertOracleBlockNumbersAreSmallerThanRequired(minOracleBlockNumbers, orderUpdatedAtBlock);
            }
            return;
        }

        BaseOrderUtils.revertUnsupportedOrderType();
    }
}
