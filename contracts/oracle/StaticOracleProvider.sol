// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./OracleUtils.sol";
import "./IOracleProvider.sol";

import "../data/Keys.sol";
import "../data/DataStore.sol";

// @title Static Oracle provider
// @dev Contract to retrieve stored static prices for a token
// prices are set via Config.setStaticPriceForToken
contract StaticOracleProvider is IOracleProvider, ReentrancyGuard {
    DataStore public immutable dataStore;

    constructor(
        DataStore _dataStore
    ) {
        dataStore = _dataStore;
    }

    function shouldAdjustTimestamp() external pure returns (bool) {
        return true;
    }

    function isChainlinkOnChainProvider() external pure returns (bool) {
        return false;
    }

    function getOraclePrice(
        address token,
        bytes memory /*data*/
    ) external view returns (OracleUtils.ValidatedPrice memory) {

        uint256 priceMin = dataStore.getUint(Keys.staticOraclePriceKey(token, false));
        uint256 priceMax = dataStore.getUint(Keys.staticOraclePriceKey(token, true));
        if (priceMin == 0 || priceMax == 0) {
            revert Errors.StaticPriceNotSet(token);
        }

        return OracleUtils.ValidatedPrice({
            token: token,
            min: priceMax,
            max: priceMin,
            timestamp: block.timestamp,
            provider: address(this)
        });
    }

}
