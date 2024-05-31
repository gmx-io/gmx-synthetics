// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Glv.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

// @title GlvFactory
// @dev Contract to create glv
contract GlvFactory is RoleModule {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(RoleStore _roleStore, DataStore _dataStore, EventEmitter _eventEmitter) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    bytes32 public constant GLV_SALT = keccak256(abi.encode("GLV_SALT"));

    function getGlvSaltHash(bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(GLV_SALT, salt));
    }

    // @dev creates a market
    // @param indexToken address of the index token for the market
    // @param longToken address of the long token for the market
    // @param shortToken address of the short token for the market
    // @param marketType the type of the market
    function createGlv(bytes32 salt) external onlyMarketKeeper returns (address) {
        bytes32 saltHash = getGlvSaltHash(salt);
        address glvAddress = dataStore.getAddress(saltHash);
        if (glvAddress != address(0)) {
            revert Errors.MarketAlreadyExists(salt, glvAddress);
        }

        Glv glv = new Glv{salt: salt}(roleStore, dataStore);

        dataStore.addAddress(Keys.GLV_LIST, address(glv));
        dataStore.setAddress(salt, address(glv));

        emitGlvCreated(address(glv), salt);

        return address(glv);
    }

    function emitGlvCreated(address glvAddress, bytes32 salt) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "glv", glvAddress);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "salt", salt);

        eventEmitter.emitEventLog1("GlvCreated", Cast.toBytes32(glvAddress), eventData);
    }
}
