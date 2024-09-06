// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../callback/IOrderCallbackReceiver.sol";
import "../callback/IGasFeeCallbackReceiver.sol";
import "../callback/IGlvDepositCallbackReceiver.sol";
import "../callback/IGlvWithdrawalCallbackReceiver.sol";

contract MockCallbackReceiver is IOrderCallbackReceiver, IGasFeeCallbackReceiver, IGlvDepositCallbackReceiver, IGlvWithdrawalCallbackReceiver {
    uint public called;

    uint public glvDepositExecutionCalled;
    uint public glvDepositCancellationCalled;
    uint public glvWithdrawalExecutionCalled;
    uint public glvWithdrawalCancellationCalled;

    function afterOrderExecution(bytes32 /* key */, Order.Props memory /* order */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }

    function afterOrderCancellation(bytes32 /* key */, Order.Props memory /* order */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }

    function afterOrderFrozen(bytes32 /* key */, Order.Props memory /* order */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }

    function refundExecutionFee(bytes32 /* key */, EventUtils.EventLogData memory /* eventData */) external payable {
        ++called;
    }

    function afterGlvDepositExecution(bytes32 /* key */, GlvDeposit.Props memory /* glv deposit */, EventUtils.EventLogData memory /* eventData */) external {
        ++glvDepositExecutionCalled;
    }

    function afterGlvDepositCancellation(bytes32 /* key */, GlvDeposit.Props memory /* glv deposit */, EventUtils.EventLogData memory /* eventData */) external {
        ++glvDepositCancellationCalled;
    }

    function afterGlvWithdrawalExecution(bytes32 /* key */, GlvWithdrawal.Props memory /* glv withdrawal */, EventUtils.EventLogData memory /* eventData */) external {
        ++glvWithdrawalExecutionCalled;
    }

    function afterGlvWithdrawalCancellation(bytes32 /* key */, GlvWithdrawal.Props memory /* glv withdrawal */, EventUtils.EventLogData memory /* eventData */) external {
        ++glvWithdrawalCancellationCalled;
    }
}
