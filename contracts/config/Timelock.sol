// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";

// @title Timelock
contract Timelock is ReentrancyGuard, RoleModule {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    uint256 public constant MAX_TIMELOCK_DELAY = 5 days;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    uint256 public timelockDelay;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        uint256 _timelockDelay
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        timelockDelay = _timelockDelay;
    }

    mapping (bytes32 => uint256) public pendingActions;

    function revokeRole(address account, bytes32 key) external onlyTimelockMultisig nonReentrant {
        roleStore.revokeRole(account, key);
    }

    function increaseTimelockDelay(uint256 _timelockDelay) external onlyTimelockAdmin nonReentrant {
        require(_timelockDelay > timelockDelay, "_timelockDelay must be increased");
        require(_timelockDelay <= MAX_TIMELOCK_DELAY, "_timelockDelay exceeds max allowed value");

        timelockDelay = _timelockDelay;
    }

    function signalGrantRole(address account, bytes32 key) external onlyTimelockAdmin nonReentrant {
        bytes32 actionKey = keccak256(abi.encodePacked("grantRole", account, key));
        _signalPendingAction(actionKey, "signalGrantRole");

        EventUtils.EventLogData memory data;
        data.addressItems.initItems(1);
        data.addressItems.setItem(0, "account", account);
        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);
        eventEmitter.emitEventLog1(
            "SignalGrantRole",
            actionKey,
            data
        );
    }

    function grantRoleAfterSignal(address account, bytes32 key) external onlyTimelockAdmin nonReentrant {
        bytes32 actionKey = keccak256(abi.encodePacked("grantRole", account, key));
        _validateAndClearAction(actionKey, "grantRoleAfterSignal");

        roleStore.grantRole(account, key);

        EventUtils.EventLogData memory data;
        data.addressItems.initItems(1);
        data.addressItems.setItem(0, "account", account);
        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);
        eventEmitter.emitEventLog1(
            "GrantRole",
            actionKey,
            data
        );
    }

    function signalRevokeRole(address account, bytes32 key) external onlyTimelockAdmin nonReentrant {
        bytes32 actionKey = keccak256(abi.encodePacked("revokeRole", account, key));
        _signalPendingAction(actionKey, "signalRevokeRole");

        EventUtils.EventLogData memory data;
        data.addressItems.initItems(1);
        data.addressItems.setItem(0, "account", account);
        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);
        eventEmitter.emitEventLog1(
            "SignalRevokeRole",
            actionKey,
            data
        );
    }

    function revokeRoleAfterSignal(address account, bytes32 key) external onlyTimelockAdmin nonReentrant {
        bytes32 actionKey = keccak256(abi.encodePacked("revokeRole", account, key));
        _validateAndClearAction(actionKey, "revokeRoleAfterSignal");

        roleStore.revokeRole(account, key);

        EventUtils.EventLogData memory data;
        data.addressItems.initItems(1);
        data.addressItems.setItem(0, "account", account);
        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "key", key);
        eventEmitter.emitEventLog1(
            "RevokeRole",
            actionKey,
            data
        );
    }

    function signalSetPriceFeed(
        address token,
        address priceFeed,
        uint256 priceFeedMultiplier,
        uint256 stablePrice
    ) external onlyTimelockAdmin nonReentrant {
        bytes32 actionKey = keccak256(abi.encodePacked(
            "signalSetPriceFeed",
            token,
            priceFeed,
            priceFeedMultiplier,
            stablePrice
        ));

        _signalPendingAction(actionKey, "signalSetPriceFeed");

        EventUtils.EventLogData memory data;
        data.addressItems.initItems(2);
        data.addressItems.setItem(0, "token", token);
        data.addressItems.setItem(1, "priceFeed", priceFeed);
        data.uintItems.initItems(2);
        data.uintItems.setItem(0, "priceFeedMultiplier", priceFeedMultiplier);
        data.uintItems.setItem(1, "stablePrice", stablePrice);
        eventEmitter.emitEventLog1(
            "SignalSetPriceFeed",
            actionKey,
            data
        );
    }

    function setPriceFeedAfterSignal(
        address token,
        address priceFeed,
        uint256 priceFeedMultiplier,
        uint256 stablePrice
    ) external onlyTimelockAdmin nonReentrant {
        bytes32 actionKey = keccak256(abi.encodePacked(
            "signalSetPriceFeed",
            token,
            priceFeed,
            priceFeedMultiplier,
            stablePrice
        ));

        _validateAndClearAction(actionKey, "signalSetPriceFeed");

        dataStore.setAddress(Keys.priceFeedKey(token), priceFeed);
        dataStore.setUint(Keys.priceFeedMultiplierKey(token), priceFeedMultiplier);
        dataStore.setUint(Keys.stablePriceKey(token), stablePrice);

        EventUtils.EventLogData memory data;
        data.addressItems.initItems(2);
        data.addressItems.setItem(0, "token", token);
        data.addressItems.setItem(1, "priceFeed", priceFeed);
        data.uintItems.initItems(2);
        data.uintItems.setItem(0, "priceFeedMultiplier", priceFeedMultiplier);
        data.uintItems.setItem(1, "stablePrice", stablePrice);
        eventEmitter.emitEventLog1(
            "SetPriceFeed",
            actionKey,
            data
        );
    }

    function cancelAction(bytes32 actionKey) external onlyTimelockAdmin nonReentrant {
        _clearAction(actionKey, "cancelAction");
    }

    function _signalPendingAction(bytes32 actionKey, string memory actionLabel) internal {
        require(pendingActions[actionKey] == 0, "Timelock: action already signalled");
        pendingActions[actionKey] = block.timestamp + timelockDelay;

        EventUtils.EventLogData memory data;

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "actionKey", actionKey);

        data.stringItems.initItems(1);
        data.stringItems.setItem(0, "actionLabel", actionLabel);

        eventEmitter.emitEventLog1(
            "SignalPendingAction",
            actionKey,
            data
        );
    }

    function _validateAndClearAction(bytes32 actionKey, string memory actionLabel) internal {
        _validateAction(actionKey);
        _clearAction(actionKey, actionLabel);
    }

    function _validateAction(bytes32 actionKey) internal view {
        require(pendingActions[actionKey] != 0, "Timelock: action not signalled");
        require(pendingActions[actionKey] < block.timestamp, "Timelock: action time not yet passed");
    }

    function _clearAction(bytes32 actionKey, string memory actionLabel) internal {
        require(pendingActions[actionKey] != 0, "Timelock: invalid actionKey");
        delete pendingActions[actionKey];

        EventUtils.EventLogData memory data;

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "actionKey", actionKey);

        data.stringItems.initItems(1);
        data.stringItems.setItem(0, "actionLabel", actionLabel);

        eventEmitter.emitEventLog1(
            "ClearPendingAction",
            actionKey,
            data
        );
    }
}
