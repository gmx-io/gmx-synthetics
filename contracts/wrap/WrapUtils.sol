// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "./IWNT.sol";

library WrapUtils {
    using SafeERC20 for IERC20;

    function wnt(DataStore dataStore) internal view returns (address) {
        return dataStore.getAddress(Keys.WNT);
    }

    function sendWnt(DataStore dataStore, address receiver) internal returns (uint256) {
        if (msg.value == 0) { return 0; }

        address _wnt = wnt(dataStore);
        IWNT(_wnt).deposit{value: msg.value}();
        IERC20(_wnt).safeTransfer(address(receiver), msg.value);

        return msg.value;
    }
}
