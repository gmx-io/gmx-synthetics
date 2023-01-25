// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";
import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";

// @title ExchangeUtils
// @dev Library for exchange helper functions
library ExchangeUtils {
    function validateRequestCancellation(
        DataStore dataStore,
        uint256 createdAtBlock,
        string memory error
    ) internal view {
        uint256 requestExpirationAge = dataStore.getUint(Keys.REQUEST_EXPIRATION_BLOCK_AGE);
        if (Chain.currentBlockNumber() - createdAtBlock < requestExpirationAge) {
            revert(error);
        }
    }
}
