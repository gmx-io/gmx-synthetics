// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";

import "./Glv.sol";

library GlvStoreUtils {
    using Glv for Glv.Props;

    bytes32 public constant GLV_SALT = keccak256(abi.encode("GLV_SALT"));
    bytes32 public constant GLV_TOKEN = keccak256(abi.encode("GLV_TOKEN"));
    bytes32 public constant LONG_TOKEN = keccak256(abi.encode("LONG_TOKEN"));
    bytes32 public constant SHORT_TOKEN = keccak256(abi.encode("SHORT_TOKEN"));

    function get(DataStore dataStore, address key) public view returns (Glv.Props memory) {
        Glv.Props memory glv;
        if (!dataStore.containsAddress(Keys.GLV_LIST, key)) {
            return glv;
        }

        glv.glvToken = dataStore.getAddress(
            keccak256(abi.encode(key, GLV_TOKEN))
        );

        glv.longToken = dataStore.getAddress(
            keccak256(abi.encode(key, LONG_TOKEN))
        );

        glv.shortToken = dataStore.getAddress(
            keccak256(abi.encode(key, SHORT_TOKEN))
        );

        return glv;
    }

    function getBySalt(DataStore dataStore, bytes32 salt) external view returns (Glv.Props memory) {
        address key = dataStore.getAddress(getGlvSaltHash(salt));
        return get(dataStore, key);
    }

    function set(DataStore dataStore, address key, bytes32 salt, Glv.Props memory glv) external {
        dataStore.addAddress(
            Keys.GLV_LIST,
            key
        );

        // the salt is based on the glv props while the key gives the glv's address
        // use the salt to store a reference to the key to allow the key to be retrieved
        // using just the salt value
        dataStore.setAddress(
            getGlvSaltHash(salt),
            key
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, GLV_TOKEN)),
            glv.glvToken
        );


        dataStore.setAddress(
            keccak256(abi.encode(key, LONG_TOKEN)),
            glv.longToken
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, SHORT_TOKEN)),
            glv.shortToken
        );
    }

    function remove(DataStore dataStore, address key) external {
        if (!dataStore.containsAddress(Keys.GLV_LIST, key)) {
            revert Errors.GlvNotFound(key);
        }

        dataStore.removeAddress(
            Keys.GLV_LIST,
            key
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, GLV_TOKEN))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, LONG_TOKEN))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, SHORT_TOKEN))
        );
    }

    function getGlvSaltHash(bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(GLV_SALT, salt));
    }

    function getGlvCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getAddressCount(Keys.GLV_LIST);
    }

    function getGlvKeys(DataStore dataStore, uint256 start, uint256 end) internal view returns (address[] memory) {
        return dataStore.getAddressValuesAt(Keys.GLV_LIST, start, end);
    }
}
