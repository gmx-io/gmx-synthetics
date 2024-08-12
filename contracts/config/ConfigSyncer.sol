// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./Config.sol";
import "./IRiskOracle.sol";

contract ConfigSyncer is ReentrancyGuard, RoleModule {
    // Contract instances for the Config and DataStore contracts
    Config public immutable config;
    DataStore public immutable dataStore;

    // Address for the Chaos Labs RiskOracle contract
    address public immutable riskOracle;

    constructor(RoleStore _roleStore, Config _config, DataStore _dataStore, address _riskOracle) RoleModule(_roleStore) {
        config = _config;
        dataStore = _dataStore;
        riskOracle = _riskOracle;
    }

     // @dev Allows the LIMITED_CONFIG_KEEPER to apply updates with the provided markets and parameter types.
     // @param markets An array of market addresses for which updates are to be applied.
     // @param parameterTypes An array of parameter types corresponding to each market for which updates are to be applied.
     // Requirements:
     // - The length of the markets and parameterTypes arrays must be the same.
     // - The SyncConfig functionality must not be disabled.
     // - Updates for the specified market must not be disabled.
     // - Updates for the specified parameter type must not be disabled.
     // - Updates for the combination of market and parameter type must not be disabled.
     // - The update must not have already been applied.
    function syncConfig(address[] calldata markets, string[] calldata parameterTypes) external onlyLimitedConfigKeeper nonReentrant {
        bytes32 cachedSyncConfigFeatureDisabledKey = Keys.SYNC_CONFIG_FEATURE_DISABLED;
        
        if (dataStore.getBool(cachedSyncConfigFeatureDisabledKey)) {
                revert Errors.SyncConfigUpdatesDisabled();
            }
        
        if (markets.length != parameterTypes.length) {
            revert Errors.SyncConfigInvalidInputLengths(markets.length, parameterTypes.length);
        }

        bytes32 cachedSyncConfigLatestUpdateIdKey = Keys.SYNC_CONFIG_LATEST_UPDATE_ID;
        bytes32 cachedSyncConfigUpdateCompletedKey = Keys.SYNC_CONFIG_UPDATE_COMPLETED;
        uint256 cachedLatestUpdate = dataStore.getUint(cachedSyncConfigLatestUpdateIdKey);
        address market;
        string memory parameterType;

        for (uint256 i = 0; i < markets.length; i++) {
            market = markets[i];
            parameterType = parameterTypes[i];
            
            if (dataStore.getBool(keccak256(bytes.concat(cachedSyncConfigFeatureDisabledKey, abi.encode(market))))) {
                revert Errors.SyncConfigUpdatesDisabledForMarket(market);
            }

            if (dataStore.getBool(keccak256(bytes.concat(cachedSyncConfigFeatureDisabledKey, abi.encode(parameterType))))) {
                revert Errors.SyncConfigUpdatesDisabledForParameterType(parameterType);
            }

            if (dataStore.getBool(keccak256(bytes.concat(cachedSyncConfigFeatureDisabledKey, abi.encode(market), abi.encode(parameterType))))) {
                revert Errors.SyncConfigUpdatesDisabledForMarketParameter(market, parameterType);
            }

            IRiskOracle.RiskParameterUpdate memory riskParameterUpdate = IRiskOracle(riskOracle).getLatestUpdateByParameterAndMarket(parameterType, abi.encode(market));
            uint256 updateId = riskParameterUpdate.updateId;
            
            if (dataStore.getBool(keccak256(bytes.concat(cachedSyncConfigUpdateCompletedKey, abi.encode(updateId))))) {
                revert Errors.SyncConfigUpdateAlreadyApplied(updateId);
            }

            uint256 updatedValue = Cast.bytesToUint256(riskParameterUpdate.newValue);
            (bytes32 baseKey, bytes memory data) = abi.decode(riskParameterUpdate.additionalData, (bytes32, bytes));
            config.setUint(baseKey, data, updatedValue);
            config.setBool(cachedSyncConfigUpdateCompletedKey, abi.encode(updateId), true);
            
            if (updateId > cachedLatestUpdate) {
                cachedLatestUpdate = updateId;
            }
        }
        
        if (cachedLatestUpdate > dataStore.getUint(cachedSyncConfigLatestUpdateIdKey)) {
            config.setUint(cachedSyncConfigLatestUpdateIdKey, new bytes(0), cachedLatestUpdate);
        }
    }
}
