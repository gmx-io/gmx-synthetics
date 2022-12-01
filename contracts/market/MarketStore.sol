// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Market.sol";
import "../bank/StrictBank.sol";

// @title MarketStore
// @dev Store for markets
contract MarketStore is StrictBank {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;
    using Market for Market.Props;

    mapping(address => Market.Props) internal markets;
    EnumerableSet.AddressSet internal marketTokens;

    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}

    // @dev set a market in the store
    // @param marketToken address of the market token of the market
    // @param market the market values to set
    function set(address marketToken, Market.Props memory market) external onlyController {
        markets[marketToken] = market;
        marketTokens.add(marketToken);
    }

    // @dev delete a market from the store
    // @param marketToken the address of the market to delete
    function remove(address marketToken) external onlyController {
        delete markets[marketToken];
        marketTokens.remove(marketToken);
    }

    // @dev check if a market exists
    // @param marketToken the address of the market to check
    function contains(address marketToken) external view returns (bool) {
        return marketTokens.contains(marketToken);
    }

    // @dev get a market from the store
    // @param marketToken the address of the market token of the market
    // @return the market
    function get(address marketToken) external view returns (Market.Props memory) {
        return markets[marketToken];
    }

    // @dev get the total number of markets in the store
    // @return the total number of markets in the store
    function getMarketCount() external view returns (uint256) {
        return marketTokens.length();
    }

    // @dev get the market keys for the given indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the market keys for the given indexes
    function getMarketKeys(uint256 start, uint256 end) external view returns (address[] memory) {
        return marketTokens.valuesAt(start, end);
    }
}
