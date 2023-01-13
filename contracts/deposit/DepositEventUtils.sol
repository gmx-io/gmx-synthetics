// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

import "./Deposit.sol";

library DepositEventUtils {
    using Deposit for Deposit.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitDepositCreated(
        EventEmitter eventEmitter,
        bytes32 key,
        Deposit.Props memory deposit
    ) external {
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(4);
        data.addressItems.setItem(0, "account", deposit.account());
        data.addressItems.setItem(1, "receiver", deposit.receiver());
        data.addressItems.setItem(2, "callbackContract", deposit.callbackContract());
        data.addressItems.setItem(3, "market", deposit.market());

        data.uintItems.initItems(6);
        data.uintItems.setItem(0, "longTokenAmount", deposit.longTokenAmount());
        data.uintItems.setItem(1, "shortTokenAmount", deposit.shortTokenAmount());
        data.uintItems.setItem(2, "minMarketTokens", deposit.minMarketTokens());
        data.uintItems.setItem(3, "updatedAtBlock", deposit.updatedAtBlock());
        data.uintItems.setItem(4, "executionFee", deposit.executionFee());
        data.uintItems.setItem(5, "callbackGasLimit", deposit.callbackGasLimit());

        data.boolItems.initItems(1);
        data.boolItems.setItem(0, "shouldUnwrapNativeToken", deposit.shouldUnwrapNativeToken());

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog1(
            "DepositCreated",
            Cast.toBytes32(deposit.account()),
            data
        );
    }

    function emitDepositExecuted(
        EventEmitter eventEmitter,
        bytes32 key
    ) external {
        EventUtils.EventLogData memory data;

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog(
            "DepositExecuted",
            data
        );
    }

    function emitDepositCancelled(
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
            "DepositCancelled",
            data
        );
    }
}
