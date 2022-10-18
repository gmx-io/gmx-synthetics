// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/Order.sol";

interface IOrderCallbackReceiver {
    function orderExecuted(bytes32 key, Order.Props memory order) external;
    function orderCancelled(bytes32 key, Order.Props memory order) external;
}
