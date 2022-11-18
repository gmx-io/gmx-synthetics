// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../position/PositionUtils.sol";
import "../nonce/NonceUtils.sol";
import "../order/OrderStore.sol";
import "../utils/Null.sol";

library LiquidationUtils {
    using Order for Order.Props;

    function createLiquidationOrder(
        DataStore dataStore,
        OrderStore orderStore,
        PositionStore positionStore,
        address account,
        address market,
        address collateralToken,
        bool isLong
    ) external returns (bytes32) {
        bytes32 positionKey = PositionUtils.getPositionKey(account, market, collateralToken, isLong);
        Position.Props memory position = positionStore.get(positionKey);

        Order.Addresses memory addresses = Order.Addresses(
            account, // account
            account, // receiver
            address(0), // callbackContract
            market, // market
            position.collateralToken, // initialCollateralToken
            new address[](0) // swapPath
        );

        Order.Numbers memory numbers = Order.Numbers(
            position.sizeInUsd, // sizeDeltaUsd
            0, // initialCollateralDeltaAmount
            0, // triggerPrice
            position.isLong ? 0 : type(uint256).max, // acceptablePrice
            0, // executionFee
            0, // callbackGasLimit
            0, // minOutputAmount
            Chain.currentBlockNumber() // updatedAtBlock
        );

        Order.Flags memory flags = Order.Flags(
            Order.OrderType.Liquidation, // orderType
            position.isLong, // isLong
            true, // shouldConvertETH
            false // isFrozen
        );

        Order.Props memory order = Order.Props(
            addresses,
            numbers,
            flags,
            Null.BYTES
        );

        bytes32 key = NonceUtils.getNextKey(dataStore);
        orderStore.set(key, order);

        return key;
    }
}
