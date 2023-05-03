// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderUtils.sol";
import "../swap/SwapUtils.sol";
import "../position/DecreasePositionUtils.sol";
import "../order/OrderStoreUtils.sol";
import "../error/ErrorUtils.sol";

// @title DecreaseOrderUtils
// @dev Library for functions to help with processing a decrease order
library DecreaseOrderUtils {
    using Position for Position.Props;
    using Order for Order.Props;
    using Array for uint256[];

    // @dev process a decrease order
    // @param params BaseOrderUtils.ExecuteOrderParams
    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) external {
        Order.Props memory order = params.order;
        MarketUtils.validatePositionMarket(params.contracts.dataStore, params.market);

        bytes32 positionKey = PositionUtils.getPositionKey(order.account(), order.market(), order.initialCollateralToken(), order.isLong());
        Position.Props memory position = PositionStoreUtils.get(params.contracts.dataStore, positionKey);
        PositionUtils.validateNonEmptyPosition(position);

        validateOracleBlockNumbers(
            params.minOracleBlockNumbers,
            params.maxOracleBlockNumbers,
            order.orderType(),
            order.updatedAtBlock(),
            position.increasedAtBlock(),
            position.decreasedAtBlock()
        );

        DecreasePositionUtils.DecreasePositionResult memory result = DecreasePositionUtils.decreasePosition(
            PositionUtils.UpdatePositionParams(
                params.contracts,
                params.market,
                order,
                params.key,
                position,
                positionKey
            )
        );

        // if the pnlToken and the collateralToken are different
        // and if a swap fails or no swap was requested
        // then it is possible to receive two separate tokens from decreasing
        // the position
        // transfer the two tokens to the user in this case and skip processing
        // the swapPath
        if (result.secondaryOutputAmount > 0) {
            _validateOutputAmount(
                params.contracts.oracle,
                result.outputToken,
                result.outputAmount,
                result.secondaryOutputToken,
                result.secondaryOutputAmount,
                order.minOutputAmount()
            );

            MarketToken(payable(order.market())).transferOut(
                result.outputToken,
                order.receiver(),
                result.outputAmount,
                order.shouldUnwrapNativeToken()
            );

            MarketToken(payable(order.market())).transferOut(
                result.secondaryOutputToken,
                order.receiver(),
                result.secondaryOutputAmount,
                order.shouldUnwrapNativeToken()
            );

            return;
        }

        try params.contracts.swapHandler.swap(
            SwapUtils.SwapParams(
                params.contracts.dataStore,
                params.contracts.eventEmitter,
                params.contracts.oracle,
                Bank(payable(order.market())),
                params.key,
                result.outputToken,
                result.outputAmount,
                params.swapPathMarkets,
                0,
                order.receiver(),
                order.uiFeeReceiver(),
                order.shouldUnwrapNativeToken()
            )
        ) returns (address tokenOut, uint256 swapOutputAmount) {
            _validateOutputAmount(
                params.contracts.oracle,
                tokenOut,
                swapOutputAmount,
                order.minOutputAmount()
            );
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);

            _handleSwapError(
                params.contracts.oracle,
                order,
                result,
                reason,
                reasonBytes
            );
        }
    }

    // @dev validate the oracle block numbers used for the prices in the oracle
    // @param oracleBlockNumbers the oracle block numbers
    // @param orderType the order type
    // @param orderUpdatedAtBlock the block at which the order was last updated
    // @param positionIncreasedAtBlock the block at which the position was last increased
    // @param positionDecreasedAtBlock the block at which the position was last decreased
    function validateOracleBlockNumbers(
        uint256[] memory minOracleBlockNumbers,
        uint256[] memory maxOracleBlockNumbers,
        Order.OrderType orderType,
        uint256 orderUpdatedAtBlock,
        uint256 positionIncreasedAtBlock,
        uint256 positionDecreasedAtBlock
    ) internal pure {
        if (orderType == Order.OrderType.MarketDecrease) {
            OracleUtils.validateBlockNumberWithinRange(
                minOracleBlockNumbers,
                maxOracleBlockNumbers,
                orderUpdatedAtBlock
            );
            return;
        }

        if (
            orderType == Order.OrderType.LimitDecrease ||
            orderType == Order.OrderType.StopLossDecrease
        ) {
            uint256 latestUpdatedAtBlock = orderUpdatedAtBlock > positionIncreasedAtBlock ? orderUpdatedAtBlock : positionIncreasedAtBlock;
            if (!minOracleBlockNumbers.areGreaterThanOrEqualTo(latestUpdatedAtBlock)) {
                revert Errors.OracleBlockNumbersAreSmallerThanRequired(minOracleBlockNumbers, latestUpdatedAtBlock);
            }
            return;
        }

        if (orderType == Order.OrderType.Liquidation) {
            uint256 latestUpdatedAtBlock = positionIncreasedAtBlock > positionDecreasedAtBlock ? positionIncreasedAtBlock : positionDecreasedAtBlock;

            if (!minOracleBlockNumbers.areGreaterThanOrEqualTo(latestUpdatedAtBlock)) {
                revert Errors.OracleBlockNumbersAreSmallerThanRequired(minOracleBlockNumbers, latestUpdatedAtBlock);
            }
            return;
        }

        revert Errors.UnsupportedOrderType();
    }

    function _validateOutputAmount(
        Oracle oracle,
        address outputToken,
        uint256 outputAmount,
        uint256 minOutputAmount
    ) internal view {
        // for limit / stop-loss orders, the latest price may be the triggerPrice of the order
        // it is possible that the valuation of the token using this price may not be precise
        // and the condition for the order execution to revert may not be accurate
        // this could cause orders to be frozen even if they could be executed, and orders
        // to be executed even if the received amount of tokens is less than what the user
        // expected
        // the user should be informed of this possibility through documentation
        // it is likely preferred that decrease orders are still executed if the trigger price
        // is reached and the acceptable price is fulfillable
        uint256 outputTokenPrice = oracle.getLatestPrice(outputToken).min;
        uint256 outputUsd = outputAmount * outputTokenPrice;

        if (outputUsd < minOutputAmount) {
            revert Errors.InsufficientOutputAmount(outputUsd, minOutputAmount);
        }
    }

    function _validateOutputAmount(
        Oracle oracle,
        address outputToken,
        uint256 outputAmount,
        address secondaryOutputToken,
        uint256 secondaryOutputAmount,
        uint256 minOutputAmount
    ) internal view {
        uint256 outputTokenPrice = oracle.getLatestPrice(outputToken).min;
        uint256 outputUsd = outputAmount * outputTokenPrice;

        uint256 secondaryOutputTokenPrice = oracle.getLatestPrice(secondaryOutputToken).min;
        uint256 secondaryOutputUsd = secondaryOutputAmount * secondaryOutputTokenPrice;

        uint256 totalOutputUsd = outputUsd + secondaryOutputUsd;

        if (totalOutputUsd < minOutputAmount) {
            revert Errors.InsufficientOutputAmount(totalOutputUsd, minOutputAmount);
        }
    }

    function _handleSwapError(
        Oracle oracle,
        Order.Props memory order,
        DecreasePositionUtils.DecreasePositionResult memory result,
        string memory reason,
        bytes memory reasonBytes
    ) internal {
        emit SwapUtils.SwapReverted(reason, reasonBytes);

        _validateOutputAmount(
            oracle,
            result.outputToken,
            result.outputAmount,
            order.minOutputAmount()
        );

        MarketToken(payable(order.market())).transferOut(
            result.outputToken,
            order.receiver(),
            result.outputAmount,
            order.shouldUnwrapNativeToken()
        );
    }
}
