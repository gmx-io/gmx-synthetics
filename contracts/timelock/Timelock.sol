// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

/**
 * @title Timelock
 * @dev Contract to manage access controls, providing time-based restrictions
 * on functions if required
 */
contract Timelock {
    address public admin;

    mapping (bytes32 => bool) public allowedFastKeys;
    mapping (bytes32 => bool) public allowedSlowKeys;

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Timelock: forbidden");
        _;
    }

    /**
     * @dev initialize the allowed fast key values
     */
    function initAllowedFastKeys() external onlyAdmin {
        // allowing setting of impact factors could allow a keeper
        // to game the impact pool, for this reason, setting of the
        // impact factor should eventually be moved under the oracle system
        // this should be done after the strategy for setting positive and negative
        //  impact factors has been refined and finalized
        bytes32[4] memory allowedKeys = [
            Keys.POSITION_IMPACT_FACTOR,
            Keys.SWAP_IMPACT_FACTOR,
            Keys.POSITION_FEE_FACTOR,
            Keys.SWAP_FEE_FACTOR
        ];

        for (uint256 i = 0; i < allowedKeys.length; i++) {
            allowedFastKeys[allowedKeys[i]] = true;
        }
    }

    /**
     * @dev Stores multiple unsigned integer values in a data store.
     * @param dataStore The data store where the values will be stored.
     * @param prefixes An array of key prefixes to use for each value.
     * @param data An array of data to use for each value.
     * @param values An array of unsigned integer values to be stored.
     */
    function fastSetUints(DataStore dataStore, bytes32[] memory prefixes, bytes[] memory data, uint256[] memory values) external onlyAdmin {
        for (uint256 i = 0; i < prefixes.length; i++) {
            bytes32 prefix = prefixes[i];

            require(allowedFastKeys[prefix], "Timelock: invalid key");
            bytes32 key = keccak256(abi.encode(
                prefix,
                data[i]
            ));

            dataStore.setUint(key, values[i]);
        }
    }

    /**
     * @dev Sets a `uint256` value in storage with a concatenated `bytes32` prefix and `bytes` data
     * @param dataStore The storage instance where the value will be set
     * @param prefix The `bytes32` prefix to concatenate with the `bytes` data
     * @param data The `bytes` data to concatenate with the `bytes32` prefix
     * @param value The `uint256` value to set in storage
     */
    function fastSetUint(DataStore dataStore, bytes32 prefix, bytes memory data, uint256 value) external onlyAdmin {
        require(allowedFastKeys[prefix], "Timelock: invalid key");
        bytes32 key = keccak256(abi.encode(
            prefix,
            data
        ));

        dataStore.setUint(key, value);
    }
}
