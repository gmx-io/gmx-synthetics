// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../error/Errors.sol";

// @title GmOracleUtils
// @dev Library for GmOracle functions
library GmOracleUtils {
    struct Report {
        address token;
        uint256 signerInfo;
        uint256 precision;
        uint256 minOracleBlockNumber;
        uint256 maxOracleBlockNumber;
        uint256 oracleTimestamp;
        bytes32 blockHash;
        uint256[] minPrices;
        uint256[] maxPrices;
        bytes[] signatures;
    }

    // @dev validate the signer of a price
    // before calling this function, the expectedSigner should be validated to
    // ensure that it is not the zero address
    // @param report the oracle Report data
    // @param token the token used for the signed message hash
    // @param minPrice the min price used for the signed message hash
    // @param maxPrice the max price used for the signed message hash
    // @param tokenOracleType the token oracle type used for the signed message hash
    // @param signature the signer's signature
    // @param expectedSigner the address of the expected signer
    function validateSigner(
        bytes32 salt,
        Report memory report,
        address token,
        uint256 minPrice,
        uint256 maxPrice,
        bytes32 tokenOracleType,
        bytes memory signature,
        address expectedSigner
    ) internal pure {
        bytes32 digest = ECDSA.toEthSignedMessageHash(
            keccak256(abi.encode(
                salt,
                report.minOracleBlockNumber,
                report.maxOracleBlockNumber,
                report.oracleTimestamp,
                report.blockHash,
                token,
                tokenOracleType,
                10 ** report.precision,
                minPrice,
                maxPrice
            ))
        );

        address recoveredSigner = ECDSA.recover(digest, signature);
        if (recoveredSigner != expectedSigner) {
            revert Errors.InvalidGmSignature(recoveredSigner, expectedSigner);
        }
    }
}
