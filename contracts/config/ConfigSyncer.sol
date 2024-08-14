// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./Config.sol";
import "./IRiskOracle.sol";
import "../feature/FeatureUtils.sol";

// @title ConfigSyncer
// @dev Contract to handle market parameter updates
contract ConfigSyncer is ReentrancyGuard, RoleModule {
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.BoolItems;

    Config public immutable config;
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    address public immutable riskOracle;

    constructor(
        RoleStore _roleStore, 
        Config _config, 
        DataStore _dataStore, 
        EventEmitter _eventEmitter,
        address _riskOracle
    ) RoleModule(_roleStore) {
        config = _config;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        riskOracle = _riskOracle;
    }

    // @dev Allows the LIMITED_CONFIG_KEEPER to apply updates with the provided markets and parameters.
    // @param markets An array of market addresses for which updates are to be applied.
    // @param parameters An array of parameters corresponding to each market for which updates are to be applied.
    function sync(
        address[] calldata markets, 
        string[] calldata parameters
    ) external onlyLimitedConfigKeeper nonReentrant {
        FeatureUtils.validateFeature(dataStore, Keys.syncConfigFeatureDisabledKey(address(this)));
        
        if (markets.length != parameters.length) {
            revert Errors.SyncConfigInvalidInputLengths(markets.length, parameters.length);
        }

        uint256 latestUpdateId = dataStore.getUint(Keys.syncConfigLatestUpdateIdKey());

        for (uint256 i; i < markets.length; i++) {
            address market = markets[i];
            string memory parameter = parameters[i];
            bool updateApplied;

            bool syncConfigMarketDisabled = dataStore.getBool(Keys.syncConfigMarketDisabledKey(market));
            if (syncConfigMarketDisabled) {
                revert Errors.SyncConfigUpdatesDisabledForMarket(market);
            }
            
            bool syncConfigparameterDisabled = dataStore.getBool(Keys.syncConfigParameterDisabledKey(parameter));
            if (syncConfigparameterDisabled) {
                revert Errors.SyncConfigUpdatesDisabledForParameter(parameter);
            }

            bool syncConfigMarketParameterDisabled = dataStore.getBool(Keys.syncConfigMarketParameterDisabledKey(market, parameter));
            if (syncConfigMarketParameterDisabled) {
                revert Errors.SyncConfigUpdatesDisabledForMarketParameter(market, parameter);
            }

            IRiskOracle.RiskParameterUpdate memory riskParameterUpdate = IRiskOracle(riskOracle).getLatestUpdateByParameterAndMarket(parameter, abi.encode(market));
            uint256 updateId = riskParameterUpdate.updateId;
            (bytes32 baseKey, bytes memory data) = abi.decode(riskParameterUpdate.additionalData, (bytes32, bytes));
            bytes32 fullKey = data.length == 0 ? baseKey : keccak256(bytes.concat(baseKey, data));
            uint256 prevValue = dataStore.getUint(fullKey);
            uint256 updatedValue = Cast.bytesToUint256(riskParameterUpdate.newValue);
            
            bool syncConfigUpdatedCompleted = dataStore.getBool(Keys.syncConfigUpdateCompletedKey(updateId));
            if (!syncConfigUpdatedCompleted) {
                config.setUint(baseKey, data, updatedValue);
                dataStore.setBool(Keys.syncConfigUpdateCompletedKey(updateId), true);
                updateApplied = true;

                if (updateId > latestUpdateId) {
                    latestUpdateId = updateId;
                }
            }

            EventUtils.EventLogData memory eventData;

            eventData.uintItems.initItems(3);
            eventData.uintItems.setItem(0, "updateId", updateId);
            eventData.uintItems.setItem(1, "prevValue", prevValue);
            eventData.uintItems.setItem(2, "nextValue", updatedValue);

            eventData.boolItems.initItems(1);
            eventData.boolItems.setItem(0, "updateApplied", updateApplied);
            
            eventEmitter.emitEventLog(
                "SyncConfig",
                eventData
            );
        }
        
        if (latestUpdateId > dataStore.getUint(Keys.syncConfigLatestUpdateIdKey())) {
            dataStore.setUint(Keys.syncConfigLatestUpdateIdKey(), latestUpdateId);
        }
    }
}
