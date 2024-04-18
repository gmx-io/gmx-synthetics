// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";

interface IExecutionFeeCallbackReceiver {
    function refundExecutionFee(EventUtils.EventLogData memory eventData) external payable;
}
