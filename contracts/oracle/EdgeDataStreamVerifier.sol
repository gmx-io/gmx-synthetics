// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Errors} from "../error/Errors.sol";
import {Cast} from "../utils/Cast.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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
    * @param _trustedSigner The address of the trusted signer
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

        if (!verifySignature(
            feedId, price, roundId, timestamp, bid, ask, expo,
            signature)) {
            revert Errors.InvalidEdgeSigner();
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
        int32 expo,
        bytes memory signature
    ) public view returns (bool) {
        return extractSigner(
            feedId,
            price,
            roundId,
            timestamp,
            bid,
            ask,
            expo,
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
        int32 expo,
        bytes memory signature
    ) public pure returns (address) {
        // Recreate the message that was signed
        bytes32 messageHash;
        {
            messageHash = getMessageHash(
                leftPadBytes(bytes(feedId), 32),
                Cast.uint192ToBytes(price),
                Cast.uint32ToBytes(roundId),
                Cast.uint32ToBytes(timestamp),
                Cast.uint256ToBytes(bid),
                Cast.uint256ToBytes(ask),
                Cast.int32ToBytes(- expo)
            );
        }

        (address recovered, ECDSA.RecoverError recoverError) = ECDSA.tryRecover(messageHash, signature);
        if (recoverError != ECDSA.RecoverError.NoError) {
            revert Errors.InvalidEdgeSignature(uint(recoverError));
        }

        return recovered;
    }

    /**
     * @dev Creates a hash of the serialized price data in the same format as server does
     */
    function getMessageHash(
        bytes memory feedId,
        bytes memory price,
        bytes memory roundId,
        bytes memory ts,
        bytes memory bid,
        bytes memory ask,
        bytes memory expo
    ) private pure returns (bytes32) {

        // split one abi.encodePacked call into two to avoid stack too deep error
        bytes memory message = abi.encodePacked(
            feedId,
            price,
            expo
        );
        message = abi.encodePacked(message,
            roundId,
            ts,
            bid,
            ask
        );

        return keccak256(message);
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
