// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../utils/BasicMulticall.sol";
import "../order/OrderStoreUtils.sol";
import "../position/PositionStoreUtils.sol";
import "../order/AutoCancelUtils.sol";
import "../utils/Cast.sol";

contract AutoCancelSyncer is ReentrancyGuard, RoleModule, BasicMulticall {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    using Order for Order.Props;

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

    function syncAutoCancelOrderListForAccount(address account, uint256 start, uint256 end) external onlyConfigKeeper nonReentrant {
        bytes32[] memory positionKeys = PositionStoreUtils.getAccountPositionKeys(dataStore, account, start, end);

        for (uint256 i; i < positionKeys.length; i++) {
            _syncAutoCancelOrderListForPosition(account, positionKeys[i]);
        }
    }

    function syncAutoCancelOrderListForPosition(address account, bytes32 positionKey) external onlyConfigKeeper nonReentrant {
        _syncAutoCancelOrderListForPosition(account, positionKey);
    }

    function _syncAutoCancelOrderListForPosition(address account, bytes32 positionKey) internal {
        bytes32[] memory orderKeys = AutoCancelUtils.getAutoCancelOrderKeys(dataStore, positionKey);

        for (uint256 j; j < orderKeys.length; j++) {
            bytes32 orderKey = orderKeys[j];
            Order.Props memory order = OrderStoreUtils.get(dataStore, orderKey);

            if (order.account() == address(0) || (order.sizeDeltaUsd() == 0 && order.initialCollateralDeltaAmount() == 0)) {
                AutoCancelUtils.removeAutoCancelOrderKey(dataStore, positionKey, orderKey);

                EventUtils.EventLogData memory eventData;
                eventData.addressItems.initItems(1);
                eventData.addressItems.setItem(0, "account", account);
                eventData.bytes32Items.initItems(2);
                eventData.bytes32Items.setItem(0, "positionKey", positionKey);
                eventData.bytes32Items.setItem(1, "orderKey", orderKey);
                eventEmitter.emitEventLog1(
                    "ConfigSyncAutoCancelOrderList",
                    Cast.toBytes32(account),
                    eventData
                );
            }
        }
    }
}
