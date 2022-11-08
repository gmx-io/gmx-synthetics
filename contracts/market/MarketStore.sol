// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Market.sol";
import "../role/RoleModule.sol";

contract MarketStore is RoleModule {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;
    using Market for Market.Props;

    mapping(address => Market.Props) internal markets;
    mapping(bytes32 => address) public marketAddresses;
    EnumerableSet.AddressSet internal marketTokens;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function set(address marketToken, Market.Props memory market) external onlyController {
        markets[marketToken] = market;
        marketTokens.add(marketToken);

        bytes32 marketKey = keccak256(abi.encodePacked(market.indexToken, market.longToken, market.shortToken));
        marketAddresses[marketKey] = marketToken;
    }

    function remove(address marketToken) external onlyController {
        Market.Props memory market = markets[marketToken];

        delete markets[marketToken];
        marketTokens.remove(marketToken);

        bytes32 marketKey = keccak256(abi.encodePacked(market.indexToken, market.longToken, market.shortToken));
        delete marketAddresses[marketKey];
    }

    function contains(address marketToken) external view returns (bool) {
        return marketTokens.contains(marketToken);
    }

    function get(address marketToken) external view returns (Market.Props memory) {
        return markets[marketToken];
    }

    function getMarketToken(address indexToken, address longToken, address shortToken) external view returns (address) {
        bytes32 marketKey = keccak256(abi.encodePacked(indexToken, longToken, shortToken));
        return marketAddresses[marketKey];
    }

    function getMarketCount() external view returns (uint256) {
        return marketTokens.length();
    }

    function getMarketKeys(uint256 start, uint256 end) external view returns (address[] memory) {
        return marketTokens.valuesAt(start, end);
    }
}
