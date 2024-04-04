// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";
import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";

// @title ExchangeUtils
// @dev Library for exchange helper functions
library ExchangeUtils {
    // @dev validate that sufficient time has passed for request to be cancelled
    // @param dataStore DataStore
    // @param createdAtTime the time the request was created at
    // @param requestType the type of the request
    function validateRequestCancellation(
        DataStore dataStore,
        uint256 createdAtTime,
        string memory requestType
    ) internal view {
        uint256 requestExpirationTime = dataStore.getUint(Keys.REQUEST_EXPIRATION_TIME);
        uint256 requestAge = Chain.currentTimestamp() - createdAtTime;
        if (requestAge < requestExpirationTime) {
            revert Errors.RequestNotYetCancellable(requestAge, requestExpirationTime, requestType);
        }
    }
}
