// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/IBaseOrderUtils.sol";
import "../oracle/OracleUtils.sol";

interface IOrderHandler {
    function createOrder(
        address account,
        uint256 srcChainId,
        IBaseOrderUtils.CreateOrderParams calldata params,
        bool shouldCapMaxExecutionFee
    ) external returns (bytes32);

    function simulateExecuteOrder(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;

    function updateOrder(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 acceptablePrice,
        uint256 triggerPrice,
        uint256 minOutputAmount,
        uint256 validFromTime,
        bool autoCancel,
        Order.Props memory order,
        bool shouldCapMaxExecutionFee
    ) external;

    function cancelOrder(bytes32 key) external;
}
