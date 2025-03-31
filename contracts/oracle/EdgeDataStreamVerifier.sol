// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../utils/Cast.sol";
import "../error/Errors.sol";

contract EdgeDataStreamVerifier {

    struct Report {
        bytes32 feedId;
        uint256 bid; // bid: min price, highest buy price
        uint256 ask; // ask: max price, lowest sell price
        uint32 timestamp;
        int32 expo; // precision of bid&ask (negative value)
    }

    address public immutable trustedSigner;

    /**
    * @dev Constructor to set the trusted signer address
    * @param trustedSigner The address of the trusted signer
    */
    constructor(address _trustedSigner) {
        if (_trustedSigner == address(0)) {
            revert Errors.InvalidTrustedSignerAddress();
        }
        trustedSigner = _trustedSigner;
    }


    function verifyData(bytes calldata data) public view returns (Report memory) {
        (
            string memory feedId,
            uint192 price,
            uint32 roundId,
            uint32 timestamp,
            uint256 bid,
            uint256 ask,
            bytes memory signature,
            int32 expo
        ) = abi.decode(data, (string, uint192, uint32, uint32, uint256, uint256, bytes, int32));

        if (!verifySignature(feedId, price, roundId, timestamp, bid, ask, signature)) {
            revert Errors.InvalidEdgeSignature();
        }
        return Report(
            Cast.toBytes32(feedId),
            bid,
            ask,
            timestamp,
            expo
        );
    }

    function verifySignature(
        string memory feedId,
        uint192 price,
        uint32 roundId,
        uint32 timestamp,
        uint256 bid,
        uint256 ask,
        bytes memory signature
    ) public view returns (bool) {
        return extractSigner(
            feedId,
            price,
            roundId,
            timestamp,
            bid,
            ask,
            signature
        ) == trustedSigner;
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
        uint192 price,
        uint32 roundId,
        uint32 timestamp,
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

        address recovered = recoverSigner(messageHash, signature);
        if (recovered == address(0)) {
            revert Errors.InvalidEdgeSignature();
        }

        return recovered;
    }

    /**
     * @dev Creates a hash of the serialized price data in the same format as server does
     */
    function getMessageHash(
        string memory feedId,
        uint192 price,
        uint32 roundId,
        uint32 timestamp,
        uint256 bid,
        uint256 ask
    ) public pure returns (bytes32) {
        bytes memory message = abi.encodePacked(
            leftPadBytes(bytes(feedId), 32),
            Cast.uint192ToBytes(price),
            Cast.uint32ToBytes(roundId),
            Cast.uint32ToBytes(timestamp),
            Cast.uint256ToBytes(bid),
            Cast.uint256ToBytes(ask)
        );

        return keccak256(message);
    }

    /**
     * @dev Recovers the signer's address from a signature. Supports v value offset, such as Go library generates.
     * @param messageHash The hash of the original message
     * @param signature The signature bytes
     * @return The address of the signer
     */
    function recoverSigner(
        bytes32 messageHash,
        bytes memory signature
    ) public pure returns (address) {
        if (signature.length != 65) {
            revert Errors.InvalidEdgeSignatureLength(signature.length);
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

        (address signer, ECDSA.RecoverError error) = ECDSA.tryRecover(messageHash, v, r, s);
        if (error != ECDSA.RecoverError.NoError) {
            revert Errors.InvalidEdgeSignature();
        }
        return signer;
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
