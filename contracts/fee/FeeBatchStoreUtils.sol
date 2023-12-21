// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";

import "./FeeBatch.sol";

/**
 * @title FeeBatchStoreUtils
 * @dev Library for fee batch storage functions
 */
library FeeBatchStoreUtils {
    using FeeBatch for FeeBatch.Props;

    bytes32 public constant FEE_TOKENS_V1 = keccak256(abi.encode("FEE_TOKENS_V1"));
    bytes32 public constant FEE_AMOUNTS_V1 = keccak256(abi.encode("FEE_AMOUNTS_V1"));
    bytes32 public constant REMAINING_AMOUNTS_V1 = keccak256(abi.encode("REMAINING_AMOUNTS_V1"));

    bytes32 public constant FEE_TOKENS_V2 = keccak256(abi.encode("FEE_TOKENS_V2"));
    bytes32 public constant FEE_AMOUNTS_V2 = keccak256(abi.encode("FEE_AMOUNTS_V2"));
    bytes32 public constant REMAINING_AMOUNTS_V2 = keccak256(abi.encode("REMAINING_AMOUNTS_V2"));

    bytes32 public constant CREATED_AT = keccak256(abi.encode("CREATED_AT"));

    function get(DataStore dataStore, bytes32 key) public view returns (FeeBatch.Props memory) {
        FeeBatch.Props memory feeBatch;
        if (!dataStore.containsBytes32(Keys.FEE_BATCH_LIST, key)) {
            return feeBatch;
        }

        feeBatch.feeTokensV1 = dataStore.getAddressArray(
            keccak256(abi.encode(key, FEE_TOKENS_V1))
        );

        feeBatch.feeAmountsV1 = dataStore.getUintArray(
            keccak256(abi.encode(key, FEE_AMOUNTS_V1))
        );

        feeBatch.remainingAmountsV1 = dataStore.getUintArray(
            keccak256(abi.encode(key, REMAINING_AMOUNTS_V1))
        );

        feeBatch.feeTokensV2 = dataStore.getAddressArray(
            keccak256(abi.encode(key, FEE_TOKENS_V2))
        );

        feeBatch.feeAmountsV2 = dataStore.getUintArray(
            keccak256(abi.encode(key, FEE_AMOUNTS_V2))
        );

        feeBatch.remainingAmountsV2 = dataStore.getUintArray(
            keccak256(abi.encode(key, REMAINING_AMOUNTS_V2))
        );

        feeBatch.createdAt = dataStore.getUint(
            keccak256(abi.encode(key, CREATED_AT))
        );

        return feeBatch;
    }

    function set(DataStore dataStore, bytes32 key, FeeBatch.Props memory feeBatch) external {
        dataStore.addBytes32(
            Keys.FEE_BATCH_LIST,
            key
        );

        dataStore.setAddressArray(
            keccak256(abi.encode(key, FEE_TOKENS_V1)),
            feeBatch.feeTokensV1
        );

        dataStore.setUintArray(
            keccak256(abi.encode(key, FEE_AMOUNTS_V1)),
            feeBatch.feeAmountsV1
        );

        dataStore.setUintArray(
            keccak256(abi.encode(key, REMAINING_AMOUNTS_V1)),
            feeBatch.remainingAmountsV1
        );

        dataStore.setAddressArray(
            keccak256(abi.encode(key, FEE_TOKENS_V2)),
            feeBatch.feeTokensV2
        );

        dataStore.setUintArray(
            keccak256(abi.encode(key, FEE_AMOUNTS_V2)),
            feeBatch.feeAmountsV2
        );

        dataStore.setUintArray(
            keccak256(abi.encode(key, REMAINING_AMOUNTS_V2)),
            feeBatch.remainingAmountsV2
        );

        dataStore.setUint(
            keccak256(abi.encode(key, CREATED_AT)),
            feeBatch.createdAt
        );
    }

    function remove(DataStore dataStore, bytes32 key) external {
        if (!dataStore.containsBytes32(Keys.FEE_BATCH_LIST, key)) {
            revert Errors.FeeBatchNotFound(key);
        }

        dataStore.removeBytes32(
            Keys.FEE_BATCH_LIST,
            key
        );

        dataStore.removeAddressArray(
            keccak256(abi.encode(key, FEE_TOKENS_V1))
        );

        dataStore.removeUintArray(
            keccak256(abi.encode(key, FEE_AMOUNTS_V1))
        );

        dataStore.removeUintArray(
            keccak256(abi.encode(key, REMAINING_AMOUNTS_V1))
        );

        dataStore.removeAddressArray(
            keccak256(abi.encode(key, FEE_TOKENS_V2))
        );

        dataStore.removeUintArray(
            keccak256(abi.encode(key, FEE_AMOUNTS_V2))
        );

        dataStore.removeUintArray(
            keccak256(abi.encode(key, REMAINING_AMOUNTS_V2))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, CREATED_AT))
        );
    }

    function getFeeBatchCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getAddressCount(Keys.FEE_BATCH_LIST);
    }

    function getFeeBatchKeys(DataStore dataStore, uint256 start, uint256 end) internal view returns (bytes32[] memory) {
        return dataStore.getBytes32ValuesAt(Keys.FEE_BATCH_LIST, start, end);
    }
}
