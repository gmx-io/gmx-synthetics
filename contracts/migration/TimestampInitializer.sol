// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../role/RoleModule.sol";
import "../order/OrderStoreUtils.sol";
import "../position/PositionStoreUtils.sol";

contract TimestampInitializer is RoleModule {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }


    function initializeOrderTimestamps(uint256 start, uint256 end) external onlyConfigKeeper {
        bytes32[] memory keys = dataStore.getBytes32ValuesAt(Keys.ORDER_LIST, start, end);
        uint256 currentTimestamp = Chain.currentTimestamp();

        for (uint256 i; i < keys.length; i++) {
            bytes32 key = keys[i];

            uint256 updatedAtTime = dataStore.getUint(
                keccak256(abi.encode(key, OrderStoreUtils.UPDATED_AT_TIME))
            );

            if (updatedAtTime == 0) {

                dataStore.setUint(
                    keccak256(abi.encode(key, OrderStoreUtils.UPDATED_AT_TIME)),
                    currentTimestamp
                );

                EventUtils.EventLogData memory eventData;
                eventData.bytes32Items.initItems(1);
                eventData.bytes32Items.setItem(0, "key", key);

                eventData.uintItems.initItems(1);
                eventData.uintItems.setItem(0, "updatedAtTime", currentTimestamp);

                eventEmitter.emitEventLog(
                    "InitializeOrderUpdatedAtTime",
                    eventData
                );
            }
        }
    }

    function initializePositionTimestamps(uint256 start, uint256 end) external onlyConfigKeeper {
        bytes32[] memory keys = dataStore.getBytes32ValuesAt(Keys.POSITION_LIST, start, end);
        uint256 currentTimestamp = Chain.currentTimestamp();

        for (uint256 i; i < keys.length; i++) {
            bytes32 key = keys[i];

            uint256 increasedAtTime = dataStore.getUint(
                keccak256(abi.encode(key, PositionStoreUtils.INCREASED_AT_TIME))
            );

            if (increasedAtTime == 0) {
                dataStore.setUint(
                    keccak256(abi.encode(key, PositionStoreUtils.INCREASED_AT_TIME)),
                    currentTimestamp
                );

                EventUtils.EventLogData memory eventData;
                eventData.bytes32Items.initItems(1);
                eventData.bytes32Items.setItem(0, "key", key);

                eventData.uintItems.initItems(1);
                eventData.uintItems.setItem(0, "increasedAtTime", currentTimestamp);

                eventEmitter.emitEventLog(
                    "InitializePositionIncreasedAtTime",
                    eventData
                );
            }

            uint256 decreasedAtTime = dataStore.getUint(
                keccak256(abi.encode(key, PositionStoreUtils.DECREASED_AT_TIME))
            );

            if (decreasedAtTime == 0) {
                dataStore.setUint(
                    keccak256(abi.encode(key, PositionStoreUtils.DECREASED_AT_TIME)),
                    currentTimestamp
                );

                EventUtils.EventLogData memory eventData;
                eventData.bytes32Items.initItems(1);
                eventData.bytes32Items.setItem(0, "key", key);

                eventData.uintItems.initItems(1);
                eventData.uintItems.setItem(0, "decreasedAtTime", currentTimestamp);

                eventEmitter.emitEventLog(
                    "InitializePositionDecreasedAtTime",
                    eventData
                );
            }
        }
    }

}
