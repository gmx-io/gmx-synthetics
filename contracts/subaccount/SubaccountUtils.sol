// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";
import "../order/IBaseOrderUtils.sol";

struct SubaccountApproval {
    address subaccount;
    bool shouldAdd;
    uint256 expiresAt;
    uint256 maxAllowedCount;
    bytes32 actionType;
    uint256 nonce; // for replay attack protection
    uint256 desChainId;
    uint256 deadline;
    bytes32 integrationId;
    bytes signature;
}

library SubaccountUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function validateCreateOrderParams(
        address account,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external pure {
        if (params.addresses.receiver != account) {
            revert Errors.InvalidReceiverForSubaccountOrder(params.addresses.receiver, account);
        }

        if (params.addresses.cancellationReceiver != address(0) && params.addresses.cancellationReceiver != account) {
            revert Errors.InvalidCancellationReceiverForSubaccountOrder(params.addresses.cancellationReceiver, account);
        }
    }

    function addSubaccount(DataStore dataStore, EventEmitter eventEmitter, address account, address subaccount) public {
        bytes32 setKey = Keys.subaccountListKey(account);
        dataStore.addAddress(setKey, subaccount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventEmitter.emitEventLog2("AddSubaccount", Cast.toBytes32(account), Cast.toBytes32(subaccount), eventData);
    }

    function removeSubaccount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount
    ) external {
        bytes32 setKey = Keys.subaccountListKey(account);
        dataStore.removeAddress(setKey, subaccount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventEmitter.emitEventLog2("RemoveSubaccount", Cast.toBytes32(account), Cast.toBytes32(subaccount), eventData);
    }

    function handleSubaccountApproval(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        SubaccountApproval calldata subaccountApproval
    ) external {
        if (subaccountApproval.maxAllowedCount > 0) {
            setMaxAllowedSubaccountActionCount(
                dataStore,
                eventEmitter,
                account,
                subaccountApproval.subaccount,
                subaccountApproval.actionType,
                subaccountApproval.maxAllowedCount
            );
        }

        if (subaccountApproval.expiresAt > 0) {
            setSubaccountExpiresAt(
                dataStore,
                eventEmitter,
                account,
                subaccountApproval.subaccount,
                subaccountApproval.actionType,
                subaccountApproval.expiresAt
            );
        }

        if (subaccountApproval.shouldAdd) {
            addSubaccount(dataStore, eventEmitter, account, subaccountApproval.subaccount);
        }
    }

    function handleSubaccountAction(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 actionsCount
    ) external {
        validateSubaccount(dataStore, account, subaccount);

        bytes32 key = Keys.subaccountActionCountKey(account, subaccount, actionType);
        uint256 nextValue = dataStore.incrementUint(key, actionsCount);
        _validateSubaccountActionCountAndExpiresAt(dataStore, account, subaccount, actionType, nextValue);

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

    function setSubaccountExpiresAt(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 expiresAt
    ) public {
        bytes32 key = Keys.subaccountExpiresAtKey(account, subaccount, actionType);
        dataStore.setUint(key, expiresAt);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "expiresAt", expiresAt);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "actionType", actionType);

        eventEmitter.emitEventLog2(
            "SetSubaccountExpiresAt",
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
    ) public {
        bytes32 key = Keys.maxAllowedSubaccountActionCountKey(account, subaccount, actionType);
        dataStore.setUint(key, maxAllowedCount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "maxAllowedCount", maxAllowedCount);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "actionType", actionType);

        eventEmitter.emitEventLog2(
            "SetMaxAllowedSubaccountActionCount",
            Cast.toBytes32(account),
            Cast.toBytes32(subaccount),
            eventData
        );
    }

    function _validateSubaccountActionCountAndExpiresAt(
        DataStore dataStore,
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 count
    ) private view {
        bytes32 expiresAtKey = Keys.subaccountExpiresAtKey(account, subaccount, actionType);
        uint256 expiresAt = dataStore.getUint(expiresAtKey);

        if (block.timestamp > expiresAt) {
            revert Errors.SubaccountApprovalExpired(account, subaccount, expiresAt, block.timestamp);
        }

        bytes32 maxCountKey = Keys.maxAllowedSubaccountActionCountKey(account, subaccount, actionType);
        uint256 maxCount = dataStore.getUint(maxCountKey);

        if (count > maxCount) {
            revert Errors.MaxSubaccountActionCountExceeded(account, subaccount, count, maxCount);
        }
    }

    function validateSubaccount(DataStore dataStore, address account, address subaccount) public view {
        bytes32 setKey = Keys.subaccountListKey(account);
        if (!dataStore.containsAddress(setKey, subaccount)) {
            revert Errors.SubaccountNotAuthorized(account, subaccount);
        }
    }

    function validateIntegrationId(
        DataStore dataStore,
        address account,
        address subaccount
    ) external view {
        bytes32 integrationId = dataStore.getBytes32(Keys.subaccountIntegrationIdKey(account, subaccount));
        bytes32 key = Keys.subaccountIntegrationDisabledKey(integrationId);
        if (dataStore.getBool(key)) {
            revert Errors.SubaccountIntegrationIdDisabled(integrationId);
        }
    }

    function getSubaccountAutoTopUpAmount(
        DataStore dataStore,
        address account,
        address subaccount
    ) external view returns (uint256) {
        bytes32 key = Keys.subaccountAutoTopUpAmountKey(account, subaccount);
        return dataStore.getUint(key);
    }

    function setSubaccountAutoTopUpAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount,
        uint256 amount
    ) external {
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

    function setSubaccountIntegrationId(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address account,
        address subaccount,
        bytes32 integrationId
    ) external {
        bytes32 key = Keys.subaccountIntegrationIdKey(account, subaccount);

        dataStore.setBytes32(key, integrationId);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "subaccount", subaccount);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "integrationId", integrationId);

        eventEmitter.emitEventLog2(
            "SetSubaccountIntegrationId",
            Cast.toBytes32(account),
            Cast.toBytes32(subaccount),
            eventData
        );
    }
}
