// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library Order {
    using Order for Props;

    enum OrderType {
        // MarketDecrease and StopLossDecrease orders will be removed even after partial fulfillments
        // e.g. if the position size is 1000 USD and the order size is 2000 USD
        // if the order is executed it will close the position and the order will
        // no longer be active

        // Limit / stop-loss orders are executed at the acceptablePrice if two index prices
        // allowing their fulfillment are presented
        // e.g. if a limit order is created at block b0, with an acceptablePrice of 2100
        // if token price is: 2000 (b1), 2200 (b2)
        // presenting the prices at b1, b2 will allow the order to be executed with index price 2100
        //
        // LimitSwap and LimitIncrease orders can always be executed if the right prices are reached
        // due to this, validating that the prices presented are for blocks
        // after the order's updatedAtBlock should be sufficient to prevent gaming of the pricing
        //
        // LimitDecrease and StopLossDecrease orders can only be fulfilled if there is an existing position
        // and the right prices are reached
        // due to this, it is possible to game the pricing by opening multiple orders and waiting for them to
        // be fulfillable, the user then waits for a favorable price to open a position
        // once a favorable price is reached a position can be opened and the orders can be executed for a profit
        // to avoid this, the prices presented should be validated to be after the associated position was opened
        //
        // another case to consider would be if the user opens small positions and creates LimitDecrease, StopLossDecrease orders
        // to front-run price movements
        // the user waits for the LimitDecrease and StopLossDecrease orders to be fulfillable then attempts to increase
        // their position size before the orders can be executed
        // e.g. a user opens a long position of size 1 USD at price 2000
        // token price increases to 2110
        // user creates a StopLossDecrease order for price 2100
        // token price decreases to 1990
        // user increases position before the StopLossDecrease order can be executed
        // due to this, the prices presented should be validated to be after the order was updated and also after the position
        // was increased

        // MarketSwap: swap token A to token B at the current market price
        // the order will be cancelled if the minOutputAmount cannot be fulfilled
        MarketSwap,
        // LimitSwap: swap token A to token B if the minOutputAmount can be fulfilled
        LimitSwap,
        // MarketIncrease: increase position at the current market price
        // the order will be cancelled if the position cannot be increased at the acceptablePrice
        // for long positions, market price < acceptablePrice
        // for short positions, market price > acceptablePrice
        MarketIncrease,
        // LimitIncrease: increase position if the acceptablePrice and acceptableUsdAdjustment
        // can be fulfilled
        // fulfillment of the acceptablePrice is dependent on the token index price
        // fulfillment of the acceptableUsdAdjustment is dependent on the price impact
        LimitIncrease,
        // MarketDecrease: decrease position at the curent market price
        // the order will be cancelled if the position cannot be decreased at the acceptablePrice
        // for long positions, market price > acceptablePrice
        // for short positions, market price < acceptablePrice
        MarketDecrease,
        // LimitDecrease: decrease position if the acceptablePrice and acceptableUsdAdjustment
        // can be fulfilled
        // these orders are reduce-only orders
        // for long positions, market price => acceptablePrice
        // for short positions, market price <= acceptablePrice
        LimitDecrease,
        // StopLossDecrease: decrease position if the acceptablePrice and acceptableUsdAdjustment
        // can be fulfilled
        // these orders are reduce-only orders
        // the acceptablePrice will be used for execution, two prices for the index token
        // need to be recorded in the oracle for this, the price with the smaller block number
        // is stored as the primary price while the price with the larger block number is stored
        // as the secondary price
        // for long positions, primary price (earlier) >= acceptablePrice, secondary price (later) <= acceptablePrice
        // for short positions, primary price (earlier) <= acceptablePrice, secondary price (later) >= acceptablePrice
        StopLossDecrease
    }

    struct Addresses {
        address account;
        address market;
         // for increase positions initialCollateralToken is the token sent in by the user
         // the token will be swapped through the specified swapPath, before position increase
         // for decrease position initialCollateralToken is the collateral token of the position
         // any withdrawn collateral will be swapped through the specified swapPath, after position decrease
        address initialCollateralToken;
        address[] swapPath; // list of markets to swap collateral through
    }

    struct Numbers {
        uint256 sizeDeltaUsd;
        uint256 initialCollateralDeltaAmount;
        uint256 acceptablePrice;
        int256 acceptableUsdAdjustment;
        uint256 executionFee;
        uint256 minOutputAmount;
        uint256 updatedAtBlock;
    }

    struct Flags {
        OrderType orderType;
        bool isLong;
        bool hasCollateralInETH;
    }

    // there is a limit on the number of fields a struct can have when being passed
    // or returned as a memory variable which can cause "Stack too deep" errors
    // we use sub-structs here to avoid the issue
    struct Props {
        Addresses addresses;
        Numbers numbers;
        Flags flags;
        bytes32[] data;
    }

    function account(Props memory props) internal pure returns (address) {
        return props.addresses.account;
    }

    function market(Props memory props) internal pure returns (address) {
        return props.addresses.market;
    }

    function initialCollateralToken(Props memory props) internal pure returns (address) {
        return props.addresses.initialCollateralToken;
    }

    function swapPath(Props memory props) internal pure returns (address[] memory) {
        return props.addresses.swapPath;
    }

    function sizeDeltaUsd(Props memory props) internal pure returns (uint256) {
        return props.numbers.sizeDeltaUsd;
    }

    function initialCollateralDeltaAmount(Props memory props) internal pure returns (uint256) {
        return props.numbers.initialCollateralDeltaAmount;
    }

    function acceptablePrice(Props memory props) internal pure returns (uint256) {
        return props.numbers.acceptablePrice;
    }

    function acceptableUsdAdjustment(Props memory props) internal pure returns (int256) {
        return props.numbers.acceptableUsdAdjustment;
    }

    function executionFee(Props memory props) internal pure returns (uint256) {
        return props.numbers.executionFee;
    }

    function minOutputAmount(Props memory props) internal pure returns (uint256) {
        return props.numbers.minOutputAmount;
    }

    function updatedAtBlock(Props memory props) internal pure returns (uint256) {
        return props.numbers.updatedAtBlock;
    }

    function orderType(Props memory props) internal pure returns (OrderType) {
        return props.flags.orderType;
    }

    function isLong(Props memory props) internal pure returns (bool) {
        return props.flags.isLong;
    }

    function hasCollateralInETH(Props memory props) internal pure returns (bool) {
        return props.flags.hasCollateralInETH;
    }

    function setAccount(Props memory props, address _value) internal pure {
        props.addresses.account = _value;
    }

    function setMarket(Props memory props, address _value) internal pure {
        props.addresses.market = _value;
    }

    function setInitialCollateralToken(Props memory props, address _value) internal pure {
        props.addresses.initialCollateralToken = _value;
    }

    function setSwapPath(Props memory props, address[] memory _value) internal pure {
        props.addresses.swapPath = _value;
    }

    function setSizeDeltaUsd(Props memory props, uint256 _value) internal pure {
        props.numbers.sizeDeltaUsd = _value;
    }

    function setInitialCollateralDeltaAmount(Props memory props, uint256 _value) internal pure {
        props.numbers.initialCollateralDeltaAmount = _value;
    }

    function setAcceptablePrice(Props memory props, uint256 _value) internal pure {
        props.numbers.acceptablePrice = _value;
    }

    function setAcceptableUsdAdjustment(Props memory props, int256 _value) internal pure {
        props.numbers.acceptableUsdAdjustment = _value;
    }

    function setExecutionFee(Props memory props, uint256 _value) internal pure {
        props.numbers.executionFee = _value;
    }

    function setMinOutputAmount(Props memory props, uint256 _value) internal pure {
        props.numbers.minOutputAmount = _value;
    }

    function setUpdatedAtBlock(Props memory props, uint256 _value) internal pure {
        props.numbers.updatedAtBlock = _value;
    }

    function setOrderType(Props memory props, OrderType _value) internal pure {
        props.flags.orderType = _value;
    }

    function setIsLong(Props memory props, bool _value) internal pure {
        props.flags.isLong = _value;
    }

    function setHasCollateralInETH(Props memory props, bool _value) internal pure {
        props.flags.hasCollateralInETH = _value;
    }

    function touch(Props memory props) internal view {
        props.setUpdatedAtBlock(block.number);
    }
}
