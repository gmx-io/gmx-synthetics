// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./AutoCancelUtils.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";

import "./Order.sol";
import "./OrderVault.sol";
import "./OrderStoreUtils.sol";
import "./OrderEventUtils.sol";
import "./OrderUtils.sol";

import "../nonce/NonceUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleUtils.sol";
import "../event/EventEmitter.sol";

import "./IncreaseOrderUtils.sol";
import "./DecreaseOrderUtils.sol";
import "./SwapOrderUtils.sol";
import "./BaseOrderUtils.sol";

import "../swap/SwapUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";
import "../utils/AccountUtils.sol";
import "../referral/ReferralUtils.sol";

library ExecuteOrderUtils {
    using Order for Order.Props;
    using Position for Position.Props;
    using Price for Price.Props;
    using Array for uint256[];

    // @dev executes an order
    // @param params BaseOrderUtils.ExecuteOrderParams
    function executeOrder(BaseOrderUtils.ExecuteOrderParams memory params) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        OrderStoreUtils.remove(params.contracts.dataStore, params.key, params.order.account());

        BaseOrderUtils.validateNonEmptyOrder(params.order);

        BaseOrderUtils.validateOrderTriggerPrice(
            params.contracts.oracle,
            params.market.indexToken,
            params.order.orderType(),
            params.order.triggerPrice(),
            params.order.isLong()
        );

        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(
            params.contracts.oracle,
            params.market
        );

        MarketUtils.distributePositionImpactPool(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market.marketToken
        );

        PositionUtils.updateFundingAndBorrowingState(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.market,
            prices
        );

        EventUtils.EventLogData memory eventData = processOrder(params);

        // validate that internal state changes are correct before calling
        // external callbacks
        // if the native token was transferred to the receiver in a swap
        // it may be possible to invoke external contracts before the validations
        // are called
        if (params.market.marketToken != address(0)) {
            MarketUtils.validateMarketTokenBalance(params.contracts.dataStore, params.market);
        }
        MarketUtils.validateMarketTokenBalance(params.contracts.dataStore, params.swapPathMarkets);

        OrderUtils.updateAutoCancelList(params.contracts.dataStore, params.key, params.order, false);

        OrderEventUtils.emitOrderExecuted(
            params.contracts.eventEmitter,
            params.key,
            params.order.account(),
            params.secondaryOrderType
        );

        CallbackUtils.afterOrderExecution(params.key, params.order, eventData);

        // the order.executionFee for liquidation / adl orders is zero
        // gas costs for liquidations / adl is subsidised by the treasury
        GasUtils.payExecutionFee(
            params.contracts.dataStore,
            params.contracts.eventEmitter,
            params.contracts.orderVault,
            params.key,
            params.order.callbackContract(),
            params.order.executionFee(),
            params.startingGas,
            GasUtils.estimateOrderOraclePriceCount(params.order.swapPath().length),
            params.keeper,
            params.order.receiver()
        );

        // clearAutoCancelOrders should be called after the main execution fee
        // is called
        // this is because clearAutoCancelOrders loops through each order for
        // the associated position and calls cancelOrder, which pays the keeper
        // based on the gas usage for each cancel order
        if (BaseOrderUtils.isDecreaseOrder(params.order.orderType())) {
            bytes32 positionKey = BaseOrderUtils.getPositionKey(params.order);
            uint256 sizeInUsd = params.contracts.dataStore.getUint(
                keccak256(abi.encode(positionKey, PositionStoreUtils.SIZE_IN_USD))
            );
            if (sizeInUsd == 0) {
                OrderUtils.clearAutoCancelOrders(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.contracts.orderVault,
                    positionKey,
                    params.keeper
                );
            }
        }
    }

    // @dev process an order execution
    // @param params BaseOrderUtils.ExecuteOrderParams
    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) internal returns (EventUtils.EventLogData memory) {
        if (BaseOrderUtils.isIncreaseOrder(params.order.orderType())) {
            return IncreaseOrderUtils.processOrder(params);
        }

        if (BaseOrderUtils.isDecreaseOrder(params.order.orderType())) {
            return DecreaseOrderUtils.processOrder(params);
        }

        if (BaseOrderUtils.isSwapOrder(params.order.orderType())) {
            return SwapOrderUtils.processOrder(params);
        }

        revert Errors.UnsupportedOrderType(uint256(params.order.orderType()));
    }
}
