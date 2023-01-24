// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MarketToken.sol";
import "./Market.sol";
import "./MarketUtils.sol";

// @title MarketFactory
// @dev Contract to create markets
contract MarketFactory is RoleModule {
    using Market for Market.Props;

    event MarketCreated(address marketToken, address indexToken, address longToken, address shortToken);

    DataStore public immutable dataStore;

    constructor(RoleStore _roleStore, DataStore _dataStore) RoleModule(_roleStore) {
        dataStore = _dataStore;
    }

    // @dev creates a market
    // @param indexToken address of the index token for the market
    // @param longToken address of the long token for the market
    // @param shortToken address of the short token for the market
    function createMarket(
        address indexToken,
        address longToken,
        address shortToken
    ) external onlyMarketKeeper returns (Market.Props memory) {
        bytes32 marketTokenSalt = keccak256(abi.encode(
            "GMX_MARKET",
            indexToken,
            longToken,
            shortToken
        ));

        MarketToken marketToken = new MarketToken{salt: marketTokenSalt}(roleStore, dataStore);

        Market.Props memory market = Market.Props(
            address(marketToken),
            indexToken,
            longToken,
            shortToken
        );

        MarketStoreUtils.set(dataStore, address(marketToken), market);

        emit MarketCreated(address(marketToken), indexToken, longToken, shortToken);

        return market;
    }
}
