// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../callback/IDepositCallbackReceiver.sol";

contract RevertingCallbackReceiver is IDepositCallbackReceiver {
    function afterDepositExecution(bytes32 /* key */, Deposit.Props memory /* deposit */, EventUtils.EventLogData memory /* eventData */) external pure {
        revert("error");
    }

    function afterDepositCancellation(bytes32 /* key */, Deposit.Props memory /* deposit */, EventUtils.EventLogData memory /* eventData */) external pure {
        revert("error");
    }
}
