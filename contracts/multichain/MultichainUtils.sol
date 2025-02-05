// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

/**
 * @title MultichainUtils
 */
library MultichainUtils {
    function increaseBalance(DataStore dataStore, address account, address token, uint256 amount) internal {
        dataStore.incrementUint(Keys.multichainBalanceKey(account, token), amount);
    }

    function decreaseBalance(DataStore dataStore, address account, address token, uint256 amount) internal {
        dataStore.decrementUint(Keys.multichainBalanceKey(account, token), amount);
    }
}
