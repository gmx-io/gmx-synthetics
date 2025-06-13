// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../exchange/IOrderExecutor.sol";
import "./IncreaseOrderUtils.sol";

contract IncreaseOrderExecutor is ReentrancyGuard, RoleModule {
    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function processOrder(BaseOrderUtils.ExecuteOrderParams memory params) external nonReentrant onlyController returns (EventUtils.EventLogData memory) {
        return IncreaseOrderUtils.processOrder(params);
    }
}
