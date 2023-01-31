// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../utils/ErrorUtils.sol";
import "../utils/ReceiverUtils.sol";

import "./IWNT.sol";

/**
 * @title TokenUtils
 * @dev Library for token functions, helps with transferring of tokens and
 * native token functions
 */
library TokenUtils {
    using Address for address;
    using SafeERC20 for IERC20;

    event TokenTransferReverted(string reason, bytes returndata);
    event NativeTokenTransferReverted(string reason);

    // throw custom errors to prevent spoofing of errors
    // this is necessary because contracts like DepositHandler, WithdrawalHandler, OrderHandler
    // do not cancel requests for specific errors
    error TokenTransferError(address token, address receiver, uint256 amount);
    error NativeTokenTransferError(address receiver, uint256 amount);

    /**
     * @dev Returns the address of the WNT token.
     * @param dataStore DataStore contract instance where the address of the WNT token is stored.
     * @return The address of the WNT token.
     */
    function wnt(DataStore dataStore) internal view returns (address) {
        return dataStore.getAddress(Keys.WNT);
    }

    /**
     * @dev Transfers the specified amount of `token` from the caller to `receiver`.
     * limit the amount of gas forwarded so that a user cannot intentionally
     * construct a token call that would consume all gas and prevent necessary
     * actions like request cancellation from being executed
     *
     * @param dataStore The data store that contains the `tokenTransferGasLimit` for the specified `token`.
     * @param token The address of the ERC20 token that is being transferred.
     * @param receiver The address of the recipient of the `token` transfer.
     * @param amount The amount of `token` to transfer.
     */
    function transfer(
        DataStore dataStore,
        address token,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }
        ReceiverUtils.validateReceiver(receiver);

        uint256 gasLimit = dataStore.getUint(Keys.tokenTransferGasLimit(token));

        (bool success, bytes memory returndata) = nonRevertingTransferWithGasLimit(
            IERC20(token),
            receiver,
            amount,
            gasLimit
        );

        if (success) { return; }

        (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(returndata);
        emit TokenTransferReverted(reason, returndata);

        revert TokenTransferError(token, receiver, amount);
    }

    /**
     * Deposits the specified amount of native token and sends the specified
     * amount of wrapped native token to the specified receiver address.
     *
     * @param dataStore the data store to use for storing and retrieving data
     * @param receiver the address of the recipient of the wrapped native token transfer
     * @param amount the amount of native token to deposit and the amount of wrapped native token to send
     */
    function depositAndSendWrappedNativeToken(
        DataStore dataStore,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }
        ReceiverUtils.validateReceiver(receiver);

        address _wnt = wnt(dataStore);
        IWNT(_wnt).deposit{value: amount}();

        transfer(
            dataStore,
            _wnt,
            receiver,
            amount
        );
    }

    /**
     * @dev Withdraws the specified amount of wrapped native token and sends the
     * corresponding amount of native token to the specified receiver address.
     *
     * limit the amount of gas forwarded so that a user cannot intentionally
     * construct a token call that would consume all gas and prevent necessary
     * actions like request cancellation from being executed
     *
     * @param dataStore the data store to use for storing and retrieving data
     * @param _wnt the address of the WNT contract to withdraw the wrapped native token from
     * @param receiver the address of the recipient of the native token transfer
     * @param amount the amount of wrapped native token to withdraw and the amount of native token to send
     */
    function withdrawAndSendNativeToken(
        DataStore dataStore,
        address _wnt,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }
        ReceiverUtils.validateReceiver(receiver);

        IWNT(_wnt).withdraw(amount);

        uint256 gasLimit = dataStore.getUint(Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT);

        (bool success, /* bytes memory data */) = payable(receiver).call{ value: amount, gas: gasLimit }("");

        if (success) { return; }

        // if the transfer failed, re-wrap the token and it to the receiver
        depositAndSendWrappedNativeToken(
            dataStore,
            receiver,
            amount
        );
    }

    /**
     * @dev Transfers the specified amount of ERC20 token to the specified receiver
     * address, with a gas limit to prevent the transfer from consuming all available gas.
     * adapted from https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol
     *
     * @param token the ERC20 contract to transfer the tokens from
     * @param to the address of the recipient of the token transfer
     * @param amount the amount of tokens to transfer
     * @param gasLimit the maximum amount of gas that the token transfer can consume
     * @return a tuple containing a boolean indicating the success or failure of the
     * token transfer, and a bytes value containing the return data from the token transfer
     */
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
