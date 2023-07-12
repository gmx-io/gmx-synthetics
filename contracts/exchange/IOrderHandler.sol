// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/BaseOrderUtils.sol";
import "../oracle/OracleUtils.sol";

interface IOrderHandler {
    function createOrder(address account, BaseOrderUtils.CreateOrderParams calldata params) external returns (bytes32);

    function simulateExecuteOrder(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;

    function updateOrder(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 acceptablePrice,
        uint256 triggerPrice,
        uint256 minOutputAmount,
        Order.Props memory order
    ) external;

    function cancelOrder(bytes32 key) external;
}
