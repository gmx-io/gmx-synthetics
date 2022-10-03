// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../role/RoleModule.sol";
import "../eth/IWETH.sol";

contract Bank is RoleModule {
    using SafeERC20 for IERC20;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function transferOut(address token, uint256 amount, address receiver) external onlyController {
        _transferOut(token, amount, receiver);
    }

    function transferOut(
        address weth,
        address token,
        uint256 amount,
        address receiver,
        bool hasCollateralInETH
    ) external onlyController {
        if (token == weth && hasCollateralInETH) {
            _transferOutEth(token, amount, receiver);
        } else {
            _transferOut(token, amount, receiver);
        }
    }

    function _transferOut(address token, uint256 amount, address receiver) internal {
        require(receiver != address(this), "Bank: invalid receiver");

        IERC20(token).safeTransfer(receiver, amount);

        _afterTransferOut(token);
    }

    function _transferOutEth(address token, uint256 amount, address receiver) internal {
        require(receiver != address(this), "Bank: invalid receiver");

        IWETH(token).withdraw(amount);
        payable(receiver).transfer(amount);

        _afterTransferOut(token);
    }

    function _afterTransferOut(address /* token */) internal virtual {}
}
