// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../wrap/IWNT.sol";
import "./FundReceiver.sol";

contract Bank is FundReceiver {
    using SafeERC20 for IERC20;

    constructor(RoleStore _roleStore) FundReceiver(_roleStore) {}

    receive() external payable {}

    function transferOut(address token, uint256 amount, address receiver) external onlyController {
        _transferOut(token, amount, receiver);
    }

    function transferOut(
        address wnt,
        address token,
        uint256 amount,
        address receiver,
        bool shouldUnwrapNativeToken
    ) external onlyController {
        if (token == wnt && shouldUnwrapNativeToken) {
            _transferOutNativeToken(token, amount, receiver);
        } else {
            _transferOut(token, amount, receiver);
        }
    }

    function _transferOut(address token, uint256 amount, address receiver) internal {
        require(receiver != address(this), "Bank: invalid receiver");

        IERC20(token).safeTransfer(receiver, amount);

        _afterTransferOut(token);
    }

    function _transferOutNativeToken(address token, uint256 amount, address receiver) internal {
        require(receiver != address(this), "Bank: invalid receiver");

        IWNT(token).withdraw(amount);
        payable(receiver).transfer(amount);

        _afterTransferOut(token);
    }

    function _afterTransferOut(address /* token */) internal virtual {}
}
