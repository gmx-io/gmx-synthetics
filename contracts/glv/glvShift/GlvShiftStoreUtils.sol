// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/Keys.sol";
import "../../data/DataStore.sol";

import "./GlvShift.sol";

library GlvShiftStoreUtils {
    using GlvShift for GlvShift.Props;

    bytes32 public constant GLV = keccak256(abi.encode("GLV"));
    bytes32 public constant FROM_MARKET = keccak256(abi.encode("FROM_MARKET"));
    bytes32 public constant TO_MARKET = keccak256(abi.encode("TO_MARKET"));

    bytes32 public constant MARKET_TOKEN_AMOUNT = keccak256(abi.encode("MARKET_TOKEN_AMOUNT"));
    bytes32 public constant MIN_MARKET_TOKENS = keccak256(abi.encode("MIN_MARKET_TOKENS"));
    bytes32 public constant UPDATED_AT_TIME = keccak256(abi.encode("UPDATED_AT_TIME"));

    function get(DataStore dataStore, bytes32 key) external view returns (GlvShift.Props memory) {
        GlvShift.Props memory glvShift;
        if (!dataStore.containsBytes32(Keys.GLV_SHIFT_LIST, key)) {
            return glvShift;
        }

        glvShift.setGlv(dataStore.getAddress(
            keccak256(abi.encode(key, GLV))
        ));

        glvShift.setFromMarket(dataStore.getAddress(
            keccak256(abi.encode(key, FROM_MARKET))
        ));

        glvShift.setToMarket(dataStore.getAddress(
            keccak256(abi.encode(key, TO_MARKET))
        ));

        glvShift.setMarketTokenAmount(dataStore.getUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT))
        ));

        glvShift.setMinMarketTokens(dataStore.getUint(
            keccak256(abi.encode(key, MIN_MARKET_TOKENS))
        ));

        glvShift.setUpdatedAtTime(dataStore.getUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME))
        ));

        return glvShift;
    }

    function set(DataStore dataStore, bytes32 key, GlvShift.Props memory glvShift) external {
        dataStore.addBytes32(
            Keys.GLV_SHIFT_LIST,
            key
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, GLV)),
            glvShift.glv()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, FROM_MARKET)),
            glvShift.fromMarket()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, TO_MARKET)),
            glvShift.toMarket()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT)),
            glvShift.marketTokenAmount()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, MIN_MARKET_TOKENS)),
            glvShift.minMarketTokens()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME)),
            glvShift.updatedAtTime()
        );
    }

    function remove(DataStore dataStore, bytes32 key) external {
        if (!dataStore.containsBytes32(Keys.GLV_SHIFT_LIST, key)) {
            revert Errors.GlvShiftNotFound(key);
        }

        dataStore.removeBytes32(
            Keys.GLV_SHIFT_LIST,
            key
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, GLV))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, FROM_MARKET))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, TO_MARKET))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, MIN_MARKET_TOKENS))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME))
        );
    }

    function getGlvShiftCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getBytes32Count(Keys.GLV_SHIFT_LIST);
    }

    function getGlvShiftKeys(DataStore dataStore, uint256 start, uint256 end) internal view returns (bytes32[] memory) {
        return dataStore.getBytes32ValuesAt(Keys.GLV_SHIFT_LIST, start, end);
    }
}
