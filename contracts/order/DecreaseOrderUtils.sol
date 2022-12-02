// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./OrderBaseUtils.sol";
import "../swap/SwapUtils.sol";
import "../position/DecreasePositionUtils.sol";

// @title DecreaseOrderUtils
// @dev Libary for functions to help with processing a decrease order
library DecreaseOrderUtils {
    using Order for Order.Props;
    using Array for uint256[];

    // @dev process a decrease order
    // @param params OrderBaseUtils.ExecuteOrderParams
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

        DecreasePositionUtils.DecreasePositionResult memory result = DecreasePositionUtils.decreasePosition(
            DecreasePositionUtils.DecreasePositionParams(
                params.dataStore,
                params.eventEmitter,
                params.positionStore,
                params.oracle,
                params.swapHandler,
                params.feeReceiver,
                params.referralStorage,
                params.market,
                order,
                params.swapPathMarkets,
                position,
                positionKey,
                order.sizeDeltaUsd()
            )
        );

        if (
            order.orderType() == Order.OrderType.MarketDecrease ||
            order.orderType() == Order.OrderType.Liquidation ||
            result.adjustedSizeDeltaUsd == order.sizeDeltaUsd()
        ) {
            params.orderStore.remove(params.key, order.account());
        } else {
            order.setSizeDeltaUsd(result.adjustedSizeDeltaUsd);
            // clear execution fee as it would be fully used even for partial fills
            order.setExecutionFee(0);
            order.touch();
            params.orderStore.set(params.key, order);
        }

        // if the pnlToken and the collateralToken are different
        // and if a swap fails or no swap was requested
        // then it is possible to receive two separate tokens from decreasing
        // the position
        // transfer the two tokens to the user in this case and skip processing
        // the swapPath
        if (result.outputAmount > 0 && result.pnlAmountForUser > 0) {
            MarketToken(payable(order.market())).transferOut(
                params.dataStore,
                result.outputToken,
                result.outputAmount,
                order.receiver(),
                order.shouldUnwrapNativeToken()
            );

            MarketToken(payable(order.market())).transferOut(
                params.dataStore,
                result.pnlToken,
                result.pnlAmountForUser,
                order.receiver(),
                order.shouldUnwrapNativeToken()
            );

            return;
        }

        if (order.swapPath().length == 0) {
            MarketToken(payable(order.market())).transferOut(
                params.dataStore,
                result.outputToken,
                result.outputAmount,
                order.receiver(),
                order.shouldUnwrapNativeToken()
            );
        } else {
            try params.swapHandler.swap(SwapUtils.SwapParams(
                params.dataStore,
                params.eventEmitter,
                params.oracle,
                params.feeReceiver,
                result.outputToken,
                result.outputAmount,
                params.swapPathMarkets,
                order.minOutputAmount(),
                order.receiver(),
                order.shouldUnwrapNativeToken()
            )) returns (address /* tokenOut */, uint256 /* swapOutputAmount */) {
            } catch Error(string memory reason) {
                _handleSwapError(
                    params.dataStore,
                    order,
                    result,
                    reason
                );
            } catch (bytes memory _reason) {
                string memory reason = string(abi.encode(_reason));
                _handleSwapError(
                    params.dataStore,
                    order,
                    result,
                    reason
                );
            }
        }
    }

    // @dev validate the oracle block numbers used for the prices in the oracle
    // @param oracleBlockNumbers the oracle block numbers
    // @param orderType the order type
    // @param orderUpdatedAtBlock the block at which the order was last updated
    // @param positionIncreasedAtBlock the block at which the position was last increased
    // @param positionDecreasedAtBlock the block at which the position was last decreased
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

    function _handleSwapError(
        DataStore dataStore,
        Order.Props memory order,
        DecreasePositionUtils.DecreasePositionResult memory result,
        string memory reason
    ) internal {
        emit SwapUtils.SwapReverted(reason);

        MarketToken(payable(order.market())).transferOut(
            dataStore,
            result.outputToken,
            result.outputAmount,
            order.receiver(),
            order.shouldUnwrapNativeToken()
        );
    }
}
