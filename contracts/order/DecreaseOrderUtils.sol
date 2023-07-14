// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderUtils.sol";
import "../swap/SwapUtils.sol";
import "../position/DecreasePositionUtils.sol";
import "../order/OrderStoreUtils.sol";
import "../error/ErrorUtils.sol";

// @title DecreaseOrderUtils
// @dev Library for functions to help with processing a decrease order
// note that any updates to the eventData
library DecreaseOrderUtils {
    using Position for Position.Props;
    using Order for Order.Props;
    using Array for uint256[];

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // @dev process a decrease order
    // @param params BaseOrderUtils.ExecuteOrderParams
    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) external returns (EventUtils.EventLogData memory) {
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
                positionKey,
                params.secondaryOrderType
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

            return getOutputEventData(
                result.outputToken,
                result.outputAmount,
                result.secondaryOutputToken,
                result.secondaryOutputAmount
            );
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

            return getOutputEventData(
                tokenOut,
                swapOutputAmount,
                address(0),
                0
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

            return getOutputEventData(
                result.outputToken,
                result.outputAmount,
                address(0),
                0
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

    // note that minOutputAmount is treated as a USD value for this validation
    function _validateOutputAmount(
        Oracle oracle,
        address outputToken,
        uint256 outputAmount,
        uint256 minOutputAmount
    ) internal view {
        uint256 outputTokenPrice = oracle.getPrimaryPrice(outputToken).min;
        uint256 outputUsd = outputAmount * outputTokenPrice;

        if (outputUsd < minOutputAmount) {
            revert Errors.InsufficientOutputAmount(outputUsd, minOutputAmount);
        }
    }

    // note that minOutputAmount is treated as a USD value for this validation
    function _validateOutputAmount(
        Oracle oracle,
        address outputToken,
        uint256 outputAmount,
        address secondaryOutputToken,
        uint256 secondaryOutputAmount,
        uint256 minOutputAmount
    ) internal view {
        uint256 outputTokenPrice = oracle.getPrimaryPrice(outputToken).min;
        uint256 outputUsd = outputAmount * outputTokenPrice;

        uint256 secondaryOutputTokenPrice = oracle.getPrimaryPrice(secondaryOutputToken).min;
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

    function getOutputEventData(
        address outputToken,
        uint256 outputAmount,
        address secondaryOutputToken,
        uint256 secondaryOutputAmount
    ) internal pure returns (EventUtils.EventLogData memory) {
        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "outputToken", outputToken);
        eventData.addressItems.setItem(1, "secondaryOutputToken", secondaryOutputToken);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "outputAmount", outputAmount);
        eventData.uintItems.setItem(1, "secondaryOutputAmount", secondaryOutputAmount);

        return eventData;
    }
}
