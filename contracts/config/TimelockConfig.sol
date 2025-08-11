// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {Keys} from "../data/Keys.sol";
import {Errors} from "../error/Errors.sol";
import {EventEmitter} from "../event/EventEmitter.sol";
import {EventUtils} from "../event/EventUtils.sol";
import {RoleModule} from "../role/RoleModule.sol";
import {RoleStore} from "../role/RoleStore.sol";
import {DataStore} from "../data/DataStore.sol";
import {BasicMulticall} from "../utils/BasicMulticall.sol";
import {Precision} from "../utils/Precision.sol";
import {ConfigTimelockController} from "./ConfigTimelockController.sol";
import {OracleModule} from "../oracle/OracleModule.sol";
import {OracleUtils} from "../oracle/OracleUtils.sol";
import {MarketUtils} from "../market/MarketUtils.sol";

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
    ConfigTimelockController public immutable timelockController;

    address public immutable dataStore;
    address public immutable oracleStore;

    constructor(
        EventEmitter _eventEmitter,
        address _dataStore,
        address _oracleStore,
        RoleStore _roleStore,
        ConfigTimelockController _timelockController
    ) RoleModule(_roleStore) {
        eventEmitter = _eventEmitter;
        dataStore = _dataStore;
        oracleStore = _oracleStore;
        timelockController = _timelockController;
    }

    // @dev signal granting of a role
    // @param account the account to grant the role
    // @param roleKey the role to grant
    function signalGrantRole(address account, bytes32 roleKey, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        bytes memory payload = abi.encodeWithSignature("grantRole(address,bytes32)", account, roleKey);
        timelockController.schedule(address(roleStore), 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "roleKey", roleKey);
        _signalPendingAction(
            "SignalGrantRole",
            eventData
        );
    }

    // @dev signal revoking of a role
    // @param account the account to revoke the role for
    // @param roleKey the role to revoke
    function signalRevokeRole(address account, bytes32 roleKey, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {

        bytes memory payload = abi.encodeWithSignature("revokeRole(address,bytes32)",
            account, roleKey);
        timelockController.schedule(address(roleStore), 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "roleKey", roleKey);
        _signalPendingAction(
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
        _signalPendingAction(
            "RevokeRole",
            eventData
        );
    }

    function signalSetOracleProviderEnabled(address provider, bool value, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        bytes memory payload = abi.encodeWithSignature("setBool(bytes32,bool)",
            Keys.isOracleProviderEnabledKey(provider), value);
        timelockController.schedule(dataStore, 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "provider", provider);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "value", value);
        _signalPendingAction(
            "SignalSetOracleProviderEnabled",
            eventData
        );
    }

    function signalSetOracleProviderForToken(address oracle, address token, address provider, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        bytes memory payload = abi.encodeWithSignature("setAddress(bytes32,address)",
            Keys.oracleProviderForTokenKey(oracle, token), provider);
        timelockController.schedule(dataStore, 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "oracle", oracle);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "provider", provider);
        _signalPendingAction(
            "SignalSetOracleProviderForToken",
            eventData
        );
    }

    function signalSetAtomicOracleProvider(address provider, bool value, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        bytes memory payload = abi.encodeWithSignature("setBool(bytes32,bool)",
            Keys.isAtomicOracleProviderKey(provider), value);
        timelockController.schedule(dataStore, 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "provider", provider);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "value", value);
        _signalPendingAction(
            "SignalSetAtomicOracleProvider",
            eventData
        );
    }

    function signalAddOracleSigner(address account, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        if (account == address(0)) {
            revert Errors.InvalidOracleSigner(account);
        }

        bytes memory payload = abi.encodeWithSignature("addSigner(address)", account);
        timelockController.schedule(oracleStore, 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        _signalPendingAction(
            "SignalAddOracleSigner",
            eventData
        );
    }

    function signalRemoveOracleSigner(address account, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        if (account == address(0)) {
            revert Errors.InvalidOracleSigner(account);
        }

        bytes memory payload = abi.encodeWithSignature("removeSigner(address)", account);
        timelockController.schedule(oracleStore, 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        _signalPendingAction(
            "SignalRemoveOracleSigner",
            eventData
        );
    }

    // @dev signal setting of the fee receiver
    // @param account the new fee receiver
    function signalSetFeeReceiver(address account, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        if (account == address(0)) {
            revert Errors.InvalidFeeReceiver(account);
        }

        bytes memory payload = abi.encodeWithSignature("setAddress(bytes32,address)",
            Keys.FEE_RECEIVER, account);
        timelockController.schedule(dataStore, 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        _signalPendingAction(
            "SignalSetFeeReceiver",
            eventData
        );
    }

    // @dev signal setting of the holding address
    // @param account of the new holding address
    function signalSetHoldingAddress(address account, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        if (account == address(0)) {
            revert Errors.InvalidHoldingAddress(account);
        }

        bytes memory payload = abi.encodeWithSignature("setAddress(bytes32,address)",
            Keys.HOLDING_ADDRESS, account);
        timelockController.schedule(dataStore, 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);
        _signalPendingAction(
            "SignalSetHoldingAddress",
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
        uint256 stablePrice,
        bytes32 predecessor,
        bytes32 salt
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
        timelockController.scheduleBatch(targets, values, payloads, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "priceFeed", priceFeed);
        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "priceFeedMultiplier", priceFeedMultiplier);
        eventData.uintItems.setItem(1, "priceFeedHeartbeatDuration", priceFeedHeartbeatDuration);
        eventData.uintItems.setItem(2, "stablePrice", stablePrice);
        _signalPendingAction(
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
        uint256 dataStreamSpreadReductionFactor,
        bytes32 predecessor,
        bytes32 salt
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
        timelockController.scheduleBatch(targets, values, payloads, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "token", token);
        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "feedId", feedId);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "dataStreamMultiplier", dataStreamMultiplier);
        eventData.uintItems.setItem(1, "dataStreamSpreadReductionFactor", dataStreamSpreadReductionFactor);
        _signalPendingAction(
            "SignalSetDataStream",
            eventData
        );
    }

    // @dev increase the timelock delay
    // @param the new timelock delay
    function increaseTimelockDelay(uint256 _timelockDelay, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        if (_timelockDelay <= timelockController.getMinDelay()) {
            revert Errors.InvalidTimelockDelay(_timelockDelay);
        }

        if (_timelockDelay > MAX_TIMELOCK_DELAY) {
            revert Errors.MaxTimelockDelayExceeded(_timelockDelay);
        }

        bytes memory payload = abi.encodeWithSignature("updateDelay(uint256)", _timelockDelay);
        timelockController.schedule(
            address(timelockController),
            0,
            payload,
            predecessor,
            salt,
            timelockController.getMinDelay()
        );

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "timelockDelay", _timelockDelay);
        _signalPendingAction(
            "IncreaseTimelockDelay",
            eventData
        );
    }

    function signalReduceLentAmount(
        address market,
        address fundingAccount,
        uint256 reductionAmount,
        bytes32 predecessor,
        bytes32 salt
    ) external onlyTimelockAdmin {
        if (market == address(0)) {
            revert Errors.EmptyMarket();
        }
        if (fundingAccount == address(0)) {
            revert Errors.EmptyFundingAccount();
        }
        if (reductionAmount == 0) {
            revert Errors.EmptyReduceLentAmount();
        }

        bytes memory payload = abi.encodeWithSignature(
            "reduceLentImpactAmount(address,address,uint256)",
            market, fundingAccount, reductionAmount);
        timelockController.schedule(address(timelockController), 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "fundingAccount", fundingAccount);
        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "reductionAmount", reductionAmount);
        _signalPendingAction(
            "SignalReduceLentImpactAmount",
            eventData
        );
    }

    // @dev Withdraw funds from position impact pool(negative price impacts) and send them to `receiver`
    // @param market Market from withdraw
    // @param receiver Account to send funds from pool
    // @param amount Amount of tokens to withdraw
    function signalWithdrawFromPositionImpactPool(
        address market,
        address receiver,
        uint256 amount,
        bytes32 predecessor,
        bytes32 salt
    ) external onlyTimelockAdmin {
        if (market == address(0)) {
            revert Errors.EmptyMarket();
        }
        if (receiver == address(0)) {
            revert Errors.EmptyReceiver();
        }
        if (amount == 0) {
            revert Errors.EmptyPositionImpactWithdrawalAmount();
        }

        bytes memory payload = abi.encodeWithSignature(
            "withdrawFromPositionImpactPool(address,address,uint256)",
            market, receiver, amount);
        timelockController.schedule(address(timelockController), 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "receiver", receiver);
        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);
        _signalPendingAction(
            "SignalWithdrawFromPositionImpactPool",
            eventData
        );
    }

    function signalWithdrawTokens(
        address target,
        address token,
        address receiver,
        uint256 amount,
        bytes32 predecessor,
        bytes32 salt
    ) external onlyTimelockAdmin {
        if (target == address(0)) {
            revert Errors.EmptyTarget();
        }
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }
        if (receiver == address(0)) {
            revert Errors.EmptyReceiver();
        }
        if (amount == 0) {
            revert Errors.EmptyWithdrawalAmount();
        }

        bytes memory payload = abi.encodeWithSignature(
            "withdrawTokens(address,address,uint256)",
            token,
            receiver,
            amount
        );
        timelockController.schedule(target, 0, payload, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "target", target);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(1, "receiver", receiver);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        _signalPendingAction("SignalWithdrawTokens", eventData);
    }

    function signalSetEdgeDataStream(
        address token,
        bytes32 edgeDataStreamId,
        uint256 edgeDataStreamTokenDecimals,
        bytes32 predecessor,
        bytes32 salt
    ) external onlyTimelockAdmin {
        if (edgeDataStreamId == bytes32(0)) {
            revert Errors.EmptyDataStreamFeedId(token);
        }

        address[] memory targets = new address[](2);
        targets[0] = dataStore;
        targets[1] = dataStore;

        bytes[] memory payloads = new bytes[](2);
        payloads[0] = abi.encodeWithSignature("setBytes32(bytes32,bytes32)",
            Keys.edgeDataStreamIdKey(token), edgeDataStreamId);
        payloads[1] = abi.encodeWithSignature("setUint(bytes32,uint256)",
            Keys.edgeDataStreamTokenDecimalsKey(token), edgeDataStreamTokenDecimals);

        uint256[] memory values = new uint256[](2);
        timelockController.scheduleBatch(targets, values, payloads, predecessor, salt, timelockController.getMinDelay());

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "token", token);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "edgeDataStreamId", edgeDataStreamId);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "edgeDataStreamTokenDecimals", edgeDataStreamTokenDecimals);

        _signalPendingAction("SignalSetEdgeDataStream", eventData);
    }

    function execute(address target, bytes calldata payload, bytes32 predecessor, bytes32 salt) external onlyTimelockAdmin {
        timelockController.execute(target, 0, payload, predecessor, salt);
    }

    function executeWithOraclePrice(
        address target,
        bytes calldata payload,
        bytes32 predecessor,
        bytes32 salt,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external onlyTimelockAdmin {
        timelockController.executeWithOraclePrices(
            target, 0, payload, predecessor, salt, oracleParams
        );
    }

    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt
    ) external onlyTimelockAdmin {
        timelockController.executeBatch(targets, values, payloads, predecessor, salt);
    }

    function getHash(address target, bytes calldata payload, bytes32 predecessor, bytes32 salt) external view returns (bytes32) {
        return timelockController.hashOperation(target, 0, payload, predecessor, salt);
    }

    function getHashBatch(
        address[] calldata targets,
        bytes[] calldata payloads,
        uint256[] calldata values,
        bytes32 predecessor,
        bytes32 salt
    ) external view returns (bytes32) {
        return timelockController.hashOperationBatch(targets, values, payloads, predecessor, salt);
    }

    function cancelAction(bytes32 id) external onlyTimelockAdmin {
        timelockController.cancel(id);
    }

    function _signalPendingAction(string memory actionLabel, EventUtils.EventLogData memory eventData) internal {
        EventUtils.EventLogData memory actionData;

        bytes32 actionKey = keccak256(abi.encode(actionLabel));

        actionData.bytes32Items.initItems(1);
        actionData.bytes32Items.setItem(0, "actionKey", actionKey);

        actionData.stringItems.initItems(1);
        actionData.stringItems.setItem(0, "actionLabel", actionLabel);

        eventEmitter.emitEventLog1(
            "SignalPendingAction",
            actionKey,
            actionData
        );

        eventEmitter.emitEventLog(
            actionLabel,
            eventData
        );
    }
}
