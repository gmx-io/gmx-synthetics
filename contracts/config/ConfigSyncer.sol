// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./Config.sol";
import "./IRiskOracle.sol";
import "../feature/FeatureUtils.sol";

// @title ConfigSyncer
// @dev Contract to handle market parameter updates
contract ConfigSyncer is ReentrancyGuard, RoleModule {
    Config public immutable config;
    DataStore public immutable dataStore;
    address public immutable riskOracle;

    constructor(
        RoleStore _roleStore, 
        Config _config, 
        DataStore _dataStore, 
        address _riskOracle
    ) RoleModule(_roleStore) {
        config = _config;
        dataStore = _dataStore;
        riskOracle = _riskOracle;
    }

    // @dev Allows the LIMITED_CONFIG_KEEPER to apply updates with the provided markets and parameter types.
    // @param markets An array of market addresses for which updates are to be applied.
    // @param parameterTypes An array of parameter types corresponding to each market for which updates are to be applied.
    function sync(
        address[] calldata markets, 
        string[] calldata parameterTypes
    ) external onlyLimitedConfigKeeper nonReentrant {
        FeatureUtils.validateFeature(dataStore, Keys.syncConfigFeatureDisabledKey(address(this)));
        
        if (markets.length != parameterTypes.length) {
            revert Errors.SyncConfigInvalidInputLengths(markets.length, parameterTypes.length);
        }

        uint256 latestUpdateId = dataStore.getUint(Keys.syncConfigLatestUpdateIdKey());

        for (uint256 i; i < markets.length; i++) {
            address market = markets[i];
            string memory parameterType = parameterTypes[i];
            
            bool syncConfigMarketDisabled = dataStore.getBool(Keys.syncConfigMarketDisabledKey(market));
            if (syncConfigMarketDisabled) {
                revert Errors.SyncConfigUpdatesDisabledForMarket(market);
            }
            
            bool syncConfigParameterTypeDisabled = dataStore.getBool(Keys.syncConfigParameterTypeDisabledKey(parameterType));
            if (syncConfigParameterTypeDisabled) {
                revert Errors.SyncConfigUpdatesDisabledForParameterType(parameterType);
            }

            bool syncConfigMarketParameterDisabled = dataStore.getBool(Keys.syncConfigMarketParameterDisabledKey(market, parameterType));
            if (syncConfigMarketParameterDisabled) {
                revert Errors.SyncConfigUpdatesDisabledForMarketParameter(market, parameterType);
            }

            IRiskOracle.RiskParameterUpdate memory riskParameterUpdate = IRiskOracle(riskOracle).getLatestUpdateByParameterAndMarket(parameterType, abi.encode(market));
            uint256 updateId = riskParameterUpdate.updateId;
            
            bool syncConfigUpdatedCompleted = dataStore.getBool(Keys.syncConfigUpdateCompletedKey(updateId));
            if (syncConfigUpdatedCompleted) {
                revert Errors.SyncConfigUpdateAlreadyApplied(updateId);
            }

            uint256 updatedValue = Cast.bytesToUint256(riskParameterUpdate.newValue);
            (bytes32 baseKey, bytes memory data) = abi.decode(riskParameterUpdate.additionalData, (bytes32, bytes));
            config.setUint(baseKey, data, updatedValue);
            dataStore.setBool(Keys.syncConfigUpdateCompletedKey(updateId), true);
            
            if (updateId > latestUpdateId) {
                latestUpdateId = updateId;
            }
        }
        
        if (latestUpdateId > dataStore.getUint(Keys.syncConfigLatestUpdateIdKey())) {
            dataStore.setUint(Keys.syncConfigLatestUpdateIdKey(), latestUpdateId);
        }
    }
}
