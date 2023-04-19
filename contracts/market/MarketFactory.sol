// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MarketToken.sol";
import "./Market.sol";
import "./MarketUtils.sol";

// @title MarketFactory
// @dev Contract to create markets
contract MarketFactory is RoleModule {
    using Market for Market.Props;

    event MarketCreated(
        address marketToken,
        bytes32 salt,
        address indexToken,
        address longToken,
        address
        shortToken
    );

    DataStore public immutable dataStore;

    constructor(RoleStore _roleStore, DataStore _dataStore) RoleModule(_roleStore) {
        dataStore = _dataStore;
    }

    // @dev creates a market
    // @param indexToken address of the index token for the market
    // @param longToken address of the long token for the market
    // @param shortToken address of the short token for the market
    // @param marketType the type of the market
    function createMarket(
        address indexToken,
        address longToken,
        address shortToken,
        bytes32 marketType
    ) external onlyMarketKeeper returns (Market.Props memory) {
        bytes32 salt = keccak256(abi.encode(
            "GMX_MARKET",
            indexToken,
            longToken,
            shortToken,
            marketType
        ));

        address existingMarketAddress = dataStore.getAddress(MarketStoreUtils.getMarketSaltHash(salt));
        if (existingMarketAddress != address(0)) {
            revert Errors.MarketAlreadyExists(salt, existingMarketAddress);
        }

        MarketToken marketToken = new MarketToken{salt: salt}(roleStore, dataStore);

        // the marketType is not stored with the market, it is mainly used to ensure
        // markets with the same indexToken, longToken and shortToken can be created if needed
        Market.Props memory market = Market.Props(
            address(marketToken),
            indexToken,
            longToken,
            shortToken
        );

        MarketStoreUtils.set(dataStore, address(marketToken), salt, market);

        emit MarketCreated(address(marketToken), salt, indexToken, longToken, shortToken);

        return market;
    }
}
