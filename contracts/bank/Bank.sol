// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../token/TokenUtils.sol";
import "../role/RoleModule.sol";
import "../utils/Precision.sol";
import "../event/EventEmitter.sol";

// @title Bank
// @dev Contract to handle storing and transferring of tokens
contract Bank is RoleModule {
    using SafeERC20 for IERC20;
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    uint256 public constant PRECISION = 1000;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(RoleStore _roleStore, DataStore _dataStore, EventEmitter _eventEmitter) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    receive() external payable {
        address wnt = TokenUtils.wnt(dataStore);
        if (msg.sender != wnt) {
            revert Errors.InvalidNativeTokenSender(msg.sender);
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

        bool isManualTransferEnabled = _applyRateLimit(receiver, token, amount);
        if (isManualTransferEnabled) {
            // Skip transfer and emit manual event. Keepers should handle it later
            EventUtils.EventLogData memory eventData;
            eventData.addressItems.initItems(2);
            eventData.addressItems.setItem(0, "receiver", receiver);
            eventData.addressItems.setItem(1, "token", token);
            eventData.uintItems.initItems(2);
            eventData.uintItems.setItem(0, "amount", amount);
            eventData.boolItems.initItems(1);
            eventData.boolItems.setItem(0, "shouldUnwrapNativeToken", shouldUnwrapNativeToken);
            eventEmitter.emitEventLog(
                "ManualWithdrawalRequest",
                eventData
            );
            return;
        }

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
            revert Errors.SelfTransferNotSupported(receiver);
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
            revert Errors.SelfTransferNotSupported(receiver);
        }

        TokenUtils.withdrawAndSendNativeToken(
            dataStore,
            token,
            receiver,
            amount
        );

        _afterTransferOut(token);
    }

    // @dev Check if this withdrawal fits into withdrawals threshold for a given time period
    function _applyRateLimit(address receiver, address token, uint256 amount) internal returns (bool isManualTransferEnabled) {
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
            timeSinceLastWithdrawal, PRECISION, withdrawalRatePeriod
        ) << 4;
        currentWithdrawalLevel = (PRECISION - currentWithdrawalLevel) * lastWithdrawalLevel;
        // add current amount to check whether it will fit in the cap
        currentWithdrawalLevel += amount;

        uint256 withdrawalLimit = dataStore.getUint(Keys.bankTransferOutCapKey(token));
        isManualTransferEnabled = dataStore.getBool(Keys.bankManualTransferOutKey(token));
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

    function _afterTransferOut(address /* token */) internal virtual {}
}
