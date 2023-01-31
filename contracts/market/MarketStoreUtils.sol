// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";

import "./Market.sol";

/**
 * @title MarketStoreUtils
 * @dev Library for market storage functions
 */
library MarketStoreUtils {
    using Market for Market.Props;

    bytes32 public constant MARKET_TOKEN = keccak256(abi.encode("MARKET_TOKEN"));
    bytes32 public constant INDEX_TOKEN = keccak256(abi.encode("INDEX_TOKEN"));
    bytes32 public constant LONG_TOKEN = keccak256(abi.encode("LONG_TOKEN"));
    bytes32 public constant SHORT_TOKEN = keccak256(abi.encode("SHORT_TOKEN"));

    function get(DataStore dataStore, address key) external view returns (Market.Props memory) {
        Market.Props memory market;
        if (!dataStore.containsAddress(Keys.MARKET_LIST, key)) {
            return market;
        }

        market.marketToken = dataStore.getAddress(
            keccak256(abi.encode(key, MARKET_TOKEN))
        );

        market.indexToken = dataStore.getAddress(
            keccak256(abi.encode(key, INDEX_TOKEN))
        );

        market.longToken = dataStore.getAddress(
            keccak256(abi.encode(key, LONG_TOKEN))
        );

        market.shortToken = dataStore.getAddress(
            keccak256(abi.encode(key, SHORT_TOKEN))
        );

        return market;
    }

    function set(DataStore dataStore, address key, Market.Props memory market) external {
        dataStore.addAddress(
            Keys.MARKET_LIST,
            key
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, MARKET_TOKEN)),
            market.marketToken
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, INDEX_TOKEN)),
            market.indexToken
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, LONG_TOKEN)),
            market.longToken
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, SHORT_TOKEN)),
            market.shortToken
        );
    }

    function remove(DataStore dataStore, address key) external {
        dataStore.removeAddress(
            Keys.MARKET_LIST,
            key
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, MARKET_TOKEN))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, INDEX_TOKEN))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, LONG_TOKEN))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, SHORT_TOKEN))
        );
    }

    function getMarketCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getAddressCount(Keys.MARKET_LIST);
    }

    function getMarketKeys(DataStore dataStore, uint256 start, uint256 end) internal view returns (address[] memory) {
        return dataStore.getAddressValuesAt(Keys.MARKET_LIST, start, end);
    }
}
