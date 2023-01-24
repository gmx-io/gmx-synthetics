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
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(6);
        eventData.addressItems.setItem(0, "account", deposit.account());
        eventData.addressItems.setItem(1, "receiver", deposit.receiver());
        eventData.addressItems.setItem(2, "callbackContract", deposit.callbackContract());
        eventData.addressItems.setItem(3, "market", deposit.market());
        eventData.addressItems.setItem(4, "initialLongToken", deposit.initialLongToken());
        eventData.addressItems.setItem(5, "initialShortToken", deposit.initialShortToken());

        eventData.addressItems.initArrayItems(2);
        eventData.addressItems.setItem(0, "longTokenSwapPath", deposit.longTokenSwapPath());
        eventData.addressItems.setItem(1, "shortTokenSwapPath", deposit.shortTokenSwapPath());

        eventData.uintItems.initItems(6);
        eventData.uintItems.setItem(0, "initialLongTokenAmount", deposit.initialLongTokenAmount());
        eventData.uintItems.setItem(1, "initialShortTokenAmount", deposit.initialShortTokenAmount());
        eventData.uintItems.setItem(2, "minMarketTokens", deposit.minMarketTokens());
        eventData.uintItems.setItem(3, "updatedAtBlock", deposit.updatedAtBlock());
        eventData.uintItems.setItem(4, "executionFee", deposit.executionFee());
        eventData.uintItems.setItem(5, "callbackGasLimit", deposit.callbackGasLimit());

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "shouldUnwrapNativeToken", deposit.shouldUnwrapNativeToken());

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog1(
            "DepositCreated",
            Cast.toBytes32(deposit.account()),
            eventData
        );
    }

    function emitDepositExecuted(
        EventEmitter eventEmitter,
        bytes32 key,
        uint256 longTokenAmount,
        uint256 shortTokenAmount,
        uint256 receivedMarketTokens
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "longTokenAmount", longTokenAmount);
        eventData.uintItems.setItem(1, "shortTokenAmount", shortTokenAmount);
        eventData.uintItems.setItem(2, "receivedMarketTokens", receivedMarketTokens);

        eventEmitter.emitEventLog(
            "DepositExecuted",
            eventData
        );
    }

    function emitDepositCancelled(
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
            "DepositCancelled",
            eventData
        );
    }
}
