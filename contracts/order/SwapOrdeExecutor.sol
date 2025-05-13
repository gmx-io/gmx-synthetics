// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../exchange/IOrderExecutor.sol";
import "./SwapOrderUtils.sol";

contract SwapOrderExecutor is RoleModule {
    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) external onlyController returns (EventUtils.EventLogData memory) {
        return SwapOrderUtils.processOrder(params);
    }
}
