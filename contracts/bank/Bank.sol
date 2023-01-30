// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../token/TokenUtils.sol";
import "../role/RoleModule.sol";

// @title Bank
// @dev Contract to handle storing and transferring of tokens
contract Bank is RoleModule {
    using SafeERC20 for IERC20;

    DataStore public immutable dataStore;

    error SelfTransferNotSupported(address receiver);
    error InvalidNativeTokenSender(address msgSender);

    constructor(RoleStore _roleStore, DataStore _dataStore) RoleModule(_roleStore) {
        dataStore = _dataStore;
    }

    receive() external payable {
        address wnt = TokenUtils.wnt(dataStore);
        if (msg.sender != wnt) {
            revert InvalidNativeTokenSender(msg.sender);
        }
    }

    // @dev transfer tokens from this contract to a receiver
    //
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    function transferOut(
        address token,
        address receiver,
        uint256 amount
    ) external onlyController {
        _transferOut(token, receiver, amount);
    }

    // @dev transfer tokens from this contract to a receiver
    // handles native token transfers as well
    //
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    // @param shouldUnwrapNativeToken whether to unwrap the wrapped native token
    // before transferring
    function transferOut(
        address token,
        address receiver,
        uint256 amount,
        bool shouldUnwrapNativeToken
    ) external onlyController {
        address wnt = TokenUtils.wnt(dataStore);

        if (token == wnt && shouldUnwrapNativeToken) {
            _transferOutNativeToken(token, receiver, amount);
        } else {
            _transferOut(token, receiver, amount);
        }
    }

    // @dev transfer native tokens from this contract to a receiver
    //
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    // @param shouldUnwrapNativeToken whether to unwrap the wrapped native token
    // before transferring
    function transferOutNativeToken(
        address receiver,
        uint256 amount
    ) external onlyController {
        address wnt = TokenUtils.wnt(dataStore);
        _transferOutNativeToken(wnt, receiver, amount);
    }

    // @dev transfer tokens from this contract to a receiver
    //
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    function _transferOut(
        address token,
        address receiver,
        uint256 amount
    ) internal {
        if (receiver == address(this)) {
            revert SelfTransferNotSupported(receiver);
        }

        TokenUtils.transfer(dataStore, token, receiver, amount);

        _afterTransferOut(token);
    }

    // @dev unwrap wrapped native tokens and transfer the native tokens from
    // this contract to a receiver
    //
    // @param token the token to transfer
    // @param amount the amount to transfer
    // @param receiver the address to transfer to
    function _transferOutNativeToken(
        address token,
        address receiver,
        uint256 amount
    ) internal {
        if (receiver == address(this)) {
            revert SelfTransferNotSupported(receiver);
        }

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
