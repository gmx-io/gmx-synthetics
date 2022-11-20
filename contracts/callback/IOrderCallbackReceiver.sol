// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/Order.sol";

interface IOrderCallbackReceiver {
    function beforeOrderExecution(bytes32 key, Order.Props memory order) external;
    function afterOrderExecution(bytes32 key, Order.Props memory order) external;
    function afterOrderCancellation(bytes32 key, Order.Props memory order) external;
    function afterOrderFrozen(bytes32 key, Order.Props memory order) external;
}
