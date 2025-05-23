// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/BaseOrderUtils.sol";

interface IOrderExecutor {
    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) external returns (EventUtils.EventLogData memory);
}
