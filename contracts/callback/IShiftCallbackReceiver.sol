// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";

interface IShiftCallbackReceiver {
    function afterShiftExecution(bytes32 key, EventUtils.EventLogData memory shiftData, EventUtils.EventLogData memory eventData) external;
    function afterShiftCancellation(bytes32 key, EventUtils.EventLogData memory shiftData, EventUtils.EventLogData memory eventData) external;
}
