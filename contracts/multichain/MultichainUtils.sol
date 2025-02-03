// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

/**
 * @title MultichainUtils
 */
library MultichainUtils {
    function increaseBalance(DataStore dataStore, uint256 chainId, address account, address token, uint256 amount) internal {
        dataStore.decrementUint(Keys.multichainBalanceKey(chainId, account, token), amount);
    }

    function decreaseBalance(DataStore dataStore, uint256 chainId, address account, address token, uint256 amount) internal {
        dataStore.decrementUint(Keys.multichainBalanceKey(chainId, account, token), amount);
    }
}
