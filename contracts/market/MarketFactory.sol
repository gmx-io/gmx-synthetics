// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MarketToken.sol";
import "./Market.sol";
import "./MarketStoreUtils.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

// @title MarketFactory
// @dev Contract to create markets
contract MarketFactory is RoleModule {
    using Market for Market.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
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

        emitMarketCreated(address(marketToken), salt, indexToken, longToken, shortToken);

        return market;
    }

    function emitMarketCreated(
        address marketToken,
        bytes32 salt,
        address indexToken,
        address longToken,
        address shortToken
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(4);
        eventData.addressItems.setItem(0, "marketToken", marketToken);
        eventData.addressItems.setItem(1, "indexToken", indexToken);
        eventData.addressItems.setItem(2, "longToken", longToken);
        eventData.addressItems.setItem(3, "shortToken", shortToken);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "salt", salt);

        eventEmitter.emitEventLog1(
            "MarketCreated",
            Cast.toBytes32(marketToken),
            eventData
        );
    }
}
