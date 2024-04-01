// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./OracleUtils.sol";
import "../data/DataStore.sol";

// @title IOracleProvider
// @dev Interface for an oracle provider
interface IOracleProvider {
    function getOraclePrice(
        DataStore dataStore,
        address token,
        bytes memory data
    ) external returns (OracleUtils.ValidatedPrice memory);
}
