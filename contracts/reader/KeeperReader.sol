// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";

import "../market/MarketStoreUtils.sol";

import "../deposit/DepositStoreUtils.sol";
import "../withdrawal/WithdrawalStoreUtils.sol";

import "../position/Position.sol";
import "../position/PositionUtils.sol";
import "../position/PositionStoreUtils.sol";

import "../order/OrderStoreUtils.sol";

import "../market/MarketUtils.sol";
import "../market/Market.sol";

import "../adl/AdlUtils.sol";

import "./ReaderUtils.sol";
import "./ReaderDepositUtils.sol";
import "./ReaderWithdrawalUtils.sol";

// @title KeeperReader
// @dev Library for read functions

contract KeeperReader {
    function getOrders(DataStore dataStore, uint256 start, uint256 end) external view returns (Order.Props[] memory) {
        bytes32[] memory orderKeys = OrderStoreUtils.getOrderKeys(dataStore, start, end);
        Order.Props[] memory orders = new Order.Props[](orderKeys.length);
        for (uint256 i; i < orderKeys.length; i++) {
            bytes32 orderKey = orderKeys[i];
            orders[i] = OrderStoreUtils.get(dataStore, orderKey);
        }
        return orders;
    }

    function getLiquidatablePositions(
        DataStore dataStore,
        IReferralStorage referralStorage,
        MarketUtils.MarketPrices[] memory marketPrices,
        uint256 start,
        uint256 end,
        bool shouldValidateMinCollateralUsd
    ) external view returns (bytes32[] memory) {

    }

    // bytes32[] memory positionKeys = PositionStoreUtils.getAccountPositionKeys(dataStore, account, start, end);
    // Position.Props[] memory positions = new Position.Props[](positionKeys.length);
    // for (uint256 i; i < positionKeys.length; i++) {
    //     bytes32 positionKey = positionKeys[i];
    //     positions[i] = PositionStoreUtils.get(dataStore, positionKey);
    // }

    // return positions;
}
