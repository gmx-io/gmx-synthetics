// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/ErrorUtils.sol";
import "../utils/AccountUtils.sol";

import "./IWNT.sol";
import {Bank} from "../bank/Bank.sol";

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

    uint256 public constant WITHDRAWAL_LEVEL_PRECISION = 1000;

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
        AccountUtils.validateReceiver(receiver);

        uint256 gasLimit = dataStore.getUint(Keys.tokenTransferGasLimit(token));
        if (gasLimit == 0) {
            revert Errors.EmptyTokenTranferGasLimit(token);
        }

        (bool success0, /* bytes memory returndata */) = nonRevertingTransferWithGasLimit(
            IERC20(token),
            receiver,
            amount,
            gasLimit
        );

        if (success0) { return; }

        address holdingAddress = dataStore.getAddress(Keys.HOLDING_ADDRESS);

        if (holdingAddress == address(0)) {
            revert Errors.EmptyHoldingAddress();
        }

        // in case transfers to the receiver fail due to blacklisting or other reasons
        // send the tokens to a holding address to avoid possible gaming through reverting
        // transfers
        (bool success1, bytes memory returndata) = nonRevertingTransferWithGasLimit(
            IERC20(token),
            holdingAddress,
            amount,
            gasLimit
        );

        if (success1) { return; }

        (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(returndata);
        emit TokenTransferReverted(reason, returndata);

        // throw custom errors to prevent spoofing of errors
        // this is necessary because contracts like DepositHandler, WithdrawalHandler, OrderHandler
        // do not cancel requests for specific errors
        revert Errors.TokenTransferError(token, receiver, amount);
    }

    function sendNativeToken(
        DataStore dataStore,
        address receiver,
        uint256 amount
    ) internal {
        if (amount == 0) { return; }

        AccountUtils.validateReceiver(receiver);

        uint256 gasLimit = dataStore.getUint(Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT);

        bool success;
        // use an assembly call to avoid loading large data into memory
        // input mem[in…(in+insize)]
        // output area mem[out…(out+outsize))]
        assembly {
            success := call(
                gasLimit, // gas limit
                receiver, // receiver
                amount, // value
                0, // in
                0, // insize
                0, // out
                0 // outsize
            )
        }

        if (success) { return; }

        // if the transfer failed, re-wrap the token and send it to the receiver
        depositAndSendWrappedNativeToken(
            dataStore,
            receiver,
            amount
        );
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
        AccountUtils.validateReceiver(receiver);

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
        AccountUtils.validateReceiver(receiver);

        IWNT(_wnt).withdraw(amount);

        uint256 gasLimit = dataStore.getUint(Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT);

        bool success;
        // use an assembly call to avoid loading large data into memory
        // input mem[in…(in+insize)]
        // output area mem[out…(out+outsize))]
        assembly {
            success := call(
                gasLimit, // gas limit
                receiver, // receiver
                amount, // value
                0, // in
                0, // insize
                0, // out
                0 // outsize
            )
        }

        if (success) { return; }

        // if the transfer failed, re-wrap the token and send it to the receiver
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

    // @dev Check if this withdrawal fits into withdrawals threshold for a given time period
    function _applyRateLimit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address receiver,
        address token,
        uint256 amount
    ) internal returns (bool isManualTransferEnabled) {
        uint256 withdrawalRatePeriod = dataStore.getUint(Keys.bankTransferOutThresholdPeriodKey(token));
        // if not set -> skip checks
        if (withdrawalRatePeriod == 0) {
            return false;
        }

        uint256 lastWithdrawalLevel = dataStore.getUint(Keys.bankTransferOutLevelKey(token));
        uint256 lastWithdrawal = dataStore.getUint(Keys.bankTransferOutTimeKey(token));

        // calculate current withdrawal_level. This is an estimation of users withdrawal_amount which is decreasing over time.
        // Decreasing function is following:
        // (1 - (timeSinceLastWithdrawal / withdrawalRatePeriod) ^ N) * lastWithdrawalLevel
        // This function stays near constant all the way to the withdrawalRatePeriod and then quickly drops towards 0
        // thus simulating straight-forward approach with storing all withdrawals for the last time period in the buckets.
        // This approach is not absolutely accurate, values can be slightly lower than using iterative one,
        // but using way less gas and no loops.
        uint256 timeSinceLastWithdrawal = block.timestamp - lastWithdrawal > withdrawalRatePeriod
            ? withdrawalRatePeriod
            : block.timestamp - lastWithdrawal;

        // N is slope parameter. We are using N == 16 to effectively power it using bitwise shift
        uint256 currentWithdrawalLevel = Precision.mulDiv(
            timeSinceLastWithdrawal, WITHDRAWAL_LEVEL_PRECISION, withdrawalRatePeriod
        ) << 4;
        currentWithdrawalLevel = (WITHDRAWAL_LEVEL_PRECISION - currentWithdrawalLevel) * lastWithdrawalLevel;
        // add current amount to check whether it will fit in the cap
        currentWithdrawalLevel += amount;

        uint256 withdrawalLimit = dataStore.getUint(Keys.bankTransferOutCapKey(token));
        isManualTransferEnabled = dataStore.getBool(Keys.bankManualTransferOutKey(token));
        // if withdrawalLevel exceeds withdrawal cap than manual transfer approval should be enabled
        // if it is already enabled do not emit event
        // switch back to auto transfer validation if withdrawal level is less than cap
        if (currentWithdrawalLevel > withdrawalLimit != isManualTransferEnabled) {
            isManualTransferEnabled = !isManualTransferEnabled;
            dataStore.setBool(Keys.bankManualTransferOutKey(token), isManualTransferEnabled);

            EventUtils.EventLogData memory eventData;
            eventData.addressItems.initItems(2);
            eventData.addressItems.setItem(0, "receiver", receiver);
            eventData.addressItems.setItem(1, "token", token);
            eventData.uintItems.initItems(2);
            eventData.uintItems.setItem(0, "amount", amount);
            eventData.uintItems.setItem(1, "limit", withdrawalLimit);
            eventData.boolItems.initItems(1);
            eventData.boolItems.setItem(0, "isManualWithdrawalEnabled", isManualTransferEnabled);
            eventEmitter.emitEventLog(
                "WithdrawalsManualModeChanged",
                eventData
            );
        }

        dataStore.setUint(Keys.bankTransferOutTimeKey(token), block.timestamp);
        dataStore.setUint(Keys.bankTransferOutLevelKey(token), currentWithdrawalLevel);
    }

    function _recordManualWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address receiver,
        address token,
        uint256 amount,
        bool shouldUnwrapNativeToken
    ) internal {
        bytes32 withdrawalId = keccak256(abi.encode(receiver, token, amount, shouldUnwrapNativeToken, block.timestamp));
        dataStore.setUint(Keys.bankManualWithdrawalAmountKey(withdrawalId), amount);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "receiver", receiver);
        eventData.addressItems.setItem(1, "token", token);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "shouldUnwrapNativeToken", shouldUnwrapNativeToken);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "withdrawalId", withdrawalId);
        eventEmitter.emitEventLog(
            "ManualWithdrawalRequest",
            eventData
        );
    }

    function manualWithdrawal(
        address receiver,
        address token,
        bool shouldUnwrapNativeToken,
        bytes32 withdrawalId
    ) external onlyKeeper {
        uint256 amount = dataStore.getUint(Keys.bankManualWithdrawalAmountKey(withdrawalId));
        if (amount == 0) {
            revert Errors.EmptyAmount();
        }

        dataStore.setUint(Keys.bankManualWithdrawalAmountKey(withdrawalId), 0);

        _transferOut(token, receiver, amount, shouldUnwrapNativeToken);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "receiver", receiver);
        eventData.addressItems.setItem(1, "token", token);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "shouldUnwrapNativeToken", shouldUnwrapNativeToken);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "withdrawalId", withdrawalId);
        eventEmitter.emitEventLog(
            "ManualWithdrawalProcessed",
            eventData
        );
    }

    function transferOutWithRateLimit(
        DataStore dataStore,
        Bank bank
    ) external {

    }
}
