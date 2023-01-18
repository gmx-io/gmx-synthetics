// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

import "./Withdrawal.sol";

library WithdrawalEventUtils {
    using Withdrawal for Withdrawal.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitWithdrawalCreated(
        EventEmitter eventEmitter,
        bytes32 key,
        Withdrawal.Props memory withdrawal
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(4);
        eventData.addressItems.setItem(0, "account", withdrawal.account());
        eventData.addressItems.setItem(1, "receiver", withdrawal.receiver());
        eventData.addressItems.setItem(2, "callbackContract", withdrawal.callbackContract());
        eventData.addressItems.setItem(3, "market", withdrawal.market());

        eventData.uintItems.initItems(6);
        eventData.uintItems.setItem(0, "marketTokenAmount", withdrawal.marketTokenAmount());
        eventData.uintItems.setItem(1, "minLongTokenAmount", withdrawal.minLongTokenAmount());
        eventData.uintItems.setItem(2, "minShortTokenAmount", withdrawal.minShortTokenAmount());
        eventData.uintItems.setItem(3, "updatedAtBlock", withdrawal.updatedAtBlock());
        eventData.uintItems.setItem(4, "executionFee", withdrawal.executionFee());
        eventData.uintItems.setItem(5, "callbackGasLimit", withdrawal.callbackGasLimit());

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "shouldUnwrapNativeToken", withdrawal.shouldUnwrapNativeToken());

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog1(
            "WithdrawalCreated",
            Cast.toBytes32(withdrawal.account()),
            eventData
        );
    }

    function emitWithdrawalExecuted(
        EventEmitter eventEmitter,
        bytes32 key
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog(
            "WithdrawalExecuted",
            eventData
        );
    }

    function emitWithdrawalCancelled(
        EventEmitter eventEmitter,
        bytes32 key,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.stringItems.initItems(1);
        eventData.stringItems.setItem(0, "reason", reason);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "reasonBytes", reasonBytes);

        eventEmitter.emitEventLog(
            "WithdrawalCancelled",
            eventData
        );
    }
}
