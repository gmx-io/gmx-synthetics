// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {Chain} from "../chain/Chain.sol";
import {DataStore} from "../data/DataStore.sol";
import {Keys} from "../data/Keys.sol";
import {Errors} from "../error/Errors.sol";
import {EventEmitter} from "../event/EventEmitter.sol";
import {EventUtils} from "../event/EventUtils.sol";
import {Market} from "../market/Market.sol";
import {MarketStoreUtils} from "../market/MarketStoreUtils.sol";
import {MarketUtils} from "../market/MarketUtils.sol";
import {IOracle} from "../oracle/IOracle.sol";
import {OracleModule} from "../oracle/OracleModule.sol";
import {OracleUtils} from "../oracle/OracleUtils.sol";
import {Price} from "../price/Price.sol";
import {Role} from "../role/Role.sol";
import {RoleModule} from "../role/RoleModule.sol";
import {RoleStore} from "../role/RoleStore.sol";
import {BasicMulticall} from "../utils/BasicMulticall.sol";
import {ConfigKeys} from "./ConfigKeys.sol";
import {ConfigUtils} from "./ConfigUtils.sol";
import {FundingConfigUtils} from "./FundingConfigUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// @title Config
contract Config is ReentrancyGuard, RoleModule, BasicMulticall, OracleModule {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    address public immutable staticOracleProvider;

    // @dev the base keys that can be set
    mapping(bytes32 => bool) public allowedBaseKeys;
    // @dev the limited base keys that can be set
    mapping(bytes32 => bool) public allowedLimitedBaseKeys;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOracle _oracle,
        address _staticOracleProvider
    ) RoleModule(_roleStore) OracleModule(_oracle) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        staticOracleProvider = _staticOracleProvider;

        _initAllowedBaseKeys();
        _initAllowedLimitedBaseKeys();
    }

    modifier onlyKeeper() {
        if (
            !roleStore.hasRole(msg.sender, Role.LIMITED_CONFIG_KEEPER) &&
        !roleStore.hasRole(msg.sender, Role.CONFIG_KEEPER)
        ) {
            revert Errors.Unauthorized(msg.sender, "LIMITED / CONFIG KEEPER");
        }

        _;
    }

    function initOracleProviderForToken(address oracle, address token, address provider) external onlyConfigKeeper nonReentrant {
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }

        if (dataStore.getAddress(Keys.oracleProviderForTokenKey(oracle, token)) != address(0)) {
            revert Errors.OracleProviderAlreadyExistsForToken(oracle, token);
        }

        if (!dataStore.getBool(Keys.isOracleProviderEnabledKey(provider))) {
            revert Errors.InvalidOracleProvider(provider);
        }

        dataStore.setAddress(Keys.oracleProviderForTokenKey(oracle, token), provider);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "oracle", oracle);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "provider", provider);
        eventEmitter.emitEventLog(
            "InitOracleProviderForToken",
            eventData
        );
    }

    function setOracleProviderForFeeHandlerToken(address token, address provider) external onlyConfigKeeper nonReentrant {
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }

        if (!dataStore.getBool(Keys.isOracleProviderEnabledKey(provider))) {
            revert Errors.InvalidOracleProvider(provider);
        }

        if (Chain.currentTimestamp() - dataStore.getUint(Keys.oracleProviderUpdatedAt(token, provider))
            < dataStore.getUint(Keys.ORACLE_PROVIDER_MIN_CHANGE_DELAY)) {
            revert Errors.OracleProviderMinChangeDelayNotYetPassed(token, provider);
        }

        dataStore.setUint(Keys.oracleProviderUpdatedAt(token, provider), Chain.currentTimestamp());
        dataStore.setAddress(Keys.oracleProviderForTokenKey(token), provider);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "provider", provider);
        eventEmitter.emitEventLog(
            "SetOracleProviderForFeeHandlerToken",
            eventData
        );
    }

    function _setOracleProviderForToken(address oracle, address token, address provider) internal {
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }

        if (!dataStore.getBool(Keys.isOracleProviderEnabledKey(provider))) {
            revert Errors.InvalidOracleProvider(provider);
        }

        if (provider != staticOracleProvider) {
            if (Chain.currentTimestamp() - dataStore.getUint(Keys.oracleProviderUpdatedAt(token, provider))
                < dataStore.getUint(Keys.ORACLE_PROVIDER_MIN_CHANGE_DELAY)) {
                revert Errors.OracleProviderMinChangeDelayNotYetPassed(token, provider);
            }
        }

        dataStore.setUint(Keys.oracleProviderUpdatedAt(token, provider), Chain.currentTimestamp());
        dataStore.setAddress(Keys.oracleProviderForTokenKey(oracle, token), provider);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "oracle", oracle);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "provider", provider);
        eventEmitter.emitEventLog(
            "SetOracleProviderForToken",
            eventData
        );
    }

    function setOracleProviderForToken(address oracle, address token, address provider) external onlyConfigKeeper nonReentrant {
        _setOracleProviderForToken(oracle, token, provider);
    }

    // @dev Offchain checks should be applied prior to executing this function
    // token MUST be isolated to one market, be an index token for this market, no GLVs should use this token.
    // use freezeTokenPrice script to execute those checks
    function setStaticPriceForMarketIndexToken(
        address market,
        OracleUtils.SetPricesParams memory pricesParams
    ) external onlyConfigKeeper nonReentrant withOraclePrices(pricesParams) {
        Market.Props memory marketProps = MarketStoreUtils.get(dataStore, market);
        if (marketProps.marketToken == address(0)) {
            revert Errors.EmptyMarket();
        }

        address token = marketProps.indexToken;
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }

        _setStaticPriceForToken(token);
    }

    function _setStaticPriceForToken(address token) internal {
        Price.Props memory price = oracle.getPrimaryPrice(token);
        dataStore.setUint(Keys.staticOraclePriceKey(token, false), price.min);
        dataStore.setUint(Keys.staticOraclePriceKey(token, true), price.max);

        _setOracleProviderForToken(address(oracle), token, staticOracleProvider);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "provider", staticOracleProvider);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "priceMin", price.min);
        eventData.uintItems.setItem(1, "priceMax", price.max);
        eventEmitter.emitEventLog(
            "SetStaticPriceForToken",
            eventData
        );
    }

    function initOracleConfig(
        ConfigUtils.InitOracleConfigParams memory params
    ) external onlyConfigKeeper nonReentrant {
        ConfigUtils.initOracleConfig(
            dataStore,
            eventEmitter,
            params
        );
    }

    function setClaimableCollateralFactorForTime(
        address market,
        address token,
        uint256 timeKey,
        uint256 factor
    ) external onlyConfigKeeper nonReentrant {
        ConfigUtils.setClaimableCollateralFactorForTime(
            dataStore,
            eventEmitter,
            market,
            token,
            timeKey,
            factor
        );
    }

    function setClaimableCollateralFactorForAccount(
        address market,
        address token,
        uint256 timeKey,
        address account,
        uint256 factor
    ) external onlyConfigKeeper nonReentrant {
        ConfigUtils.setClaimableCollateralFactorForAccount(
            dataStore,
            eventEmitter,
            market,
            token,
            timeKey,
            account,
            factor
        );
    }

    function setClaimableCollateralReductionFactorForAccount(
        address market,
        address token,
        uint256 timeKey,
        address account,
        uint256 factor
    ) external onlyConfigKeeper nonReentrant {
        ConfigUtils.setClaimableCollateralReductionFactorForAccount(
            dataStore,
            eventEmitter,
            market,
            token,
            timeKey,
            account,
            factor
        );
    }

    function setPositionImpactDistributionRate(
        address market,
        uint256 minPositionImpactPoolAmount,
        uint256 positionImpactPoolDistributionRate
    ) external onlyConfigKeeper nonReentrant {
        ConfigUtils.setPositionImpactDistributionRate(
            dataStore,
            eventEmitter,
            market,
            minPositionImpactPoolAmount,
            positionImpactPoolDistributionRate
        );
    }

    // @dev set a bool value
    // @param baseKey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the bool value
    function setBool(bytes32 baseKey, bytes memory data, bool value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

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
    function setAddress(bytes32 baseKey, bytes memory data, address value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

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
    function setBytes32(bytes32 baseKey, bytes memory data, bytes32 value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

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
    function setUint(bytes32 baseKey, bytes memory data, uint256 value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

        _setUint(baseKey, data, value);
    }

    // @dev set a funding uint256 value after settling accrued funding with
    // oracle prices under the previous configuration
    function setFundingUintWithOraclePrices(
        bytes32 baseKey,
        bytes memory data,
        uint256 value,
        OracleUtils.SetPricesParams memory pricesParams
    ) external onlyConfigKeeper nonReentrant withOraclePrices(pricesParams) {
        if (!FundingConfigUtils.isFundingConfigKey(baseKey)) {
            revert Errors.InvalidBaseKey(baseKey);
        }

        address marketAddress = abi.decode(data, (address));
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);
        if (market.marketToken == address(0)) {
            revert Errors.EmptyMarket();
        }

        // There is no interval to settle before the first funding checkpoint.
        // Runtime updates require oracle prices and settle before the new value
        // is stored.
        if (dataStore.getUint(Keys.fundingUpdatedAtKey(market.marketToken)) != 0) {
            MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(oracle, market);
            MarketUtils.updateFundingState(dataStore, eventEmitter, market, prices);
        }

        _setUint(baseKey, data, value);
    }

    function _setUint(bytes32 baseKey, bytes memory data, uint256 value) internal {
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
    function setInt(bytes32 baseKey, bytes memory data, int256 value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

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

    // @dev initialize the allowed base keys
    function _initAllowedBaseKeys() internal {
        bytes32[196] memory keys = ConfigKeys.allowedBaseKeyList();
        for (uint256 i; i < keys.length; i++) {
            allowedBaseKeys[keys[i]] = true;
        }
    }

    function _initAllowedLimitedBaseKeys() internal {
        bytes32[14] memory keys = ConfigKeys.allowedLimitedBaseKeyList();
        for (uint256 i; i < keys.length; i++) {
            allowedLimitedBaseKeys[keys[i]] = true;
        }
    }

    // @dev validate that the baseKey is allowed to be used
    // @param baseKey the base key to validate
    function _validateKey(bytes32 baseKey) internal view {
        if (roleStore.hasRole(msg.sender, Role.CONFIG_KEEPER)) {
            if (!allowedBaseKeys[baseKey]) {
                revert Errors.InvalidBaseKey(baseKey);
            }

            return;
        }

        if (roleStore.hasRole(msg.sender, Role.LIMITED_CONFIG_KEEPER)) {
            if (!allowedLimitedBaseKeys[baseKey]) {
                revert Errors.InvalidBaseKey(baseKey);
            }

            return;
        }

        revert Errors.InvalidBaseKey(baseKey);
    }
}
