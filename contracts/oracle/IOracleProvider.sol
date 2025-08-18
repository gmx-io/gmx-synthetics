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

    /// @dev for all oracle providers besides ChainlinkPriceFeedProvider
    function shouldAdjustTimestamp() external pure returns (bool);

    /// @dev for ChainlinkPriceFeedProvider
    function isChainlinkOnChainProvider() external pure returns (bool);
}
