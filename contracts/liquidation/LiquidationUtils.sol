// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../position/PositionUtils.sol";
import "../position/PositionStoreUtils.sol";
import "../order/OrderStoreUtils.sol";
import "../nonce/NonceUtils.sol";

// @title LiquidationUtils
// @dev Library to help with liquidations
library LiquidationUtils {
    using Position for Position.Props;
    using Order for Order.Props;

    // @dev creates a liquidation order for a position
    // @param dataStore DataStore
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    function createLiquidationOrder(
        DataStore dataStore,
        address account,
        address market,
        address collateralToken,
        bool isLong
    ) external returns (bytes32) {
        bytes32 positionKey = PositionUtils.getPositionKey(account, market, collateralToken, isLong);
        Position.Props memory position = PositionStoreUtils.get(dataStore, positionKey);

        Order.Addresses memory addresses = Order.Addresses(
            account, // account
            account, // receiver
            address(0), // callbackContract
            market, // market
            position.collateralToken(), // initialCollateralToken
            new address[](0) // swapPath
        );

        Order.Numbers memory numbers = Order.Numbers(
            Order.OrderType.Liquidation, // orderType
            position.sizeInUsd(), // sizeDeltaUsd
            0, // initialCollateralDeltaAmount
            0, // triggerPrice
            position.isLong() ? 0 : type(uint256).max, // acceptablePrice
            0, // executionFee
            0, // callbackGasLimit
            0, // minOutputAmount
            Chain.currentBlockNumber() // updatedAtBlock
        );

        // set shouldUnwrapNativeToken to false to ensure that transfers
        // to the position.account cannot be blocked
        Order.Flags memory flags = Order.Flags(
            position.isLong(), // isLong
            false, // shouldUnwrapNativeToken
            false // isFrozen
        );

        Order.Props memory order = Order.Props(
            addresses,
            numbers,
            flags
        );

        bytes32 key = NonceUtils.getNextKey(dataStore);
        OrderStoreUtils.set(dataStore, key, order);

        return key;
    }
}
