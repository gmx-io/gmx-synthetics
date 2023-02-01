// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderUtils.sol";
import "../swap/SwapUtils.sol";
import "../position/IncreasePositionUtils.sol";
import "../order/OrderStoreUtils.sol";

import "hardhat/console.sol";

// @title IncreaseOrderUtils
// @dev Library for functions to help with processing an increase order
library IncreaseOrderUtils {
    using Position for Position.Props;
    using Order for Order.Props;
    using Array for uint256[];

    error UnexpectedPositionState();
    error InvalidCollateralToken(address collateralToken, address market);

    // @dev process an increase order
    // @param params BaseOrderUtils.ExecuteOrderParams
    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) external {
        MarketUtils.validateEnabledMarket(params.contracts.dataStore, params.market);
        MarketUtils.validatePositionMarket(params.market);

        (address collateralToken, uint256 collateralIncrementAmount) = SwapUtils.swap(SwapUtils.SwapParams(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.contracts.oracle,
            params.contracts.orderVault,
            params.order.initialCollateralToken(),
            params.order.initialCollateralDeltaAmount(),
            params.swapPathMarkets,
            params.order.minOutputAmount(),
            params.order.market(),
            false
        ));

        if (collateralToken != params.market.longToken && collateralToken != params.market.shortToken) {
            revert InvalidCollateralToken(collateralToken, params.market.marketToken);
        }

        bytes32 positionKey = PositionUtils.getPositionKey(params.order.account(), params.order.market(), collateralToken, params.order.isLong());
        Position.Props memory position = PositionStoreUtils.get(params.contracts.dataStore, positionKey);

        // initialize position
        if (position.account() == address(0)) {
            position.setAccount(params.order.account());
            if (position.market() != address(0) || position.collateralToken() != address(0)) {
                revert UnexpectedPositionState();
            }

            position.setMarket(params.order.market());
            position.setCollateralToken(collateralToken);
            position.setIsLong(params.order.isLong());
        }

        validateOracleBlockNumbers(
            params.minOracleBlockNumbers,
            params.maxOracleBlockNumbers,
            params.order.orderType(),
            params.order.updatedAtBlock(),
            position.increasedAtBlock()
        );

        IncreasePositionUtils.increasePosition(
            PositionUtils.UpdatePositionParams(
                params.contracts,
                params.market,
                params.order,
                params.key,
                position,
                positionKey
            ),
            collateralIncrementAmount
        );

        OrderStoreUtils.remove(params.contracts.dataStore, params.key, params.order.account());
    }

    // @dev validate the oracle block numbers used for the prices in the oracle
    // @param minOracleBlockNumbers the min oracle block numbers
    // @param maxOracleBlockNumbers the max oracle block numbers
    // @param orderType the order type
    // @param orderUpdatedAtBlock the block at which the order was last updated
    // @param positionIncreasedAtBlock the block at which the position was last increased
    function validateOracleBlockNumbers(
        uint256[] memory minOracleBlockNumbers,
        uint256[] memory maxOracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock,
        uint256 positionIncreasedAtBlock
    ) internal view {
        if (orderType == Order.OrderType.MarketIncrease) {
            OracleUtils.validateBlockNumberWithinRange(
                minOracleBlockNumbers,
                maxOracleBlockNumbers,
                orderUpdatedAtBlock
            );
            return;
        }

        if (orderType == Order.OrderType.LimitIncrease) {
            console.log("orderUpdatedAtBlock", orderUpdatedAtBlock);
            console.log("positionIncreasedAtBlock", positionIncreasedAtBlock);
            console.log("minOracleBlockNumbers", minOracleBlockNumbers[0]);
            uint256 laterBlock = orderUpdatedAtBlock > positionIncreasedAtBlock ? orderUpdatedAtBlock : positionIncreasedAtBlock;
            if (!minOracleBlockNumbers.areGreaterThan(laterBlock)) {
                OracleUtils.revertOracleBlockNumbersAreSmallerThanRequired(minOracleBlockNumbers, laterBlock);
            }
            return;
        }

        BaseOrderUtils.revertUnsupportedOrderType();
    }
}
