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

    function toBytes32(string memory value) internal pure returns (bytes32 result) {
        bytes memory tempEmptyString = bytes(value);
        if (tempEmptyString.length == 0) {
            return 0x0;
        }

        assembly {
            result := mload(add(value, 32))
        }
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

    function bytes32ToAddress(bytes32 _b) internal pure returns (address) {
        return address(uint160(uint256(_b)));
    }

    function uint256ToBytes(uint256 x) internal pure returns (bytes memory b) {
        b = new bytes(32);
        assembly { mstore(add(b, 32), x) }
        return b;
    }

    function uint192ToBytes(uint192 x) internal pure returns (bytes memory b) {
        b = new bytes(32);
        assembly { mstore(add(b, 32), x) }
        return b;
    }

    function uint32ToBytes(uint32 x) internal pure returns (bytes memory b) {
        b = new bytes(32);
        assembly { mstore(add(b, 32), x) }
        return b;
    }
}
