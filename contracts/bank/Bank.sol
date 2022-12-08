// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../token/TokenUtils.sol";
import "./FundReceiver.sol";

// @title Bank
// @dev Contract to handle storing and transferring of tokens
contract Bank is FundReceiver {
    using SafeERC20 for IERC20;

    constructor(RoleStore _roleStore, DataStore _dataStore) FundReceiver(_roleStore, _dataStore) {}

    receive() external payable {}

    // @dev transfer tokens from this contract to a receiver
    //
    // @param dataStore DataStore
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    function transferOut(
        address token,
        uint256 amount,
        address receiver
    ) external onlyController {
        _transferOut(token, amount, receiver);
    }

    // @dev transfer tokens from this contract to a receiver
    // handles native token transfers as well
    //
    // @param dataStore DataStore
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    // @param shouldUnwrapNativeToken whether to unwrap the wrapped native token
    // before transferring
    function transferOut(
        address token,
        uint256 amount,
        address receiver,
        bool shouldUnwrapNativeToken
    ) external onlyController {
        address wnt = TokenUtils.wnt(dataStore);

        if (token == wnt && shouldUnwrapNativeToken) {
            _transferOutNativeToken(token, amount, receiver);
        } else {
            _transferOut(token, amount, receiver);
        }
    }

    // @dev transfer tokens from this contract to a receiver
    //
    // @param dataStore DataStore
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    function _transferOut(
        address token,
        uint256 amount,
        address receiver
    ) internal {
        require(receiver != address(this), "Bank: invalid receiver");

        TokenUtils.transfer(dataStore, token, receiver, amount);

        _afterTransferOut(token);
    }

    // @dev unwrap wrapped native tokens and transfer the native tokens from
    // this contract to a receiver
    //
    // @param dataStore DataStore
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    function _transferOutNativeToken(
        address token,
        uint256 amount,
        address receiver
    ) internal {
        require(receiver != address(this), "Bank: invalid receiver");

        TokenUtils.withdrawAndSendNativeToken(
            dataStore,
            token,
            receiver,
            amount
        );

        _afterTransferOut(token);
    }

    function _afterTransferOut(address /* token */) internal virtual {}
}
