// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";
import "../error/Errors.sol";

library AutoCancelUtils {
    function addAutoCancelOrderKey(DataStore dataStore, bytes32 positionKey, bytes32 orderKey) internal {
        bytes32 listKey = Keys.autoCancelOrderListKey(positionKey);
        uint256 maxAutoCancelOrders = getMaxAutoCancelOrders(dataStore);
        uint256 count = dataStore.getBytes32Count(listKey);
        if (count >= maxAutoCancelOrders) {
            revert Errors.MaxAutoCancelOrdersExceeded(count, maxAutoCancelOrders);
        }

        dataStore.addBytes32(listKey, orderKey);
    }

    function removeAutoCancelOrderKey(DataStore dataStore, bytes32 positionKey, bytes32 orderKey) internal {
        bytes32 listKey = Keys.autoCancelOrderListKey(positionKey);
        dataStore.removeBytes32(listKey, orderKey);
    }

    function getAutoCancelOrderKeys(DataStore dataStore, bytes32 positionKey) internal view returns (bytes32[] memory) {
        bytes32 listKey = Keys.autoCancelOrderListKey(positionKey);
        uint256 maxAutoCancelOrders = getMaxAutoCancelOrders(dataStore);
        return dataStore.getBytes32ValuesAt(listKey, 0, maxAutoCancelOrders);
    }

    function getMaxAutoCancelOrders(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getUint(Keys.MAX_AUTO_CANCEL_ORDERS);
    }
}
