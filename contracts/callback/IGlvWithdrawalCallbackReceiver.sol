// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";
import "../glv/glvWithdrawal/GlvWithdrawal.sol";

// @title IGlvWithdrawalCallbackReceiver
// @dev interface for a glvWithdrawal callback contract
interface IGlvWithdrawalCallbackReceiver {
    // @dev called after a glvWithdrawal execution
    // @param key the key of the glvWithdrawal
    // @param glvWithdrawal the glvWithdrawal that was executed
    function afterGlvWithdrawalExecution(
        bytes32 key,
        GlvWithdrawal.Props memory glvWithdrawal,
        EventUtils.EventLogData memory eventData
    ) external;

    // @dev called after a glvWithdrawal cancellation
    // @param key the key of the glvWithdrawal
    // @param glvWithdrawal the glvWithdrawal that was cancelled
    function afterGlvWithdrawalCancellation(
        bytes32 key,
        GlvWithdrawal.Props memory glvWithdrawal,
        EventUtils.EventLogData memory eventData
    ) external;
}
