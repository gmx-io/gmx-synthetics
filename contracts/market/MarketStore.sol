// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Market.sol";
import "../bank/StrictBank.sol";

contract MarketStore is StrictBank {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;
    using Market for Market.Props;

    mapping(address => Market.Props) internal markets;
    EnumerableSet.AddressSet internal marketTokens;

    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}

    function set(address marketToken, Market.Props memory market) external onlyController {
        markets[marketToken] = market;
        marketTokens.add(marketToken);
    }

    function remove(address marketToken) external onlyController {
        delete markets[marketToken];
        marketTokens.remove(marketToken);
    }

    function contains(address marketToken) external view returns (bool) {
        return marketTokens.contains(marketToken);
    }

    function get(address marketToken) external view returns (Market.Props memory) {
        return markets[marketToken];
    }

    function getMarketCount() external view returns (uint256) {
        return marketTokens.length();
    }

    function getMarketKeys(uint256 start, uint256 end) external view returns (address[] memory) {
        return marketTokens.valuesAt(start, end);
    }
}
