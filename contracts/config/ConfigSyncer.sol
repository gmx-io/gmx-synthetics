// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./Config.sol";
import "./IRiskOracle.sol";
import "../reader/Reader.sol";
import "../market/Market.sol";
import "../role/RoleModule.sol";
import "../utils/Cast.sol";

contract ConfigSyncer is ReentrancyGuard, RoleModule {
    // Uint256 that is equal to the latest update published by the Chaos Labs Risk Oracle contract that has already been applied by this contract
    uint256 public latestUpdate;
    
    // Addresses for the RiskOracle and DataStore contracts
    address public immutable riskOracle;
    address public immutable dataStore;

    // Contract instances for the Reader, Config and RoleStore contracts
    Reader public immutable reader;
    Config public immutable config;
    RoleStore public immutable roleStore;

    // Mapping from updateId to bool that returns true if an update has already been applied and false if it hasn't yet been applied
    mapping(uint256 => bool) public isCompleted;

    // Mapping that if true disables the ability to apply all updates of any parameter type for a given market
    mapping(address => bool) public isMarketDisabled;

    // Mapping that if true disables the ability to apply updates of a given parameter type for all markets
    mapping(bytes32 => bool) public isParameterTypeDisabled;

    // Mapping that if true disables the ability to apply updates of a given parameter type for a given market (bytes = market and parameter type abiEncodePacked)
    mapping(bytes32 => bool) public isMarketParameterDisabled;

    constructor(address _riskOracle, address _dataStore, Reader _reader, Config _config, RoleStore _roleStore) {
        // Initialize riskOracle and dataStore addresses
        riskOracle = _riskOracle;
        dataStore = _dataStore;
        
        // Initialize with contract addresses
        reader = _reader;
        config = _config;
        roleStore = _roleStore;
    }

    
     // @dev Enables or disables the ability to apply updates of any parameter type for a specific market.
     // @param market The address of the market.
     // @param disabled A boolean indicating whether the market is disabled.
    function setIsMarketDisabled(address market, bool disabled) external onlyConfigKeeper nonReentrant {
        isMarketDisabled[market] = disabled;
    }

    
     // @dev Enables or disables the ability to apply updates for a specific parameter type across all markets.
     // @param parameterType The type of the parameter to be enabled or disabled.
     // @param disabled A boolean indicating whether the parameter type is disabled.
    function setIsParameterTypeDisabled(string calldata parameterType, bool disabled) external onlyConfigKeeper nonReentrant {
        isParameterTypeDisabled[keccak256(abi.encode(parameterType))] = disabled;
    }

     // @dev Enables or disables the ability to apply updates for a specific market and parameter type combination.
     // @param market The address of the market.
     // @param parameterType The type of the parameter to be enabled or disabled for the market.
     // @param disabled A boolean indicating whether the market-parameter combination is disabled.
    function setIsMarketParameterDisabled(address market, string calldata parameterType, bool disabled) external onlyConfigKeeper nonReentrant {
        isMarketParameterDisabled[keccak256(abi.encode(market, parameterType))] = disabled;
    }

    
     // @dev Allows the LIMITED_CONFIG_KEEPER to apply updates with the provided markets and parameter types.
     // @param markets An array of market addresses for which updates are to be applied.
     // @param parameterTypes An array of parameter types corresponding to each market for which updates are to be applied.
     // Requirements:
     // - The length of the markets and parameterTypes arrays must be the same.
     // - The specified market must not be disabled.
     // - The specified parameter type must not be disabled.
     // - The combination of market and parameter type must not be disabled.
     // - The update must not have already been applied.
    function sync(address[] calldata markets, string[] calldata parameterTypes) external onlyLimitedConfigKeeper nonReentrant {
        if (markets.length != parameterTypes.length) {
            revert Errors.MarketsAndParameterTypesDifferentLengths(markets.length, parameterTypes.length);
        }

        uint256 cachedLatestUpdate = latestUpdate;
        address market;
        string memory parameterType;

        for (uint256 i = 0; i < markets.length; i++) {
            market = markets[i];
            parameterType = parameterTypes[i];
            if (isMarketDisabled[market]) {
                revert Errors.UpdatesDisabledForMarket(market);
            }

            if (isParameterTypeDisabled[keccak256(abi.encode(parameterType))]) {
                revert Errors.UpdatesDisabledForParameterType(parameterType);
            }

            if (!isMarketParameterDisabled[keccak256(abi.encode(market, parameterType))]) {
                revert Errors.UpdatesDisabledForMarketParameter(market, parameterType);
            }

            IRiskOracle.RiskParameterUpdate memory riskParameterUpdate = IRiskOracle(riskOracle).getLatestUpdateByParameterAndMarket(parameterTypes[i], abi.encode(markets[i]));
            uint256 updateId = riskParameterUpdate.updateId;
            
            if (isCompleted[updateId]) {
                revert Errors.UpdateAlreadyApplied(updateId);
            }

            uint256 updatedValue = Cast.bytesToUint256(riskParameterUpdate.newValue);
            (bytes32 baseKey, bytes memory data) = abi.decode(riskParameterUpdate.additionalData, (bytes32, bytes));
            config.setUint(baseKey, data, updatedValue);
            isCompleted[updateId] = true;
            
            if (updateId > cachedLatestUpdate) {
                cachedLatestUpdate = riskParameterUpdate.updateId;
            }
        }
        
        if (cachedLatestUpdate > latestUpdate) {
            latestUpdate = cachedLatestUpdate;
        }
    }
}
