// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "./IWNT.sol";

library TokenUtils {
    using Address for address;
    using SafeERC20 for IERC20;

    event TokenTransferReverted(string reason);
    event NativeTokenTransferReverted(string reason);

    // throw custom errors to prevent spoofing of errors
    // this is necessary because contracts like DepositHandler, WithdrawalHandler, OrderHandler
    // do not cancel requests for specific errors
    error TokenTransferError(address token, address receiver, uint256 amount);
    error NativeTokenTransferError(address receiver, uint256 amount);

    function wnt(DataStore dataStore) internal view returns (address) {
        return dataStore.getAddress(Keys.WNT);
    }

    // limit the amount of gas forwarded so that a user cannot intentionally
    // construct a token call that would consume all gas and prevent necessary
    // actions like request cancellation from being executed
    function transfer(
        DataStore dataStore,
        address token,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }

        uint256 gasLimit = dataStore.getUint(Keys.tokenTransferGasLimit(token));

        (bool success, bytes memory returndata) = nonRevertingTransferWithGasLimit(
            IERC20(token),
            receiver,
            amount,
            gasLimit
        );

        if (success) { return; }

        string memory reason = string(abi.encode(returndata));
        emit TokenTransferReverted(reason);

        revert TokenTransferError(token, receiver, amount);
    }

    // limit the amount of gas forwarded so that a user cannot intentionally
    // construct a token call that would consume all gas and prevent necessary
    // actions like request cancellation from being executed
    function transferNativeToken(
        DataStore dataStore,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }

        uint256 gasLimit = dataStore.getUint(Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT);

        (bool success, bytes memory data) = payable(receiver).call{ value: amount, gas: gasLimit }("");

        if (success) { return; }

        string memory reason = string(abi.encode(data));
        emit NativeTokenTransferReverted(reason);

        revert NativeTokenTransferError(receiver, amount);
    }

    function depositAndSendWrappedNativeToken(
        DataStore dataStore,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }

        address _wnt = wnt(dataStore);
        IWNT(_wnt).deposit{value: amount}();

        transfer(
            dataStore,
            _wnt,
            receiver,
            amount
        );
    }

    function withdrawAndSendNativeToken(
        DataStore dataStore,
        address _wnt,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }

        IWNT(_wnt).withdraw(amount);

        transferNativeToken(dataStore, receiver, amount);
    }

    function nonRevertingTransferWithGasLimit(
        IERC20 token,
        address to,
        uint256 amount,
        uint256 gasLimit
    ) internal returns (bool, bytes memory) {
        bytes memory data = abi.encodeWithSelector(token.transfer.selector, to, amount);
        (bool success, bytes memory returndata) = address(token).call{ gas: gasLimit }(data);

        if (success) {
            if (returndata.length == 0) {
                // only check isContract if the call was successful and the return data is empty
                // otherwise we already know that it was a contract
                if (!address(token).isContract()) {
                    return (false, "Call to non-contract");
                }
            }

            // some tokens do not revert on a failed transfer, they will return a boolean instead
            // validate that the returned boolean is true, otherwise indicate that the token transfer failed
            if (returndata.length > 0 && !abi.decode(returndata, (bool))) {
                return (false, returndata);
            }

            // transfers on some tokens do not return a boolean value, they will just revert if a transfer fails
            // for these tokens, if success is true then the transfer should have completed
            return (true, returndata);
        }

        return (false, returndata);
    }
}
