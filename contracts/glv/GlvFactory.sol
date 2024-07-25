// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Strings.sol";
import "./GlvToken.sol";
import "./Glv.sol";
import "./GlvStoreUtils.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

import "hardhat/console.sol";

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

    function createGlv(
        address longToken,
        address shortToken,
        bytes32 glvType,
        string memory nameSuffix,
        string memory symbolSuffix
    ) external onlyMarketKeeper returns (Glv.Props memory) {
        bytes32 salt = keccak256(abi.encode("GMX_GLV", longToken, shortToken, glvType));

        address existingGlvAddress = dataStore.getAddress(GlvStoreUtils.getGlvSaltHash(salt));
        if (existingGlvAddress != address(0)) {
            revert Errors.GlvAlreadyExists(glvType, existingGlvAddress);
        }

        string memory name = string.concat("GMX Liquidity Vault", Strings.equal(nameSuffix, "") ? "" : " ", nameSuffix);
        string memory symbol = string.concat("GLV", Strings.equal(symbolSuffix, "") ? "" : " ", symbolSuffix);

        GlvToken glvToken = new GlvToken{salt: salt}(roleStore, dataStore, name, symbol);

        Glv.Props memory glv = Glv.Props({glvToken: address(glvToken), longToken: longToken, shortToken: shortToken});

        GlvStoreUtils.set(dataStore, address(glvToken), salt, glv);

        emitGlvCreated(address(glvToken), salt, longToken, shortToken);

        return glv;
    }

    function emitGlvCreated(address glvAddress, bytes32 salt, address longToken, address shortToken) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "glv", glvAddress);
        eventData.addressItems.setItem(1, "longToken", longToken);
        eventData.addressItems.setItem(2, "shortToken", shortToken);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "salt", salt);

        eventEmitter.emitEventLog1("GlvCreated", Cast.toBytes32(glvAddress), eventData);
    }
}
