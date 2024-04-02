// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./OracleUtils.sol";

// @title IOracleProvider
// @dev Interface for an oracle provider
interface IOracleProvider {
    function getOraclePrice(
        address token,
        bytes memory data
    ) external returns (OracleUtils.ValidatedPrice memory);
}
