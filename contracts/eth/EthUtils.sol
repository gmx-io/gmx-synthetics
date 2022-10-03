// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

library EthUtils {
    function weth(DataStore dataStore) internal view returns (address) {
        return dataStore.getAddress(Keys.WETH);
    }
}
