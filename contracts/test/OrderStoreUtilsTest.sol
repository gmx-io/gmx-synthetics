
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/OrderStoreUtils.sol";

/**
 * @title OrderStoreUtilsTest
 * @dev Contract to help test the OrderStoreUtils library
 */
contract OrderStoreUtilsTest {
    function getEmptyOrder() external pure returns (Order.Props memory) {
        Order.Props memory order;
        return order;
    }

    function setOrder(DataStore dataStore, bytes32 key, Order.Props memory order) external {
        OrderStoreUtils.set(dataStore, key, order);
    }

    function removeOrder(DataStore dataStore, bytes32 key, address account) external {
        OrderStoreUtils.remove(dataStore, key, account);
    }
}
