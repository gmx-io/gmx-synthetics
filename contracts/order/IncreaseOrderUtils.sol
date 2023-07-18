// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderUtils.sol";
import "../swap/SwapUtils.sol";
import "../position/IncreasePositionUtils.sol";
import "../order/OrderStoreUtils.sol";
import "../callback/CallbackUtils.sol";

// @title IncreaseOrderUtils
// @dev Library for functions to help with processing an increase order
library IncreaseOrderUtils {
    using Position for Position.Props;
    using Order for Order.Props;
    using Array for uint256[];

    // @dev process an increase order
    // @param params BaseOrderUtils.ExecuteOrderParams
    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) external returns (EventUtils.EventLogData memory) {
        MarketUtils.validatePositionMarket(params.contracts.dataStore, params.market);

        (address collateralToken, uint256 collateralIncrementAmount) = SwapUtils.swap(SwapUtils.SwapParams(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.contracts.oracle,
            params.contracts.orderVault,
            params.key,
            params.order.initialCollateralToken(),
            params.order.initialCollateralDeltaAmount(),
            params.swapPathMarkets,
            params.order.minOutputAmount(),
            params.order.market(),
            params.order.uiFeeReceiver(),
            false
        ));

        MarketUtils.validateMarketCollateralToken(params.market, collateralToken);

        bytes32 positionKey = PositionUtils.getPositionKey(params.order.account(), params.order.market(), collateralToken, params.order.isLong());
        Position.Props memory position = PositionStoreUtils.get(params.contracts.dataStore, positionKey);

        // initialize position
        if (position.account() == address(0)) {
            position.setAccount(params.order.account());
            if (position.market() != address(0) || position.collateralToken() != address(0)) {
                revert Errors.UnexpectedPositionState();
            }

            position.setMarket(params.order.market());
            position.setCollateralToken(collateralToken);
            position.setIsLong(params.order.isLong());
        }

        validateOracleBlockNumbers(
            params.minOracleBlockNumbers,
            params.maxOracleBlockNumbers,
            params.order.orderType(),
            params.order.updatedAtBlock()
        );

        IncreasePositionUtils.increasePosition(
            PositionUtils.UpdatePositionParams(
                params.contracts,
                params.market,
                params.order,
                params.key,
                position,
                positionKey,
                params.secondaryOrderType
            ),
            collateralIncrementAmount
        );

        EventUtils.EventLogData memory eventData;
        return eventData;
    }

    // @dev validate the oracle block numbers used for the prices in the oracle
    // @param minOracleBlockNumbers the min oracle block numbers
    // @param maxOracleBlockNumbers the max oracle block numbers
    // @param orderType the order type
    // @param orderUpdatedAtBlock the block at which the order was last updated
    function validateOracleBlockNumbers(
        uint256[] memory minOracleBlockNumbers,
        uint256[] memory maxOracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock
    ) internal pure {
        if (orderType == Order.OrderType.MarketIncrease) {
            OracleUtils.validateBlockNumberWithinRange(
                minOracleBlockNumbers,
                maxOracleBlockNumbers,
                orderUpdatedAtBlock
            );
            return;
        }

        if (orderType == Order.OrderType.LimitIncrease) {
            // since the oracle blocks are only validated against the orderUpdatedAtBlock
            // it is possible to cause a limit increase order to become executable by
            // having the order have an initial collateral amount of zero then opening
            // a position and depositing collateral if the limit order is desired to be executed
            // for this case, when the limit order price is reached, the order should be frozen
            // the frozen order keepers should only execute frozen orders if the latest prices
            // fulfill the limit price
            if (!minOracleBlockNumbers.areGreaterThanOrEqualTo(orderUpdatedAtBlock)) {
                revert Errors.OracleBlockNumbersAreSmallerThanRequired(minOracleBlockNumbers, orderUpdatedAtBlock);
            }
            return;
        }

        revert Errors.UnsupportedOrderType();
    }
}
