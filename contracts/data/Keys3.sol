// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title Keys3
// @dev Additional keys for values in the DataStore
library Keys3 {
    // @dev key for whether risk oracle updates are enabled for a market
    bytes32 public constant RISK_ORACLE_MARKET_ENABLED = keccak256(abi.encode("RISK_ORACLE_MARKET_ENABLED"));

    // @dev key for whether risk oracle updates are enabled for a market
    // @param market the market to check
    // @return key for risk oracle market enabled
    function riskOracleMarketEnabledKey(address market) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            RISK_ORACLE_MARKET_ENABLED,
            market
        ));
    }
}
