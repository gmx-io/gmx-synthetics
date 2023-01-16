// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";
import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";

// @title ExchangeUtils
// @dev Library for exchange helper functions
library ExchangeUtils {
    function handleExcessExecutionFee(
        DataStore dataStore,
        StrictBank bank,
        uint256 wntAmount,
        uint256 executionFee
    ) internal {
        uint256 excessWntAmount = wntAmount - executionFee;
        if (excessWntAmount > 0) {
            address holdingAddress = dataStore.getAddress(Keys.HOLDING_ADDRESS);
            bank.transferOutNativeToken(holdingAddress, excessWntAmount);
        }
    }

    function validateRequestCancellation(
        DataStore dataStore,
        uint256 createdAtBlock,
        string memory error
    ) internal view {
        uint256 requestExpirationAge = dataStore.getUint(Keys.REQUEST_EXPIRATION_AGE);
        if (Chain.currentBlockNumber() - createdAtBlock < requestExpirationAge) {
            revert(error);
        }
    }
}
