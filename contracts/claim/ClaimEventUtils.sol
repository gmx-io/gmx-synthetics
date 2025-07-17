// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

library ClaimEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;

    // @dev emit a ClaimFundsDeposited event
    // @param eventEmitter the event emitter
    // @param account the account funds were deposited for
    // @param token the token that was deposited
    // @param amount the amount that was deposited
    function emitClaimFundsDeposited(
        EventEmitter eventEmitter,
        address account,
        address token,
        uint256 amount    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "token", token);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog2(
            "ClaimFundsDeposited",
            Cast.toBytes32(account),
            Cast.toBytes32(token),
            eventData
        );
    }

    // @dev emit a ClaimFundsWithdrawn event
    // @param eventEmitter the event emitter
    // @param account the account that funds were withdrawn for
    // @param token the token that was withdrawn
    // @param amount the amount that was withdrawn
    // @param receiver the address that received the funds
    function emitClaimFundsWithdrawn(
        EventEmitter eventEmitter,
        address account,
        address token,
        uint256 amount,
        address receiver
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "receiver", receiver);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog2(
            "ClaimFundsWithdrawn",
            Cast.toBytes32(account),
            Cast.toBytes32(token),
            eventData
        );
    }

    // @dev emit a ClaimFundsClaimed event
    // @param eventEmitter the event emitter
    // @param account the account that claimed funds
    // @param token the token that was claimed
    // @param amount the amount that was claimed
    function emitClaimFundsClaimed(
        EventEmitter eventEmitter,
        address account,
        address token,
        uint256 amount
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "token", token);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog2(
            "ClaimFundsClaimed",
            Cast.toBytes32(account),
            Cast.toBytes32(token),
            eventData
        );
    }
}
