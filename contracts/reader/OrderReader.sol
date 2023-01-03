// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../order/OrderStore.sol";

// @title OrderReader
// @dev Library for order read functions
contract OrderReader {
    function getAccountOrders(
        OrderStore orderStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (Order.Props[] memory) {
        uint256 orderCount = orderStore.getAccountOrderCount(account);
        if (start >= orderCount) { return new Order.Props[](0); }
        if (end > orderCount) { end = orderCount; }

        bytes32[] memory orderKeys = orderStore.getAccountOrderKeys(account, start, end);
        Order.Props[] memory orders = new Order.Props[](orderKeys.length);
        for (uint256 i = 0; i < orderKeys.length; i++) {
            bytes32 orderKey = orderKeys[i];
            orders[i] = orderStore.get(orderKey);
        }

        return orders;
    }
}
