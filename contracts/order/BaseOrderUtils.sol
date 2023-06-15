// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Order.sol";
import "../market/Market.sol";

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../referral/IReferralStorage.sol";

import "../order/OrderVault.sol";

import "../oracle/Oracle.sol";
import "../swap/SwapHandler.sol";

// @title Order
// @dev Library for common order functions used in OrderUtils, IncreaseOrderUtils
// DecreaseOrderUtils, SwapOrderUtils
library BaseOrderUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    using Order for Order.Props;
    using Price for Price.Props;

    // @dev CreateOrderParams struct used in createOrder to avoid stack
    // too deep errors
    //
    // @param addresses address values
    // @param numbers number values
    // @param orderType for order.orderType
    // @param decreasePositionSwapType for order.decreasePositionSwapType
    // @param isLong for order.isLong
    // @param shouldUnwrapNativeToken for order.shouldUnwrapNativeToken
    struct CreateOrderParams {
        CreateOrderParamsAddresses addresses;
        CreateOrderParamsNumbers numbers;
        Order.OrderType orderType;
        Order.DecreasePositionSwapType decreasePositionSwapType;
        bool isLong;
        bool shouldUnwrapNativeToken;
        bytes32 referralCode;
    }

    // @param receiver for order.receiver
    // @param callbackContract for order.callbackContract
    // @param market for order.market
    // @param initialCollateralToken for order.initialCollateralToken
    // @param swapPath for order.swapPath
    struct CreateOrderParamsAddresses {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address initialCollateralToken;
        address[] swapPath;
    }

    // @param sizeDeltaUsd for order.sizeDeltaUsd
    // @param triggerPrice for order.triggerPrice
    // @param acceptablePrice for order.acceptablePrice
    // @param executionFee for order.executionFee
    // @param callbackGasLimit for order.callbackGasLimit
    // @param minOutputAmount for order.minOutputAmount
    struct CreateOrderParamsNumbers {
        uint256 sizeDeltaUsd;
        uint256 initialCollateralDeltaAmount;
        uint256 triggerPrice;
        uint256 acceptablePrice;
        uint256 executionFee;
        uint256 callbackGasLimit;
        uint256 minOutputAmount;
    }

    // @dev ExecuteOrderParams struct used in executeOrder to avoid stack
    // too deep errors
    //
    // @param contracts ExecuteOrderParamsContracts
    // @param key the key of the order to execute
    // @param order the order to execute
    // @param swapPathMarkets the market values of the markets in the swapPath
    // @param minOracleBlockNumbers the min oracle block numbers
    // @param maxOracleBlockNumbers the max oracle block numbers
    // @param market market values of the trading market
    // @param keeper the keeper sending the transaction
    // @param startingGas the starting gas
    // @param secondaryOrderType the secondary order type
    struct ExecuteOrderParams {
        ExecuteOrderParamsContracts contracts;
        bytes32 key;
        Order.Props order;
        Market.Props[] swapPathMarkets;
        uint256[] minOracleBlockNumbers;
        uint256[] maxOracleBlockNumbers;
        Market.Props market;
        address keeper;
        uint256 startingGas;
        Order.SecondaryOrderType secondaryOrderType;
    }

    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param orderVault OrderVault
    // @param oracle Oracle
    // @param swapHandler SwapHandler
    // @param referralStorage IReferralStorage
    struct ExecuteOrderParamsContracts {
        DataStore dataStore;
        EventEmitter eventEmitter;
        OrderVault orderVault;
        Oracle oracle;
        SwapHandler swapHandler;
        IReferralStorage referralStorage;
    }

    struct GetExecutionPriceCache {
        uint256 price;
        uint256 executionPrice;
        int256 adjustedPriceImpactUsd;
    }

    // @dev check if an orderType is a market order
    // @param orderType the order type
    // @return whether an orderType is a market order
    function isMarketOrder(Order.OrderType orderType) internal pure returns (bool) {
        // a liquidation order is not considered as a market order
        return orderType == Order.OrderType.MarketSwap ||
               orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.MarketDecrease;
    }

    // @dev check if an orderType is a limit order
    // @param orderType the order type
    // @return whether an orderType is a limit order
    function isLimitOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.LimitSwap ||
               orderType == Order.OrderType.LimitIncrease ||
               orderType == Order.OrderType.LimitDecrease;
    }

    // @dev check if an orderType is a swap order
    // @param orderType the order type
    // @return whether an orderType is a swap order
    function isSwapOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketSwap ||
               orderType == Order.OrderType.LimitSwap;
    }

    // @dev check if an orderType is a position order
    // @param orderType the order type
    // @return whether an orderType is a position order
    function isPositionOrder(Order.OrderType orderType) internal pure returns (bool) {
        return isIncreaseOrder(orderType) || isDecreaseOrder(orderType);
    }

    // @dev check if an orderType is an increase order
    // @param orderType the order type
    // @return whether an orderType is an increase order
    function isIncreaseOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.LimitIncrease;
    }

    // @dev check if an orderType is a decrease order
    // @param orderType the order type
    // @return whether an orderType is a decrease order
    function isDecreaseOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketDecrease ||
               orderType == Order.OrderType.LimitDecrease ||
               orderType == Order.OrderType.StopLossDecrease ||
               orderType == Order.OrderType.Liquidation;
    }

    // @dev check if an orderType is a liquidation order
    // @param orderType the order type
    // @return whether an orderType is a liquidation order
    function isLiquidationOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.Liquidation;
    }

    // @dev validate the price for increase / decrease orders based on the triggerPrice
    // the acceptablePrice for increase / decrease orders is validated in getExecutionPrice
    //
    // it is possible to update the oracle to support a primaryPrice and a secondaryPrice
    // which would allow for stop-loss orders to be executed at exactly the triggerPrice
    //
    // however, this may lead to gaming issues, an example:
    // - the current price is $2020
    // - a user has a long position and creates a stop-loss decrease order for < $2010
    // - if the order has a swap from ETH to USDC and the user is able to cause the order
    // to be frozen / unexecutable by manipulating state or otherwise
    // - then if price decreases to $2000, and the user is able to manipulate state such that
    // the order becomes executable with $2010 being used as the price instead
    // - then the user would be able to perform the swap at a higher price than should possible
    //
    // additionally, using the exact order's triggerPrice could lead to gaming issues during times
    // of volatility due to users setting tight stop-losses to minimize loss while betting on a
    // directional price movement, fees and price impact should help a bit with this, but there
    // still may be some probability of success
    //
    // the order keepers can use the closest oracle price to the triggerPrice for execution, which
    // should lead to similar order execution prices with reduced gaming risks
    //
    // if an order is frozen, the frozen order keepers should use the most recent price for order
    // execution instead
    //
    // @param oracle Oracle
    // @param indexToken the index token
    // @param orderType the order type
    // @param triggerPrice the order's triggerPrice
    // @param isLong whether the order is for a long or short
    function validateOrderTriggerPrice(
        Oracle oracle,
        address indexToken,
        Order.OrderType orderType,
        uint256 triggerPrice,
        bool isLong
    ) internal view {
        if (
            isSwapOrder(orderType) ||
            isMarketOrder(orderType) ||
            isLiquidationOrder(orderType)
        ) {
            return;
        }

        Price.Props memory primaryPrice = oracle.getPrimaryPrice(indexToken);

        // for limit increase long positions:
        //      - the order should be executed when the oracle price is <= triggerPrice
        //      - primaryPrice.max should be used for the oracle price
        // for limit increase short positions:
        //      - the order should be executed when the oracle price is >= triggerPrice
        //      - primaryPrice.min should be used for the oracle price
        if (orderType == Order.OrderType.LimitIncrease) {
            bool ok = isLong ? primaryPrice.max <= triggerPrice : primaryPrice.min >= triggerPrice;

            if (!ok) {
                revert Errors.InvalidOrderPrices(primaryPrice.min, primaryPrice.max, triggerPrice, uint256(orderType));
            }

            return;
        }

        // for limit decrease long positions:
        //      - the order should be executed when the oracle price is >= triggerPrice
        //      - primaryPrice.min should be used for the oracle price
        // for limit decrease short positions:
        //      - the order should be executed when the oracle price is <= triggerPrice
        //      - primaryPrice.max should be used for the oracle price
        if (orderType == Order.OrderType.LimitDecrease) {
            bool ok = isLong ? primaryPrice.min >= triggerPrice : primaryPrice.max <= triggerPrice;

            if (!ok) {
                revert Errors.InvalidOrderPrices(primaryPrice.min, primaryPrice.max, triggerPrice, uint256(orderType));
            }

            return;
        }

        // for stop-loss decrease long positions:
        //      - the order should be executed when the oracle price is <= triggerPrice
        //      - primaryPrice.min should be used for the oracle price
        // for stop-loss decrease short positions:
        //      - the order should be executed when the oracle price is >= triggerPrice
        //      - primaryPrice.max should be used for the oracle price
        if (orderType == Order.OrderType.StopLossDecrease) {
            bool ok = isLong ? primaryPrice.min <= triggerPrice : primaryPrice.max >= triggerPrice;

            if (!ok) {
                revert Errors.InvalidOrderPrices(primaryPrice.min, primaryPrice.max, triggerPrice, uint256(orderType));
            }

            return;
        }

        revert Errors.UnsupportedOrderType();
    }

    function getExecutionPriceForIncrease(
        Price.Props memory indexTokenPrice,
        uint256 sizeDeltaUsd,
        int256 priceImpactAmount,
        uint256 acceptablePrice,
        bool isLong
    ) internal pure returns (uint256) {
        // using increase of long positions as an example
        //
        // sizeDeltaInTokens1 = sizeDeltaUsd / price
        // sizeDeltaInTokens2 = sizeDeltaUsd / executionPrice
        // sizeDeltaInTokens2 - sizeDeltaInTokens1 = priceImpactAmount
        // sizeDeltaUsd / executionPrice - sizeDeltaUsd / price = priceImpactAmount
        // sizeDeltaUsd / executionPrice = priceImpactAmount + sizeDeltaUsd / price
        // sizeDeltaUsd / executionPrice = (priceImpactAmount * price + sizeDeltaUsd) / price
        // executionPrice / sizeDeltaUsd = price / (priceImpactAmount * price + sizeDeltaUsd)
        // executionPrice = (price * sizeDeltaUsd) / (priceImpactAmount * price + sizeDeltaUsd)
        //
        // e.g. if price is $2000, sizeDeltaUsd is $5000, priceImpactUsd is -$1000
        // priceImpactAmount = -1000 / 2000 = -0.5
        // sizeDeltaInTokens1 = 5000 / 2000 = 2.5
        // sizeDeltaInTokens2 = 2.5 - 5000 / executionPrice
        // 2000 * 5000 / (5000 + -0.5 * 2000) => 2500

        // use true for the maximize param for pickPriceForPnl
        // e.g. if increasing long, the max price should be used
        uint256 price = indexTokenPrice.pickPriceForPnl(isLong, true);
        uint256 executionPrice = price;

        if (sizeDeltaUsd > 0) {
            // since the priceImpactAmount is in the denominator of the formula
            // for increase long positions
            //      - if priceImpactAmount is positive, adjustedPriceImpactAmount should be positive to decrease the execution price
            //      - if priceImpactAmount is negative, adjustedPriceImpactAmount should be negative to increase the execution price
            // for increase short positions
            //      - if priceImpactAmount is positive, adjustedPriceImpactAmount should be negative to increase the execution price
            //      - if priceImpactAmount is negative, adjustedPriceImpactAmount should be positive to decrease the execution price
            int256 adjustedPriceImpactAmount = isLong ? priceImpactAmount : -priceImpactAmount;

            int256 priceImpactUsd = adjustedPriceImpactAmount * price.toInt256();

            if (priceImpactUsd < 0 && (-priceImpactUsd).toUint256() >= sizeDeltaUsd) {
                revert Errors.PriceImpactLargerThanOrderSize(priceImpactUsd, sizeDeltaUsd);
            }

            uint256 denominator = Calc.sumReturnUint256(sizeDeltaUsd, priceImpactUsd);
            executionPrice = Precision.mulDiv(price, sizeDeltaUsd, denominator);
        }

        // increase order:
        //     - long: executionPrice should be smaller than acceptablePrice
        //     - short: executionPrice should be larger than acceptablePrice
        if (
            (isLong && executionPrice <= acceptablePrice)  ||
            (!isLong && executionPrice >= acceptablePrice)
        ) {
            return executionPrice;
        }

        // the validateOrderTriggerPrice function should have validated if the price fulfills
        // the order's trigger price
        //
        // for increase orders, the negative price impact is not capped
        //
        // for both increase and decrease orders, if it is due to price impact that the
        // order cannot be fulfilled then the order should be frozen
        //
        // this is to prevent gaming by manipulation of the price impact value
        //
        // usually it should be costly to game the price impact value
        // however, for certain cases, e.g. a user already has a large position opened
        // the user may create limit orders that would only trigger after they close
        // their position, this gives the user the option to cancel the pending order if
        // prices do not move in their favour or to close their position and let the order
        // execute if prices move in their favour
        //
        // it may also be possible for users to prevent the execution of orders from other users
        // by manipulating the price impact, though this should be costly
        revert Errors.OrderNotFulfillableDueToPriceImpact(executionPrice, acceptablePrice);
    }

    function getExecutionPriceForDecrease(
        Price.Props memory indexTokenPrice,
        uint256 positionSizeInUsd,
        uint256 positionSizeInTokens,
        uint256 sizeDeltaUsd,
        int256 priceImpactUsd,
        uint256 acceptablePrice,
        bool isLong
    ) internal pure returns (uint256) {
        GetExecutionPriceCache memory cache;

        // decrease order:
        //     - long: use the smaller price
        //     - short: use the larger price
        cache.price = indexTokenPrice.pickPrice(!isLong);
        cache.executionPrice = cache.price;

        // using closing of long positions as an example
        // realized pnl is calculated as totalPositionPnl * sizeDeltaInTokens / position.sizeInTokens
        // totalPositionPnl: position.sizeInTokens * executionPrice - position.sizeInUsd
        // sizeDeltaInTokens: position.sizeInTokens * sizeDeltaUsd / position.sizeInUsd
        // realized pnl: (position.sizeInTokens * executionPrice - position.sizeInUsd) * (position.sizeInTokens * sizeDeltaUsd / position.sizeInUsd) / position.sizeInTokens
        // realized pnl: (position.sizeInTokens * executionPrice - position.sizeInUsd) * (sizeDeltaUsd / position.sizeInUsd)
        // priceImpactUsd should adjust the execution price such that:
        // [(position.sizeInTokens * executionPrice - position.sizeInUsd) * (sizeDeltaUsd / position.sizeInUsd)] -
        // [(position.sizeInTokens * price - position.sizeInUsd) * (sizeDeltaUsd / position.sizeInUsd)] = priceImpactUsd
        //
        // (position.sizeInTokens * executionPrice - position.sizeInUsd) - (position.sizeInTokens * price - position.sizeInUsd)
        // = priceImpactUsd / (sizeDeltaUsd / position.sizeInUsd)
        // = priceImpactUsd * position.sizeInUsd / sizeDeltaUsd
        //
        // position.sizeInTokens * executionPrice - position.sizeInTokens * price = priceImpactUsd * position.sizeInUsd / sizeDeltaUsd
        // position.sizeInTokens * (executionPrice - price) = priceImpactUsd * position.sizeInUsd / sizeDeltaUsd
        // executionPrice - price = (priceImpactUsd * position.sizeInUsd) / (sizeDeltaUsd * position.sizeInTokens)
        // executionPrice = price + (priceImpactUsd * position.sizeInUsd) / (sizeDeltaUsd * position.sizeInTokens)
        // executionPrice = price + (priceImpactUsd / sizeDeltaUsd) * (position.sizeInUsd / position.sizeInTokens)
        // executionPrice = price + (priceImpactUsd * position.sizeInUsd / position.sizeInTokens) / sizeDeltaUsd
        //
        // e.g. if price is $2000, sizeDeltaUsd is $5000, priceImpactUsd is -$1000, position.sizeInUsd is $10,000, position.sizeInTokens is 5
        // executionPrice = 2000 + (-1000 * 10,000 / 5) / 5000 = 1600
        // realizedPnl based on price, without price impact: 0
        // realizedPnl based on executionPrice, with price impact: (5 * 1600 - 10,000) * (5 * 5000 / 10,000) / 5 => -1000

        // a positive adjustedPriceImpactUsd would decrease the executionPrice
        // a negative adjustedPriceImpactUsd would increase the executionPrice

        // for increase orders, the adjustedPriceImpactUsd is added to the divisor
        // a positive adjustedPriceImpactUsd would increase the divisor and decrease the executionPrice
        // increase long order:
        //      - if price impact is positive, adjustedPriceImpactUsd should be positive, to decrease the executionPrice
        //      - if price impact is negative, adjustedPriceImpactUsd should be negative, to increase the executionPrice
        // increase short order:
        //      - if price impact is positive, adjustedPriceImpactUsd should be negative, to increase the executionPrice
        //      - if price impact is negative, adjustedPriceImpactUsd should be positive, to decrease the executionPrice

        // for decrease orders, the adjustedPriceImpactUsd adjusts the numerator
        // a positive adjustedPriceImpactUsd would increase the divisor and increase the executionPrice
        // decrease long order:
        //      - if price impact is positive, adjustedPriceImpactUsd should be positive, to increase the executionPrice
        //      - if price impact is negative, adjustedPriceImpactUsd should be negative, to decrease the executionPrice
        // decrease short order:
        //      - if price impact is positive, adjustedPriceImpactUsd should be negative, to decrease the executionPrice
        //      - if price impact is negative, adjustedPriceImpactUsd should be positive, to increase the executionPrice
        // adjust price by price impact
        if (sizeDeltaUsd > 0 && positionSizeInTokens > 0) {
            cache.adjustedPriceImpactUsd = isLong ? priceImpactUsd : -priceImpactUsd;

            if (cache.adjustedPriceImpactUsd < 0 && (-cache.adjustedPriceImpactUsd).toUint256() > sizeDeltaUsd) {
                revert Errors.PriceImpactLargerThanOrderSize(cache.adjustedPriceImpactUsd, sizeDeltaUsd);
            }

            int256 adjustment = Precision.mulDiv(positionSizeInUsd, cache.adjustedPriceImpactUsd, positionSizeInTokens) / sizeDeltaUsd.toInt256();
            int256 _executionPrice = cache.price.toInt256() + adjustment;

            if (_executionPrice < 0) {
                revert Errors.NegativeExecutionPrice(_executionPrice, cache.price, positionSizeInUsd, cache.adjustedPriceImpactUsd, sizeDeltaUsd);
            }

            cache.executionPrice = _executionPrice.toUint256();
        }

        // decrease order:
        //     - long: executionPrice should be larger than acceptablePrice
        //     - short: executionPrice should be smaller than acceptablePrice
        if (
            (isLong && cache.executionPrice >= acceptablePrice) ||
            (!isLong && cache.executionPrice <= acceptablePrice)
        ) {
            return cache.executionPrice;
        }

        // the validateOrderTriggerPrice function should have validated if the price fulfills
        // the order's trigger price
        //
        // for decrease orders, the price impact should already be capped, so if the user
        // had set an acceptable price within the range of the capped price impact, then
        // the order should be fulfillable at the acceptable price
        //
        // for increase orders, the negative price impact is not capped
        //
        // for both increase and decrease orders, if it is due to price impact that the
        // order cannot be fulfilled then the order should be frozen
        //
        // this is to prevent gaming by manipulation of the price impact value
        //
        // usually it should be costly to game the price impact value
        // however, for certain cases, e.g. a user already has a large position opened
        // the user may create limit orders that would only trigger after they close
        // their position, this gives the user the option to cancel the pending order if
        // prices do not move in their favour or to close their position and let the order
        // execute if prices move in their favour
        //
        // it may also be possible for users to prevent the execution of orders from other users
        // by manipulating the price impact, though this should be costly
        revert Errors.OrderNotFulfillableDueToPriceImpact(cache.executionPrice, acceptablePrice);
    }

    // @dev validate that an order exists
    // @param order the order to check
    function validateNonEmptyOrder(Order.Props memory order) internal pure {
        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.sizeDeltaUsd() == 0 && order.initialCollateralDeltaAmount() == 0) {
            revert Errors.EmptyOrder();
        }
    }
}
