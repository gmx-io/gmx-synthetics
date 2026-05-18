// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../data/Keys2.sol";
import "../data/Keys3.sol";
import "../role/Role2.sol";
import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../utils/BasicMulticall.sol";
import "../utils/Precision.sol";
import "../utils/Cast.sol";
import "../market/MarketUtils.sol";

import "./ConfigUtils.sol";

// @title RiskOracleConfig
// @dev limited capability config only for risk-oracle keys
contract RiskOracleConfig is ReentrancyGuard, RoleModule, BasicMulticall {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    // @dev the risk-oracle base keys that can be set
    mapping (bytes32 => bool) public allowedRiskOracleBaseKeys;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;

        _initAllowedRiskOracleBaseKeys();
    }

    modifier onlyRiskOracle() {
        if (!roleStore.hasRole(msg.sender, Role2.RISK_ORACLE)) {
            revert Errors.Unauthorized(msg.sender, "RISK_ORACLE");
        }

        _;
    }

    function setRiskOracleMarketEnabled(address market, bool enabled) external onlyConfigKeeper nonReentrant {
        if (market == address(0)) {
            revert Errors.EmptyMarket();
        }

        dataStore.setBool(Keys3.riskOracleMarketEnabledKey(market), enabled);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "market", market);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "enabled", enabled);
        eventEmitter.emitEventLog(
            "SetRiskOracleMarketEnabled",
            eventData
        );
    }

    // @dev set a bool value
    // @param baseKey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the bool value
    function setBool(bytes32 baseKey, bytes memory data, bool value) external onlyRiskOracle nonReentrant {
        _validateKey(baseKey, data);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        dataStore.setBool(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "SetBool",
            baseKey,
            eventData
        );
    }

    // @dev set an address value
    // @param baseKey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the address value
    function setAddress(bytes32 baseKey, bytes memory data, address value) external onlyRiskOracle nonReentrant {
        _validateKey(baseKey, data);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        dataStore.setAddress(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "SetAddress",
            baseKey,
            eventData
        );
    }

    // @dev set a bytes32 value
    // @param baseKey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the bytes32 value
    function setBytes32(bytes32 baseKey, bytes memory data, bytes32 value) external onlyRiskOracle nonReentrant {
        _validateKey(baseKey, data);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        dataStore.setBytes32(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(2);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);
        eventData.bytes32Items.setItem(1, "value", value);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventEmitter.emitEventLog1(
            "SetBytes32",
            baseKey,
            eventData
        );
    }

    // @dev set a uint256 value
    // @param basekey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the uint256 value
    function setUint(bytes32 baseKey, bytes memory data, uint256 value) external onlyRiskOracle nonReentrant {
        _validateKey(baseKey, data);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        ConfigUtils.validateRange(
            dataStore,
            baseKey,
            data,
            value
        );

        dataStore.setUint(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "SetUint",
            baseKey,
            eventData
        );
    }

    // @dev set an int256 value
    // @param basekey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the int256 value
    function setInt(bytes32 baseKey, bytes memory data, int256 value) external onlyRiskOracle nonReentrant {
        _validateKey(baseKey, data);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        dataStore.setInt(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "SetInt",
            baseKey,
            eventData
        );
    }

    // @dev Note that when adding new key here it should be also added to the
    // _getRiskOracleMarket function.
    function _initAllowedRiskOracleBaseKeys() internal {
        allowedRiskOracleBaseKeys[Keys.POSITION_IMPACT_FACTOR] = true;
        allowedRiskOracleBaseKeys[Keys.POSITION_IMPACT_EXPONENT_FACTOR] = true;
        allowedRiskOracleBaseKeys[Keys.MAX_POSITION_IMPACT_FACTOR] = true;

        allowedRiskOracleBaseKeys[Keys.MAX_POOL_AMOUNT] = true;
        allowedRiskOracleBaseKeys[Keys.MAX_POOL_USD_FOR_DEPOSIT] = true;
        allowedRiskOracleBaseKeys[Keys.MAX_OPEN_INTEREST] = true;

        allowedRiskOracleBaseKeys[Keys.GLV_MAX_MARKET_TOKEN_BALANCE_USD] = true;
        allowedRiskOracleBaseKeys[Keys.GLV_MAX_MARKET_TOKEN_BALANCE_AMOUNT] = true;

        allowedRiskOracleBaseKeys[Keys.FUNDING_FACTOR] = true;
        allowedRiskOracleBaseKeys[Keys.FUNDING_EXPONENT_FACTOR] = true;
        allowedRiskOracleBaseKeys[Keys.FUNDING_INCREASE_FACTOR_PER_SECOND] = true;
        allowedRiskOracleBaseKeys[Keys.FUNDING_DECREASE_FACTOR_PER_SECOND] = true;
        allowedRiskOracleBaseKeys[Keys.MIN_FUNDING_FACTOR_PER_SECOND] = true;
        allowedRiskOracleBaseKeys[Keys.MAX_FUNDING_FACTOR_PER_SECOND] = true;
        allowedRiskOracleBaseKeys[Keys.THRESHOLD_FOR_STABLE_FUNDING] = true;
        allowedRiskOracleBaseKeys[Keys.THRESHOLD_FOR_DECREASE_FUNDING] = true;

        allowedRiskOracleBaseKeys[Keys.MIN_COLLATERAL_FACTOR] = true;
        allowedRiskOracleBaseKeys[Keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER] = true;
        allowedRiskOracleBaseKeys[Keys.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION] = true;

        allowedRiskOracleBaseKeys[Keys.OPTIMAL_USAGE_FACTOR] = true;
        allowedRiskOracleBaseKeys[Keys.BASE_BORROWING_FACTOR] = true;
        allowedRiskOracleBaseKeys[Keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR] = true;
    }

    // @dev validate that the baseKey is allowed to be used
    // @param baseKey the base key to validate
    function _validateKey(bytes32 baseKey, bytes memory data) internal view {
        if (roleStore.hasRole(msg.sender, Role2.RISK_ORACLE)) {
            if (!allowedRiskOracleBaseKeys[baseKey]) {
                revert Errors.InvalidBaseKey(baseKey);
            }

            address market = _getRiskOracleMarket(baseKey, data);
            if (!dataStore.getBool(Keys3.riskOracleMarketEnabledKey(market))) {
                revert Errors.Unauthorized(msg.sender, "RISK_ORACLE_MARKET_DISABLED");
            }

            return;
        }

        revert Errors.InvalidBaseKey(baseKey);
    }


    function _getRiskOracleMarket(bytes32 baseKey, bytes memory data) internal pure returns (address market) {
        if (_isRiskOracleGlvMarketBaseKey(baseKey)) {
            (, market) = abi.decode(data, (address, address));
            return market;
        }

        if (_isRiskOracleTwoParamMarketBaseKey(baseKey)) {
            (market, ) = abi.decode(data, (address, bytes32));
            return market;
        }

        return abi.decode(data, (address));
    }

    function _isRiskOracleGlvMarketBaseKey(bytes32 baseKey) internal pure returns (bool) {
        return
            baseKey == Keys.GLV_MAX_MARKET_TOKEN_BALANCE_USD ||
            baseKey == Keys.GLV_MAX_MARKET_TOKEN_BALANCE_AMOUNT;
    }

    function _isRiskOracleTwoParamMarketBaseKey(bytes32 baseKey) internal pure returns (bool) {
        return
            baseKey == Keys.POSITION_IMPACT_FACTOR ||
            baseKey == Keys.POSITION_IMPACT_EXPONENT_FACTOR ||
            baseKey == Keys.MAX_POSITION_IMPACT_FACTOR ||
            baseKey == Keys.MAX_POOL_AMOUNT ||
            baseKey == Keys.MAX_POOL_USD_FOR_DEPOSIT ||
            baseKey == Keys.MAX_OPEN_INTEREST ||
            baseKey == Keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER ||
            baseKey == Keys.OPTIMAL_USAGE_FACTOR ||
            baseKey == Keys.BASE_BORROWING_FACTOR ||
            baseKey == Keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR;
    }
}
