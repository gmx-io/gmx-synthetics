// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../error/Errors.sol";

/**
 * @title Cast
 * @dev Library for casting functions
 */
library Cast {
    function toBytes32(address value) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }

    /**
     * @dev Converts a bytes array to a uint256.
     * Handles cases where the uint256 stored in bytes is stored with or without padding.
     * @param uint256AsBytes The bytes array representing the uint256 value.
     * @return value The uint256 value obtained from the bytes array.
     */
    function bytesToUint256(bytes memory uint256AsBytes) internal pure returns (uint256) {
        uint256 length = uint256AsBytes.length;
        
        if(length > 32) {
            revert Errors.Uint256AsBytesLengthExceeds32Bytes(length);
        }

        if (length == 0) {
            return 0;
        }

        uint256 value;
        
        assembly {
            value := mload(add(uint256AsBytes, 32))
        }

        return value = value >> (8 * (32 - length));
    }
}
