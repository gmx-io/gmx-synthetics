// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../role/RoleModule.sol";

/**
 * @title Router
 * @dev Users will approve this router for token spenditures
 */
contract Router is RoleModule {
    using SafeERC20 for IERC20;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    /**
     * @dev transfer the specified amount of tokens from the account to the receiver
     * @param token the token to transfer
     * @param account the account to transfer from
     * @param receiver the account to transfer to
     * @param amount the amount of tokens to transfer
     */
    function pluginTransfer(address token, address account, address receiver, uint256 amount) external onlyRouterPlugin {
        IERC20(token).safeTransferFrom(account, receiver, amount);
    }
}
