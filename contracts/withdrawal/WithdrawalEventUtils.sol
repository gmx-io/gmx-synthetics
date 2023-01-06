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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(4);
        data.addressItems.setItem(0, "account", withdrawal.account());
        data.addressItems.setItem(1, "receiver", withdrawal.receiver());
        data.addressItems.setItem(2, "callbackContract", withdrawal.callbackContract());
        data.addressItems.setItem(3, "market", withdrawal.market());

        data.uintItems.initItems(6);
        data.uintItems.setItem(0, "marketTokenAmount", withdrawal.marketTokenAmount());
        data.uintItems.setItem(1, "minLongTokenAmount", withdrawal.minLongTokenAmount());
        data.uintItems.setItem(2, "minShortTokenAmount", withdrawal.minShortTokenAmount());
        data.uintItems.setItem(3, "updatedAtBlock", withdrawal.updatedAtBlock());
        data.uintItems.setItem(4, "executionFee", withdrawal.executionFee());
        data.uintItems.setItem(5, "callbackGasLimit", withdrawal.callbackGasLimit());

        data.boolItems.initItems(1);
        data.boolItems.setItem(0, "shouldUnwrapNativeToken", withdrawal.shouldUnwrapNativeToken());

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog1(
            "WithdrawalCreated",
            Cast.toBytes32(withdrawal.account()),
            data
        );
    }

    function emitWithdrawalExecuted(
        EventEmitter eventEmitter,
        bytes32 key
    ) external {
        EventUtils.EventLogData memory data;

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog(
            "WithdrawalExecuted",
            data
        );
    }

    function emitWithdrawalCancelled(
        EventEmitter eventEmitter,
        bytes32 key,
        bytes memory reason
    ) external {
        EventUtils.EventLogData memory data;

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);

        data.bytesItems.initItems(1);
        data.bytesItems.setItem(0, "reason", reason);

        eventEmitter.emitEventLog(
            "WithdrawalCancelled",
            data
        );
    }
}
