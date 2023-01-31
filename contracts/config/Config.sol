// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../utils/BasicMulticall.sol";

// @title Config
contract Config is ReentrancyGuard, RoleModule, BasicMulticall {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    uint256 public constant MAX_FEE_FACTOR = 5 * Precision.FLOAT_PRECISION / 100; // 5%

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    mapping (bytes32 => bool) public allowedKeys;

    error InvalidKey(bytes32 key);
    error InvalidFeeFactor(bytes32 key, uint256 value);
    error InvalidFactor(bytes32 key, uint256 value);

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;

        _initAllowedKeys();
    }

    function setBool(bytes32 key, bytes memory data, bool value) external onlyConfigKeeper nonReentrant {
        _validateKey(key);

        bytes32 fullKey = keccak256(bytes.concat(key, data));

        dataStore.setBool(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "SetBool",
            key,
            eventData
        );
    }

    function setAddress(bytes32 key, bytes memory data, address value) external onlyConfigKeeper nonReentrant {
        _validateKey(key);

        bytes32 fullKey = keccak256(bytes.concat(key, data));

        dataStore.setAddress(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "SetAddress",
            key,
            eventData
        );
    }

    function setBytes32(bytes32 key, bytes memory data, bytes32 value) external onlyConfigKeeper nonReentrant {
        _validateKey(key);

        bytes32 fullKey = keccak256(bytes.concat(key, data));

        dataStore.setBytes32(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(2);
        eventData.bytes32Items.setItem(0, "key", key);
        eventData.bytes32Items.setItem(1, "value", value);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventEmitter.emitEventLog1(
            "SetBytes32",
            key,
            eventData
        );
    }

    function setUint(bytes32 key, bytes memory data, uint256 value) external onlyConfigKeeper nonReentrant {
        _validateKey(key);

        bytes32 fullKey = keccak256(bytes.concat(key, data));

        _validateRange(key, value);

        dataStore.setUint(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "SetUint",
            key,
            eventData
        );
    }

    function setInt(bytes32 key, bytes memory data, int256 value) external onlyConfigKeeper nonReentrant {
        _validateKey(key);

        bytes32 fullKey = keccak256(bytes.concat(key, data));

        dataStore.setInt(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "SetInt",
            key,
            eventData
        );
    }

    function _initAllowedKeys() internal {
        allowedKeys[Keys.IS_MARKET_DISABLED] = true;

        allowedKeys[Keys.CREATE_DEPOSIT_FEATURE_DISABLED] = true;
        allowedKeys[Keys.CANCEL_DEPOSIT_FEATURE_DISABLED] = true;
        allowedKeys[Keys.EXECUTE_DEPOSIT_FEATURE_DISABLED] = true;

        allowedKeys[Keys.CREATE_WITHDRAWAL_FEATURE_DISABLED] = true;
        allowedKeys[Keys.CANCEL_WITHDRAWAL_FEATURE_DISABLED] = true;
        allowedKeys[Keys.EXECUTE_WITHDRAWAL_FEATURE_DISABLED] = true;

        allowedKeys[Keys.CREATE_ORDER_FEATURE_DISABLED] = true;
        allowedKeys[Keys.EXECUTE_ORDER_FEATURE_DISABLED] = true;
        allowedKeys[Keys.EXECUTE_ADL_FEATURE_DISABLED] = true;
        allowedKeys[Keys.UPDATE_ORDER_FEATURE_DISABLED] = true;
        allowedKeys[Keys.CANCEL_ORDER_FEATURE_DISABLED] = true;

        allowedKeys[Keys.MIN_ORACLE_BLOCK_CONFIRMATIONS] = true;
        allowedKeys[Keys.MAX_ORACLE_PRICE_AGE] = true;
        allowedKeys[Keys.POSITION_FEE_RECEIVER_FACTOR] = true;
        allowedKeys[Keys.SWAP_FEE_RECEIVER_FACTOR] = true;
        allowedKeys[Keys.BORROWING_FEE_RECEIVER_FACTOR] = true;

        allowedKeys[Keys.ESTIMATED_GAS_FEE_BASE_AMOUNT] = true;
        allowedKeys[Keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR] = true;

        allowedKeys[Keys.EXECUTION_GAS_FEE_BASE_AMOUNT] = true;
        allowedKeys[Keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR] = true;

        allowedKeys[Keys.DEPOSIT_GAS_LIMIT] = true;
        allowedKeys[Keys.WITHDRAWAL_GAS_LIMIT] = true;
        allowedKeys[Keys.SINGLE_SWAP_GAS_LIMIT] = true;
        allowedKeys[Keys.INCREASE_ORDER_GAS_LIMIT] = true;
        allowedKeys[Keys.DECREASE_ORDER_GAS_LIMIT] = true;
        allowedKeys[Keys.SWAP_ORDER_GAS_LIMIT] = true;
        allowedKeys[Keys.TOKEN_TRANSFER_GAS_LIMIT] = true;
        allowedKeys[Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT] = true;

        allowedKeys[Keys.REQUEST_EXPIRATION_BLOCK_AGE] = true;
        allowedKeys[Keys.MIN_COLLATERAL_FACTOR] = true;
        allowedKeys[Keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER] = true;
        allowedKeys[Keys.MIN_COLLATERAL_USD] = true;

        allowedKeys[Keys.VIRTUAL_TOKEN_ID] = true;
        allowedKeys[Keys.VIRTUAL_MARKET_ID] = true;
        allowedKeys[Keys.VIRTUAL_INVENTORY_FOR_SWAPS] = true;
        allowedKeys[Keys.VIRTUAL_INVENTORY_FOR_POSITIONS] = true;
        allowedKeys[Keys.THRESHOLD_POSITION_IMPACT_FACTOR_FOR_VIRTUAL_INVENTORY] = true;
        allowedKeys[Keys.THRESHOLD_SWAP_IMPACT_FACTOR_FOR_VIRTUAL_INVENTORY] = true;

        allowedKeys[Keys.POSITION_IMPACT_FACTOR] = true;
        allowedKeys[Keys.POSITION_IMPACT_EXPONENT_FACTOR] = true;
        allowedKeys[Keys.MAX_POSITION_IMPACT_FACTOR] = true;
        allowedKeys[Keys.POSITION_FEE_FACTOR] = true;

        allowedKeys[Keys.SWAP_IMPACT_FACTOR] = true;
        allowedKeys[Keys.SWAP_IMPACT_EXPONENT_FACTOR] = true;
        allowedKeys[Keys.SWAP_FEE_FACTOR] = true;

        allowedKeys[Keys.ORACLE_TYPE] = true;

        allowedKeys[Keys.RESERVE_FACTOR] = true;
        allowedKeys[Keys.MAX_PNL_FACTOR] = true;
        allowedKeys[Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS] = true;
        allowedKeys[Keys.FUNDING_FACTOR] = true;
        allowedKeys[Keys.BORROWING_FACTOR] = true;
    }

    function _validateKey(bytes32 key) internal view {
        if (!allowedKeys[key]) {
            revert InvalidKey(key);
        }
    }

    function _validateRange(bytes32 key, uint256 value) internal pure {
        if (
            key == Keys.SWAP_FEE_FACTOR ||
            key == Keys.POSITION_FEE_FACTOR
        ) {
            revert InvalidFeeFactor(key, value);
        }

        if (
            key == Keys.POSITION_FEE_RECEIVER_FACTOR ||
            key == Keys.SWAP_FEE_RECEIVER_FACTOR ||
            key == Keys.BORROWING_FEE_RECEIVER_FACTOR ||
            key == Keys.MIN_COLLATERAL_FACTOR ||
            key == Keys.RESERVE_FACTOR ||
            key == Keys.MAX_PNL_FACTOR ||
            key == Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS ||
            key == Keys.FUNDING_FACTOR ||
            key == Keys.BORROWING_FACTOR
        ) {
            revert InvalidFactor(key, value);
        }
    }
}
