// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";

interface IGasFeeCallbackReceiver {
    function refundExecutionFee(bytes32 key, EventUtils.EventLogData memory eventData) external payable;
}
