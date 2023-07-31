// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../callback/IOrderCallbackReceiver.sol";

contract MockCallbackReceiver is IOrderCallbackReceiver {
    uint public called;

    function afterOrderExecution(bytes32 /* key */, Order.Props memory /* deposit */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }

    function afterOrderCancellation(bytes32 /* key */, Order.Props memory /* deposit */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }

    function afterOrderFrozen(bytes32 /* key */, Order.Props memory /* deposit */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }
}
