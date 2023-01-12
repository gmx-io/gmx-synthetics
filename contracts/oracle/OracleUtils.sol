// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../utils/Array.sol";
import "../utils/Bits.sol";
import "../price/Price.sol";

// @title OracleUtils
// @dev Libary for oracle functions
library OracleUtils {
    // @dev SetPricesParams struct for values required in Oracle.setPrices
    // @param signerInfo compacted indexes of signers, the index is used to retrieve
    // the signer address from the OracleStore
    // @param tokens list of tokens to set prices for
    // @param compactedOracleBlockNumbers compacted oracle block numbers
    // @param compactedOracleTimestamps compacted oracle timestamps
    // @param compactedDecimals compacted decimals for prices
    // @param compactedMinPrices compacted min prices
    // @param compactedMinPricesIndexes compacted min price indexes
    // @param compactedMaxPrices compacted max prices
    // @param compactedMaxPricesIndexes compacted max price indexes
    // @param signatures signatures of the oracle signers
    // @param priceFeedTokens tokens to set prices for based on an external price feed value
    struct SetPricesParams {
        uint256 signerInfo;
        address[] tokens;
        uint256[] compactedOracleBlockNumbers;
        uint256[] compactedOracleTimestamps;
        uint256[] compactedDecimals;
        uint256[] compactedMinPrices;
        uint256[] compactedMinPricesIndexes;
        uint256[] compactedMaxPrices;
        uint256[] compactedMaxPricesIndexes;
        bytes[] signatures;
        address[] priceFeedTokens;
    }

    struct SimulatePricesParams {
        address[] primaryTokens;
        Price.Props[] primaryPrices;
        address[] secondaryTokens;
        Price.Props[] secondaryPrices;
    }

    // compacted prices have a length of 32 bits
    uint256 public constant COMPACTED_PRICE_BIT_LENGTH = 32;
    uint256 public constant COMPACTED_PRICE_BITMASK = Bits.BITMASK_32;

    // compacted precisions have a length of 8 bits
    uint256 public constant COMPACTED_PRECISION_BIT_LENGTH = 8;
    uint256 public constant COMPACTED_PRECISION_BITMASK = Bits.BITMASK_8;

    // compacted block numbers have a length of 64 bits
    uint256 public constant COMPACTED_BLOCK_NUMBER_BIT_LENGTH = 64;
    uint256 public constant COMPACTED_BLOCK_NUMBER_BITMASK = Bits.BITMASK_64;

    // compacted timestamps have a length of 64 bits
    uint256 public constant COMPACTED_TIMESTAMP_BIT_LENGTH = 64;
    uint256 public constant COMPACTED_TIMESTAMP_BITMASK = Bits.BITMASK_64;

    // compacted price indexes have a length of 8 bits
    uint256 public constant COMPACTED_PRICE_INDEX_BIT_LENGTH = 8;
    uint256 public constant COMPACTED_PRICE_INDEX_BITMASK = Bits.BITMASK_8;

    error EmptyCompactedPrice(uint256 index);
    error EmptyCompactedBlockNumber(uint256 index);
    error EmptyCompactedTimestamp(uint256 index);

    error OracleBlockNumbersAreNotEqual(uint256[] oracleBlockNumbers, uint256 expectedBlockNumber);
    error OracleBlockNumbersAreSmallerThanRequired(uint256[] oracleBlockNumbers, uint256 expectedBlockNumber);

    error InvalidSignature(address recoveredSigner, address expectedSigner);

    // @dev get the uncompacted price at the specified index
    // @param compactedPrices the compacted prices
    // @param index the index to get the uncompacted price at
    // @return the uncompacted price at the specified index
    function getUncompactedPrice(uint256[] memory compactedPrices, uint256 index) internal pure returns (uint256) {
        uint256 price = Array.getUncompactedValue(
            compactedPrices,
            index,
            COMPACTED_PRICE_BIT_LENGTH,
            COMPACTED_PRICE_BITMASK,
            "getUncompactedPrice"
        );

        if (price == 0) { revert EmptyCompactedPrice(index); }

        return price;
    }

    // @dev get the uncompacted decimal at the specified index
    // @param compactedDecimals the compacted decimals
    // @param index the index to get the uncompacted decimal at
    // @return the uncompacted decimal at the specified index
    function getUncompactedDecimal(uint256[] memory compactedDecimals, uint256 index) internal pure returns (uint256) {
        uint256 decimal = Array.getUncompactedValue(
            compactedDecimals,
            index,
            COMPACTED_PRECISION_BIT_LENGTH,
            COMPACTED_PRECISION_BITMASK,
            "getUncompactedDecimal"
        );

        return decimal;
    }


    // @dev get the uncompacted price index at the specified index
    // @param compactedPriceIndexes the compacted indexes
    // @param index the index to get the uncompacted price index at
    // @return the uncompacted price index at the specified index
    function getUncompactedPriceIndex(uint256[] memory compactedPriceIndexes, uint256 index) internal pure returns (uint256) {
        uint256 priceIndex = Array.getUncompactedValue(
            compactedPriceIndexes,
            index,
            COMPACTED_PRICE_INDEX_BIT_LENGTH,
            COMPACTED_PRICE_INDEX_BITMASK,
            "getUncompactedPriceIndex"
        );

        return priceIndex;

    }

    // @dev get the uncompacted oracle block numbers
    // @param compactedOracleBlockNumbers the compacted oracle block numbers
    // @param length the length of the uncompacted oracle block numbers
    // @return the uncompacted oracle block numbers
    function getUncompactedOracleBlockNumbers(uint256[] memory compactedOracleBlockNumbers, uint256 length) internal pure returns (uint256[] memory) {
        uint256[] memory blockNumbers = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            blockNumbers[i] = getUncompactedOracleBlockNumber(compactedOracleBlockNumbers, i);
        }

        return blockNumbers;
    }

    // @dev get the uncompacted oracle block number
    // @param compactedOracleBlockNumbers the compacted oracle block numbers
    // @param index the index to get the uncompacted oracle block number at
    // @return the uncompacted oracle block number
    function getUncompactedOracleBlockNumber(uint256[] memory compactedOracleBlockNumbers, uint256 index) internal pure returns (uint256) {
        uint256 blockNumber = Array.getUncompactedValue(
            compactedOracleBlockNumbers,
            index,
            COMPACTED_BLOCK_NUMBER_BIT_LENGTH,
            COMPACTED_BLOCK_NUMBER_BITMASK,
            "getUncompactedOracleBlockNumber"
        );

        if (blockNumber == 0) { revert EmptyCompactedBlockNumber(index); }

        return blockNumber;
    }

    // @dev get the uncompacted oracle timestamp
    // @param compactedOracleTimestamps the compacted oracle timestamps
    // @param index the index to get the uncompacted oracle timestamp at
    // @return the uncompacted oracle timestamp
    function getUncompactedOracleTimestamp(uint256[] memory compactedOracleTimestamps, uint256 index) internal pure returns (uint256) {
        uint256 blockNumber = Array.getUncompactedValue(
            compactedOracleTimestamps,
            index,
            COMPACTED_TIMESTAMP_BIT_LENGTH,
            COMPACTED_TIMESTAMP_BITMASK,
            "getUncompactedOracleTimestamp"
        );

        if (blockNumber == 0) { revert EmptyCompactedTimestamp(index); }

        return blockNumber;
    }

    // @dev validate the signer of a price
    // @param oracleBlockNumber the block number used for the signed message hash
    // @param oracleTimestamp the timestamp used for the signed message hash
    // @param blockHash the block hash used for the signed message hash
    // @param token the token used for the signed message hash
    // @param precision the precision used for the signed message hash
    // @param minPrice the min price used for the signed message hash
    // @param maxPrice the max price used for the signed message hash
    // @param signature the signer's signature
    // @param expectedSigner the address of the expected signer
    function validateSigner(
        bytes32 SALT,
        uint256 oracleBlockNumber,
        uint256 oracleTimestamp,
        bytes32 blockHash,
        address token,
        bytes32 tokenOracleType,
        uint256 precision,
        uint256 minPrice,
        uint256 maxPrice,
        bytes memory signature,
        address expectedSigner
    ) internal pure {
        bytes32 digest = ECDSA.toEthSignedMessageHash(
            keccak256(abi.encode(
                SALT,
                oracleBlockNumber,
                oracleTimestamp,
                blockHash,
                token,
                tokenOracleType,
                precision,
                minPrice,
                maxPrice
            ))
        );

        address recoveredSigner = ECDSA.recover(digest, signature);
        if (recoveredSigner != expectedSigner) {
            revert InvalidSignature(recoveredSigner, expectedSigner);
        }
    }

    function revertOracleBlockNumbersAreNotEqual(uint256[] memory oracleBlockNumbers, uint256 expectedBlockNumber) internal pure {
        revert OracleBlockNumbersAreNotEqual(oracleBlockNumbers, expectedBlockNumber);
    }

    function revertOracleBlockNumbersAreSmallerThanRequired(uint256[] memory oracleBlockNumbers, uint256 expectedBlockNumber) internal pure {
        revert OracleBlockNumbersAreSmallerThanRequired(oracleBlockNumbers, expectedBlockNumber);
    }
}
