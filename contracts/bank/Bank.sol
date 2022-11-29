// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../token/TokenUtils.sol";
import "./FundReceiver.sol";

contract Bank is FundReceiver {
    using SafeERC20 for IERC20;

    constructor(RoleStore _roleStore) FundReceiver(_roleStore) {}

    receive() external payable {}

    function transferOut(
        DataStore dataStore,
        address token,
        uint256 amount,
        address receiver
    ) external onlyController {
        _transferOut(dataStore, token, amount, receiver);
    }

    function transferOut(
        DataStore dataStore,
        address token,
        uint256 amount,
        address receiver,
        bool shouldUnwrapNativeToken
    ) external onlyController {
        address wnt = TokenUtils.wnt(dataStore);

        if (token == wnt && shouldUnwrapNativeToken) {
            _transferOutNativeToken(dataStore, token, amount, receiver);
        } else {
            _transferOut(dataStore, token, amount, receiver);
        }
    }

    function _transferOut(
        DataStore dataStore,
        address token,
        uint256 amount,
        address receiver
    ) internal {
        require(receiver != address(this), "Bank: invalid receiver");

        TokenUtils.nonRevertingTransfer(dataStore, token, receiver, amount);

        _afterTransferOut(token);
    }

    function _transferOutNativeToken(
        DataStore dataStore,
        address token,
        uint256 amount,
        address receiver
    ) internal {
        require(receiver != address(this), "Bank: invalid receiver");

        TokenUtils.nonRevertingWithdrawAndSendNativeToken(
            dataStore,
            token,
            receiver,
            amount
        );

        _afterTransferOut(token);
    }

    function _afterTransferOut(address /* token */) internal virtual {}
}
