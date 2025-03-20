// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Errors} from "../error/Errors.sol";

contract EdgeDataStreamVerifier {

    address public immutable TRUSTED_SIGNER;

    /**
     * @dev Constructor to set the trusted signer address
    * @param trustedSigner The address of the trusted signer
    */
    constructor(address trustedSigner) {
        if (trustedSigner == address(0)) {
            revert Errors.InvalidTrustedSignerAddress();
        }
        TRUSTED_SIGNER = trustedSigner;
    }

    function verifySignature(
        string memory feedId,
        uint256 price,
        uint256 roundId,
        uint256 timestamp,
        uint256 bid,
        uint256 ask,
        bytes memory signature
    ) public pure returns (bool) {
        return extractSigner(
            feedId,
            price,
            roundId,
            timestamp,
            bid,
            ask,
            signature
        ) == TRUSTED_SIGNER;
    }

    /**
     * @dev Extracts address that signed price feed message
     * @param feedId The ID of the price feed (e.g., "BTCUSD")
     * @param price The price value
     * @param roundId The round ID
     * @param timestamp The timestamp of the observation
     * @param bid The best bid price
     * @param ask The best ask price
     * @param signature The signature to verify
     * @return True if the signature is valid, false otherwise
     */
    function extractSigner(
        string memory feedId,
        uint256 price,
        uint256 roundId,
        uint256 timestamp,
        uint256 bid,
        uint256 ask,
        bytes memory signature
    ) public pure returns (address) {
        // Recreate the message that was signed
        bytes32 messageHash = getMessageHash(
            feedId,
            price,
            roundId,
            timestamp,
            bid,
            ask
        );

        // Recover the signer's address from the signature
        return recoverSigner(messageHash, signature);
    }

    /**
     * @dev Creates a hash of the serialized price data in the same format as server does
     */
    function getMessageHash(
        string memory feedId,
        uint256 price,
        uint256 roundId,
        uint256 timestamp,
        uint256 bid,
        uint256 ask
    ) public pure returns (bytes32) {
        bytes memory message = abi.encodePacked(
            leftPadBytes(bytes(feedId), 32),
            leftPadBytes(toBytes(price), 32),
            leftPadBytes(toBytes(roundId), 32),
            leftPadBytes(toBytes(timestamp), 32),
            leftPadBytes(toBytes(bid), 32),
            leftPadBytes(toBytes(ask), 32)
        );

        return keccak256(message);
    }

    /**
     * @dev Recovers the signer's address from a signature
     * @param messageHash The hash of the original message
     * @param signature The signature bytes
     * @return The address of the signer
     */
    function recoverSigner(
        bytes32 messageHash,
        bytes memory signature
    ) public pure returns (address) {
        if (signature.length != 65) {
            revert Errors.InvalidSignatureLength(signature.length);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;

        // Extract r, s, v from the signature
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        // Ethereum signatures use v = 27 or v = 28
        if (v < 27) {
            v += 27;
        }

        // Recover the signer's address
        return ecrecover(messageHash, v, r, s);
    }

    /**
     * @dev Converts a uint256 to bytes
     */
    function toBytes(uint256 x) internal pure returns (bytes memory) {
        if (x == 0) {
            return new bytes(0);
        }

        uint256 j = x;
        uint256 length = 0;

        while (j != 0) {
            length++;
            j >>= 8;
        }

        bytes memory result = new bytes(length);

        uint256 i = length - 1;
        j = x;

        while (j != 0) {
            result[i] = bytes1(uint8(j & 0xFF));
            j >>= 8;
            if (i > 0) {
                i--;
            } else {
                break;
            }
        }

        return result;
    }

    /**
     * @dev Left-pads a byte array to the desired length, similar to common.LeftPadBytes in Go
     */
    function leftPadBytes(
        bytes memory data,
        uint256 length
    ) internal pure returns (bytes memory) {
        bytes memory result = new bytes(length);

        // If data is longer than length, truncate it
        uint256 dataLength = data.length;
        if (dataLength > length) {
            dataLength = length;
        }

        // Copy data to the end of the result
        for (uint256 i = 0; i < dataLength; i++) {
            result[length - dataLength + i] = data[i];
        }

        return result;
    }
}
