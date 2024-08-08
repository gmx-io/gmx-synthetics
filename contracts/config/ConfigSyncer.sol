// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./Config.sol";
import "../reader/Reader.sol";
import "../market/Market.sol";
import "../role/RoleModule.sol";

contract ConfigSyncer is ReentrancyGuard {
    // Uint256 that is equal to the latest update published by the Chaos Labs Risk Oracle contract that has already been applied by this contract
    uint256 public latestUpdate;
    
    // Addresses for the RiskOracle and DataStore contracts
    address public immutable riskOracle;
    address public immutable dataStore;

    // Contract instances for the Reader, Config and RoleStore contracts
    Reader public immutable reader;
    Config public immutable config;
    RoleStore public immutable roleStore;
    
    // Bool that if true disables the ability to apply any updates
    bool public isDisabled;

    // Mapping from updateId to bool that returns true if an update has already been applied and false if it hasn't yet been applied
    mapping(uint256 => bool) public isCompleted;

    // Mapping that if true disables the ability to apply all updates of any parameter type for a given market
    mapping(address => bool) public isMarketDisabled;

    // Mapping that if true disables the ability to apply updates of a given parameter type for all markets
    mapping(string => bool) public isParameterDisabled;

    // Mapping that if true disables the ability to apply updates of a given parameter type for a given market (bytes = market and parameter type abiEncodePacked)
    mapping(bytes => bool) public isMarketParameterDisabled;

    constructor(address _riskOracle, address _dataStore, Reader _reader, Config _config, RoleStore _roleStore) {
        // Initialize riskOracle and dataStore addresses
        riskOracle = _riskOracle;
        dataStore = _dataStore;
        
        // Initialize with contract addresses
        reader = _reader;
        config = _config;
        roleStore = _roleStore;
    }

    modifier onlyConfigKeeper() {
        if (
            !roleStore.hasRole(msg.sender, Role.CONFIG_KEEPER)
        ) {
            revert Errors.Unauthorized(msg.sender, "CONFIG_KEEPER");
        }

        _;
    }

    modifier onlyLimitedConfigKeeper() {
        if (
            !roleStore.hasRole(msg.sender, Role.LIMITED_CONFIG_KEEPER)
        ) {
            revert Errors.Unauthorized(msg.sender, "LIMITED_CONFIG_KEEPER");
        }

        _;
    }

    // Allows CONFIG_KEEPER to enable or disable the ability to apply updates
    function setIsDisabled(address _market, bool _disabled) external onlyConfigKeeper nonReentrant {
        isMarketDisabled[_market] = _disabled;
    }

    // Allows CONFIG_KEEPER to enable or disable the ability to apply updates of any parameter type for a specific market
    function setIsMarketDisabled(address _market, bool _disabled) external onlyConfigKeeper nonReentrant {
        isMarketDisabled[_market] = _disabled;
    }

    // Allows CONFIG_KEEPER to enable or disable the ability to apply updates for a specific parameter type for all markets
    function setIsParameterDisabled(string memory _parameterType, bool _disabled) external onlyConfigKeeper nonReentrant {
        isParameterDisabled[_parameterType] = _disabled;
    }

    // Allows CONFIG_KEEPER to enable or disable the ability to apply updates for a specific market and parameter type combination
    function setIsMarketParameterDisabled(address _market, string memory _parameterType, bool _disabled) external onlyConfigKeeper nonReentrant {
        isMarketParameterDisabled[abi.encodePacked(_market, _parameterType)] = _disabled;
    }

    // Allows the LIMITED_CONFIG_KEEPER to apply updates with the provided _markets and _parameterTypes
    function sync(address[] memory _markets, string[] memory _parameterTypes) external onlyLimitedConfigKeeper nonReentrant {
        require(!isDisabled);
        require(_markets.length == _parameterTypes.length);
        uint256 cachedLatestUpdate = latestUpdate;
        for (uint256 i = 0; i < _markets.length; i++) {
            require(!isMarketDisabled[_markets[i]]);
            require(!isParameterDisabled[_parameterTypes[i]]);
            require(!isMarketParameterDisabled[abi.encodePacked(_markets[i], _parameterTypes[i])]);
            IRiskOracle.RiskParameterUpdate memory riskParameterUpdate = IRiskOracle(riskOracle).getLatestUpdateByParameterAndMarket(_parameterTypes[i], abi.encode(_markets[i]));
            uint256 updateId = riskParameterUpdate.updateId;
            (bytes32 baseKey, bytes memory data) = abi.decode(riskParameterUpdate.additionalData, (bytes32, bytes));
            uint256 updatedValue = bytesToUint256(riskParameterUpdate.newValue);
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

    // Handles cases in which the uint256 stored in bytes is stored without padding
    function bytesToUint256(bytes memory _bytes) internal pure returns (uint256 value) {
        require(_bytes.length <= 32, "Data length exceeds 32 bytes");
        if (_bytes.length == 0) {
            return 0;
        }
        assembly {
            value := mload(add(_bytes, 32))
        }
        value = value >> (8 * (32 - _bytes.length));
    }
}

// Using interface for the Chaos Labs Risk Oracle contract so that importing the contract is not necessary
interface IRiskOracle {
    struct RiskParameterUpdate {
        uint256 timestamp;
        bytes newValue;
        string referenceId;
        bytes previousValue;
        string updateType;
        uint256 updateId;
        bytes market;
        bytes additionalData;
    }
    function getLatestUpdateByParameterAndMarket(string memory updateType, bytes memory market) external view returns (RiskParameterUpdate memory);
}
