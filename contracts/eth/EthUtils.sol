// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "./IWETH.sol";

library EthUtils {
    using SafeERC20 for IERC20;

    function weth(DataStore dataStore) internal view returns (address) {
        return dataStore.getAddress(Keys.WETH);
    }

    function sendWeth(DataStore dataStore, address receiver) internal returns (uint256) {
        if (msg.value == 0) { return 0; }

        address _weth = weth(dataStore);
        IWETH(_weth).deposit{value: msg.value}();
        IERC20(_weth).safeTransfer(address(receiver), msg.value);

        return msg.value;
    }
}
