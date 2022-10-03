// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

contract Timelock {
    address public admin;

    mapping (string => bool) public allowedFastKeys;
    mapping (string => bool) public allowedSlowKeys;

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Timelock: forbidden");
        _;
    }

    function setAllowedFastKeys() external onlyAdmin {
        // allowing setting of impact factors could allow a keeper
        // to game the impact pool, for this reason, setting of the
        // impact factor should eventually be moved under the oracle system
        // this should be done after the strategy for setting positive and negative
        //  impact factors has been refined and finalized
        string[6] memory allowedKeys = [
            Keys.POSITION_IMPACT_FACTOR,
            Keys.POSITION_SPREAD_FACTOR,
            Keys.SWAP_IMPACT_FACTOR,
            Keys.SWAP_SPREAD_FACTOR,
            Keys.POSITION_FEE_FACTOR,
            Keys.SWAP_FEE_FACTOR
        ];

        for (uint256 i = 0; i < allowedKeys.length; i++) {
            allowedFastKeys[allowedKeys[i]] = true;
        }
    }

    function fastSetUints(DataStore dataStore, string[] memory prefixes, bytes[] memory data, uint256[] memory values) external onlyAdmin {
        for (uint256 i = 0; i < prefixes.length; i++) {
            string memory prefix = prefixes[i];

            require(allowedFastKeys[prefix], "Timelock: invalid key");
            bytes32 key = keccak256(abi.encodePacked(
                prefix,
                data[i]
            ));

            dataStore.setUint(key, values[i]);
        }
    }

    function fastSetUint(DataStore dataStore, string memory prefix, bytes memory data, uint256 value) external onlyAdmin {
        require(allowedFastKeys[prefix], "Timelock: invalid key");
        bytes32 key = keccak256(abi.encodePacked(
            prefix,
            data
        ));

        dataStore.setUint(key, value);
    }
}
