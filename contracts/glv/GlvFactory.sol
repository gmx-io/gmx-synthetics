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

    function getGlvSalt(address longToken, address shortToken, bytes32 glvType) internal pure returns (bytes32) {
        return keccak256(abi.encode("GMX_GLV", longToken, shortToken, glvType));
    }

    function createGlv(
        address longToken,
        address shortToken,
        bytes32 glvType
    ) external onlyMarketKeeper returns (address) {
        bytes32 salt = getGlvSalt(longToken, shortToken, glvType);
        address glvAddress = dataStore.getAddress(salt);
        if (glvAddress != address(0)) {
            revert Errors.GlvAlreadyExists(glvType, glvAddress);
        }

        Glv glv = new Glv{salt: salt}(roleStore, dataStore);

        // the glvType is not stored with the glv, it is mainly used to ensure
        // glvs with the same longToken and shortToken can be created if needed
        dataStore.addAddress(Keys.GLV_LIST, address(glv));
        dataStore.setAddress(salt, address(glv));
        dataStore.setAddress(Keys.glvLongTokenKey(address(glv)), longToken);
        dataStore.setAddress(Keys.glvShortTokenKey(address(glv)), shortToken);

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
