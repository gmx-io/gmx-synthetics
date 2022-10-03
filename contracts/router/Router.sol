// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../role/RoleModule.sol";

// users will approve this router for token spenditures
contract Router is RoleModule {
    using SafeERC20 for IERC20;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function pluginTransfer(address token, address account, address receiver, uint256 amount) external onlyRouterPlugin {
        IERC20(token).safeTransferFrom(account, receiver, amount);
    }
}
