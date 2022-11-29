// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "./IWNT.sol";
import "../utils/GasLimitedTokenTransfer.sol";

library TokenUtils {
    using SafeERC20 for IERC20;
    using GasLimitedTokenTransfer for IERC20;

    event TransferReverted(string reason);

    // throw a custom TransferError to prevent spoofing of errors to match
    // error exceptions in e.g. OrderHandler
    error TransferError(address token, address receiver, uint256 amount);

    function wnt(DataStore dataStore) internal view returns (address) {
        return dataStore.getAddress(Keys.WNT);
    }

    function transfer(
        DataStore dataStore,
        address token,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }

        uint256 gasLimit = dataStore.getUint(Keys.tokenTransferGasLimit(token));

        try IERC20(token).safeTransferWithGasLimit(receiver, amount, gasLimit) {
            return;
        } catch Error(string memory reason) {
            emit TransferReverted(reason);
        } catch (bytes memory _reason) {
            string memory reason = string(abi.encode(_reason));
            emit TransferReverted(reason);
        }

        revert TransferError(token, receiver, amount);
    }

    function nonRevertingTransferNativeToken(
        DataStore dataStore,
        address receiver,
        uint256 amount
    ) internal returns (bool) {
        if (amount == 0) { return true; }

        uint256 gasLimit = dataStore.getUint(Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT);

        (bool success, bytes memory data) = payable(receiver).call{ value: amount, gas: gasLimit }();

        if (success) { return true; }

        string memory reason = string(abi.encode(data));
        emit TransferReverted(reason);

        return false;
    }

    function depositAndSendWrappedNativeToken(
        DataStore dataStore,
        address receiver,
        uint256 amount
    ) internal returns (bool) {
        if (amount == 0) { return 0; }

        address _wnt = wnt(dataStore);
        IWNT(_wnt).deposit{value: amount}();

        return transfer(
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
    ) internal returns (bool) {
        if (amount == 0) { return 0; }

        IWNT(_wnt).withdraw(amount);

        return nonRevertingTransferNativeToken(dataStore, receiver, amount);
    }
}
