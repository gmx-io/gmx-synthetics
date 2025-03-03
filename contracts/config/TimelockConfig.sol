// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {Keys} from "../data/Keys.sol";
import {Errors} from "../error/Errors.sol";
import {EventEmitter} from "../event/EventEmitter.sol";
import {EventUtils} from "../event/EventUtils.sol";
import {RoleModule} from "../role/RoleModule.sol";
import {RoleStore} from "../role/RoleStore.sol";
import {BasicMulticall} from "../utils/BasicMulticall.sol";
import {Precision} from "../utils/Precision.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract TimelockConfig is RoleModule, BasicMulticall {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    uint256 public constant MAX_TIMELOCK_DELAY = 5 days;

    EventEmitter public immutable eventEmitter;
    TimelockController public immutable timelockController;

    address public immutable dataStore;
    address public immutable oracleStore;

    constructor(
        EventEmitter _eventEmitter,
        address _dataStore,
        address _oracleStore,
        RoleStore _roleStore,
        TimelockController _timelockController
    ) RoleModule(_roleStore) {
        eventEmitter = _eventEmitter;
        dataStore = _dataStore;
        oracleStore = _oracleStore;
        timelockController = _timelockController;
    }

    // @dev signal granting of a role
    // @param account the account to grant the role
    // @param roleKey the role to grant
    function signalGrantRole(address account, bytes32 roleKey) external onlyTimelockAdmin {
        bytes memory payload = abi.encodeWithSignature("grantRole(address,bytes32)", account, roleKey);
        timelockController.schedule(address(roleStore), 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "roleKey", roleKey);
        eventEmitter.emitEventLog(
            "SignalGrantRole",
            eventData
        );
    }

    // @dev signal revoking of a role
    // @param account the account to revoke the role for
    // @param roleKey the role to revoke
    function signalRevokeRole(address account, bytes32 roleKey) external onlyTimelockAdmin {

        bytes memory payload = abi.encodeWithSignature("revokeRole(address,bytes32)",
            account, roleKey);
        timelockController.schedule(address(roleStore), 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "roleKey", roleKey);
        eventEmitter.emitEventLog(
            "SignalRevokeRole",
            eventData
        );
    }

    // @dev immediately revoke the role of an account
    // @param account the account to revoke the role for
    // @param roleKey the role to revoke
    function revokeRole(address account, bytes32 roleKey) external onlyTimelockMultisig {
        roleStore.revokeRole(account, roleKey);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "roleKey", roleKey);
        eventEmitter.emitEventLog(
            "RevokeRole",
            eventData
        );
    }

    function signalSetOracleProviderEnabled(address provider, bool value) external onlyTimelockAdmin {
        bytes memory payload = abi.encodeWithSignature("setBool(bytes32,bool)",
            Keys.isOracleProviderEnabledKey(provider), value);
        timelockController.schedule(dataStore, 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "provider", provider);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "value", value);
        eventEmitter.emitEventLog(
            "SignalSetOracleProviderEnabled",
            eventData
        );
    }

    function signalSetOracleProviderForToken(address token, address provider) external onlyTimelockAdmin {
        bytes memory payload = abi.encodeWithSignature("setAddress(bytes32,address)",
            Keys.oracleProviderForTokenKey(token), provider);
        timelockController.schedule(dataStore, 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "provider", provider);
        eventEmitter.emitEventLog(
            "SignalSetOracleProviderForToken",
            eventData
        );
    }

    function signalSetAtomicOracleProvider(address provider, bool value) external onlyTimelockAdmin {
        bytes memory payload = abi.encodeWithSignature("setBool(bytes32,bool)",
            Keys.isAtomicOracleProviderKey(provider), value);
        timelockController.schedule(dataStore, 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "provider", provider);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "value", value);
        eventEmitter.emitEventLog(
            "SignalSetAtomicOracleProvider",
            eventData
        );
    }

    function signalAddOracleSigner(address account) external onlyTimelockAdmin {
        if (account == address(0)) {
            revert Errors.InvalidOracleSigner(account);
        }

        bytes memory payload = abi.encodeWithSignature("addSigner(address)", account);
        timelockController.schedule(oracleStore, 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        eventEmitter.emitEventLog(
            "SignalAddOracleSigner",
            eventData
        );
    }

    function signalRemoveOracleSigner(address account) external onlyTimelockAdmin {
        if (account == address(0)) {
            revert Errors.InvalidOracleSigner(account);
        }

        bytes memory payload = abi.encodeWithSignature("removeSigner(address)", account);
        timelockController.schedule(oracleStore, 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        eventEmitter.emitEventLog(
            "SignalRemoveOracleSigner",
            eventData
        );
    }

    // @dev signal setting of the fee receiver
    // @param account the new fee receiver
    function signalSetFeeReceiver(address account) external onlyTimelockAdmin {
        if (account == address(0)) {
            revert Errors.InvalidFeeReceiver(account);
        }

        bytes memory payload = abi.encodeWithSignature("setAddress(bytes32,address)",
            Keys.FEE_RECEIVER, account);
        timelockController.schedule(dataStore, 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        eventEmitter.emitEventLog(
            "SignalSetFeeReceiver",
            eventData
        );
    }

    // @dev signal setting of a price feed
    // @param token the token to set the price feed for
    // @param priceFeed the address of the price feed
    // @param priceFeedMultiplier the multiplier to apply to the price feed results
    // @param stablePrice the stable price to set a range for the price feed results
    function signalSetPriceFeed(
        address token,
        address priceFeed,
        uint256 priceFeedMultiplier,
        uint256 priceFeedHeartbeatDuration,
        uint256 stablePrice
    ) external onlyTimelockAdmin {

        address[] memory targets = new address[](4);
        targets[0] = dataStore;
        targets[1] = dataStore;
        targets[2] = dataStore;
        targets[3] = dataStore;

        bytes[] memory payloads = new bytes[](4);
        payloads[0] = abi.encodeWithSignature("setAddress(bytes32,address)",
            Keys.priceFeedKey(token), priceFeed);
        payloads[1] = abi.encodeWithSignature("setUint(bytes32,uint256)",
            Keys.priceFeedMultiplierKey(token), priceFeedMultiplier);
        payloads[2] = abi.encodeWithSignature("setUint(bytes32,uint256)",
            Keys.priceFeedHeartbeatDurationKey(token), priceFeedHeartbeatDuration);
        payloads[3] = abi.encodeWithSignature("setUint(bytes32,uint256)",
            Keys.stablePriceKey(token), stablePrice);

        uint256[] memory values = new uint256[](4);
        timelockController.scheduleBatch(targets, values, payloads, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "priceFeed", priceFeed);
        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "priceFeedMultiplier", priceFeedMultiplier);
        eventData.uintItems.setItem(1, "priceFeedHeartbeatDuration", priceFeedHeartbeatDuration);
        eventData.uintItems.setItem(2, "stablePrice", stablePrice);
        eventEmitter.emitEventLog(
            "SignalSetPriceFeed",
            eventData
        );
    }

    // @dev signal setting of a data stream feed
    // @param token the token to set the data stream feed for
    // @param feedId the ID of the data stream feed
    // @param dataStreamMultiplier the multiplier to apply to the data stream feed results
    // @param dataStreamSpreadReductionFactor the factor to apply to the data stream price spread
    function signalSetDataStream(
        address token,
        bytes32 feedId,
        uint256 dataStreamMultiplier,
        uint256 dataStreamSpreadReductionFactor
    ) external onlyTimelockAdmin {
        if (dataStreamSpreadReductionFactor > Precision.FLOAT_PRECISION) {
            revert Errors.ConfigValueExceedsAllowedRange(Keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR, dataStreamSpreadReductionFactor);
        }

        address[] memory targets = new address[](3);
        targets[0] = dataStore;
        targets[1] = dataStore;
        targets[2] = dataStore;

        bytes[] memory payloads = new bytes[](3);
        payloads[0] = abi.encodeWithSignature("setBytes32(bytes32,bytes32)",
            Keys.dataStreamIdKey(token), feedId);
        payloads[1] = abi.encodeWithSignature("setUint(bytes32,uint256)",
            Keys.dataStreamMultiplierKey(token), dataStreamMultiplier);
        payloads[2] = abi.encodeWithSignature("setUint(bytes32,uint256)",
            Keys.dataStreamSpreadReductionFactorKey(token), dataStreamSpreadReductionFactor);

        uint256[] memory values = new uint256[](3);
        timelockController.scheduleBatch(targets, values, payloads, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "token", token);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "feedId", feedId);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "dataStreamMultiplier", dataStreamMultiplier);
        eventData.uintItems.setItem(1, "dataStreamSpreadReductionFactor", dataStreamSpreadReductionFactor);
        eventEmitter.emitEventLog(
            "SignalSetDataStream",
            eventData
        );
    }

    // @dev increase the timelock delay
    // @param the new timelock delay
    function increaseTimelockDelay(uint256 _timelockDelay) external onlyTimelockAdmin {
        if (_timelockDelay <= timelockController.getMinDelay()) {
            revert Errors.InvalidTimelockDelay(_timelockDelay);
        }

        if (_timelockDelay > MAX_TIMELOCK_DELAY) {
            revert Errors.MaxTimelockDelayExceeded(_timelockDelay);
        }

        bytes memory payload = abi.encodeWithSignature("updateDelay(uint256)", _timelockDelay);
        timelockController.schedule(address(timelockController), 0, payload, 0, 0, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "timelockDelay", _timelockDelay);
        eventEmitter.emitEventLog(
            "IncreaseTimelockDelay",
            eventData
        );
    }

    function execute(address target, bytes calldata payload) external onlyTimelockAdmin {
        timelockController.execute(target, 0, payload, 0, 0);
    }

    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads) external onlyTimelockAdmin {
        timelockController.executeBatch(targets, values, payloads, 0, 0);
    }

    function getHash(address target, bytes calldata payload) external view returns (bytes32) {
        return timelockController.hashOperation(target, 0, payload, 0, 0);
    }

    function getHashBatch(address[] calldata targets, bytes[] calldata payloads, uint256[] calldata values) external view returns (bytes32) {
        return timelockController.hashOperationBatch(targets, values, payloads, 0, 0);
    }

    function cancelAction(bytes32 id) external onlyTimelockAdmin {
        timelockController.cancel(id);
    }
}
