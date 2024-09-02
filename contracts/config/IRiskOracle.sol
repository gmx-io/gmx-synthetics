// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// Using interface for the Chaos Labs Risk Oracle contract so that importing the contract is not necessary
interface IRiskOracle {
    struct RiskParameterUpdate {
        uint256 timestamp;
        bytes newValue;
        string referenceId;
        bytes previousValue;
        string updateType;
        uint256 updateId;
        address market;
        bytes additionalData;
    }
    function getLatestUpdateByParameterAndMarket(string memory updateType, address market) external view returns (RiskParameterUpdate memory);
}
