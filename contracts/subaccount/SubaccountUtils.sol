// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

library SubaccountUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function addSubaccount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount
    ) internal {
        bytes32 setKey = Keys.subaccountListKey(account);
        dataStore.addAddress(setKey, subaccount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventEmitter.emitEventLog2(
            "AddSubaccount",
            Cast.toBytes32(account),
            Cast.toBytes32(subaccount),
            eventData
        );
    }

    function removeSubaccount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount
    ) internal {
        bytes32 setKey = Keys.subaccountListKey(account);
        dataStore.removeAddress(setKey, subaccount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventEmitter.emitEventLog2(
            "RemoveSubaccount",
            Cast.toBytes32(account),
            Cast.toBytes32(subaccount),
            eventData
        );
    }

    function incrementSubaccountActionCount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount,
        bytes32 actionType
    ) internal {
        bytes32 key = Keys.subaccountActionCountKey(account, subaccount, actionType);
        uint256 nextValue = dataStore.incrementUint(key, 1);
        validateSubaccountActionCount(dataStore, account, subaccount, actionType, nextValue);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "nextValue", nextValue);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "actionType", actionType);

        eventEmitter.emitEventLog2(
            "IncrementSubaccountActionCount",
            Cast.toBytes32(account),
            Cast.toBytes32(subaccount),
            eventData
        );
    }

    function setMaxAllowedSubaccountActionCount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 maxAllowedCount
    ) internal {
        bytes32 key = Keys.maxAllowedSubaccountActionCountKey(account, subaccount, actionType);
        dataStore.setUint(key, maxAllowedCount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "maxAllowedCount", maxAllowedCount);

        eventEmitter.emitEventLog2(
            "SetMaxAllowedSubaccountActionCount",
            Cast.toBytes32(account),
            Cast.toBytes32(subaccount),
            eventData
        );
    }

    function validateSubaccountActionCount(
        DataStore dataStore,
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 count
    ) internal view {
        bytes32 key = Keys.maxAllowedSubaccountActionCountKey(account, subaccount, actionType);
        uint256 maxCount = dataStore.getUint(key);
        if (count > maxCount) {
            revert Errors.MaxSubaccountActionCountExceeded(account, subaccount, count, maxCount);
        }
    }

    function validateSubaccount(
        DataStore dataStore,
        address account,
        address subaccount
    ) internal view {
        bytes32 setKey = Keys.subaccountListKey(account);
        if (!dataStore.containsAddress(setKey, subaccount)) {
            revert Errors.SubaccountNotAuthorized(account, subaccount);
        }
    }

    function getSubaccountAutoTopUpAmount(
        DataStore dataStore,
        address account,
        address subaccount
    ) internal view returns (uint256) {
        bytes32 key = Keys.subaccountAutoTopUpAmountKey(account, subaccount);
        return dataStore.getUint(key);
    }

    function setSubaccountAutoTopUpAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount,
        uint256 amount
    ) internal {
        bytes32 key = Keys.subaccountAutoTopUpAmountKey(account, subaccount);

        dataStore.setUint(key, amount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog2(
            "SetSubaccountAutoTopUpAmount",
            Cast.toBytes32(account),
            Cast.toBytes32(subaccount),
            eventData
        );
    }
}
