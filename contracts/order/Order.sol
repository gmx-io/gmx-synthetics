// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../chain/Chain.sol";

library Order {
    using Order for Props;

    enum OrderType {
        // for LimitIncrease, LimitDecrease, StopLossDecrease orders, two prices for the
        // index token need to be recorded in the oracle
        // the price with the smaller block number is stored as the primary price while the price with the
        // larger block number is stored as the secondary price
        // the triggerPrice must be validated to be between the primary price and secondary price
        // LimitDecrease and StopLossDecrease are reduce-only orders

        // MarketSwap: swap token A to token B at the current market price
        // the order will be cancelled if the minOutputAmount cannot be fulfilled
        MarketSwap,
        // LimitSwap: swap token A to token B if the minOutputAmount can be fulfilled
        LimitSwap,
        // MarketIncrease: increase position at the current market price
        // the order will be cancelled if the position cannot be increased at the acceptablePrice
        MarketIncrease,
        // LimitIncrease: increase position if the triggerPrice is reached and the acceptablePrice can be fulfilled
        LimitIncrease,
        // MarketDecrease: decrease position at the curent market price
        // the order will be cancelled if the position cannot be decreased at the acceptablePrice
        MarketDecrease,
        // LimitDecrease: decrease position if the triggerPrice is reached and the acceptablePrice can be fulfilled
        LimitDecrease,
        // StopLossDecrease: decrease position if the triggerPrice is reached and the acceptablePrice can be fulfilled
        StopLossDecrease,
        // Liquidation: allows liquidation of positions if the criteria for liquidation are met
        Liquidation
    }

    struct Addresses {
        address account;
        address receiver;
        address callbackContract;
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
        uint256 triggerPrice;
        uint256 acceptablePrice;
        uint256 executionFee;
        uint256 callbackGasLimit;
        uint256 minOutputAmount;
        uint256 updatedAtBlock;
    }

    struct Flags {
        OrderType orderType;
        bool isLong;
        bool shouldConvertETH;
        bool isFrozen;
    }

    // there is a limit on the number of fields a struct can have when being passed
    // or returned as a memory variable which can cause "Stack too deep" errors
    // we use sub-structs here to avoid the issue
    struct Props {
        Addresses addresses;
        Numbers numbers;
        Flags flags;
        bytes data;
    }

    function account(Props memory props) internal pure returns (address) {
        return props.addresses.account;
    }

    function receiver(Props memory props) internal pure returns (address) {
        return props.addresses.receiver;
    }

    function callbackContract(Props memory props) internal pure returns (address) {
        return props.addresses.callbackContract;
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

    function triggerPrice(Props memory props) internal pure returns (uint256) {
        return props.numbers.triggerPrice;
    }

    function acceptablePrice(Props memory props) internal pure returns (uint256) {
        return props.numbers.acceptablePrice;
    }

    function executionFee(Props memory props) internal pure returns (uint256) {
        return props.numbers.executionFee;
    }

    function callbackGasLimit(Props memory props) internal pure returns (uint256) {
        return props.numbers.callbackGasLimit;
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

    function shouldConvertETH(Props memory props) internal pure returns (bool) {
        return props.flags.shouldConvertETH;
    }

    function isFrozen(Props memory props) internal pure returns (bool) {
        return props.flags.isFrozen;
    }

    function setAccount(Props memory props, address _value) internal pure {
        props.addresses.account = _value;
    }

    function setReceiver(Props memory props, address _value) internal pure {
        props.addresses.receiver = _value;
    }

    function setCallbackContract(Props memory props, address _value) internal pure {
        props.addresses.callbackContract = _value;
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

    function setTriggerPrice(Props memory props, uint256 _value) internal pure {
        props.numbers.triggerPrice = _value;
    }

    function setAcceptablePrice(Props memory props, uint256 _value) internal pure {
        props.numbers.acceptablePrice = _value;
    }

    function setExecutionFee(Props memory props, uint256 _value) internal pure {
        props.numbers.executionFee = _value;
    }

    function setCallbackGasLimit(Props memory props, uint256 _value) internal pure {
        props.numbers.callbackGasLimit = _value;
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

    function setShouldConvertETH(Props memory props, bool _value) internal pure {
        props.flags.shouldConvertETH = _value;
    }

    function setIsFrozen(Props memory props, bool _value) internal pure {
        props.flags.isFrozen = _value;
    }

    function touch(Props memory props) internal view {
        props.setUpdatedAtBlock(Chain.currentBlockNumber());
    }
}
