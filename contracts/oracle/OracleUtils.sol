// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Array.sol";
import "../utils/Bits.sol";

library OracleUtils {
    struct SetPricesParams {
        uint256 signerInfo;
        address[] tokens;
        uint256[] compactedOracleBlockNumbers;
        uint256[] compactedPrecisions;
        uint256[] compactedMinPrices;
        uint256[] compactedMinPricesIndexes;
        uint256[] compactedMaxPrices;
        uint256[] compactedMaxPricesIndexes;
        bytes[] signatures;
        address[] priceFeedTokens;
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

    // compacted price indexes have a length of 8 bits
    uint256 public constant COMPACTED_PRICE_INDEX_BIT_LENGTH = 8;
    uint256 public constant COMPACTED_PRICE_INDEX_BITMASK = Bits.BITMASK_8;

    error EmptyPrice();
    error EmptyBlockNumber();

    function getUncompactedPrice(uint256[] memory compactedPrices, uint256 index) internal pure returns (uint256) {
        uint256 price = Array.getUncompactedValue(
            compactedPrices,
            index,
            COMPACTED_PRICE_BIT_LENGTH,
            COMPACTED_PRICE_BITMASK
        );

        if (price == 0) { revert EmptyPrice(); }

        return price;
    }

    // store prices as the price of one unit of the token using a value
    // with 30 decimals of precision
    //
    // storing the prices in this way allows for conversions between token
    // amounts and fiat values to be simplified
    // e.g. to calculate the fiat value of a given number of tokens the
    // calculation would just be: token amount * oracle price
    //
    // the trade-off of this simplicity in calculation is that tokens with a small
    // USD price and a lot of decimals may have precision issues
    // it is also possible that a token's price changes significantly and results
    // in requiring higher precision
    //
    // example 1, the price of ETH is 5000, and ETH has 18 decimals
    // the price of one unit of ETH is 5000 / (10 ** 18), 5 * (10 ** -15)
    // to represent the price with 30 decimals, store the price as
    // 5000 / (10 ** 18) * (10 ** 30) => 5 ** (10 ** 15) => 5000 * (10 ** 12)
    // oracle precision for ETH can be set to (10 ** 8) to allow for prices with
    // a maximum value of (2 ** 32) / (10 ** 4) => 4,294,967,296 / (10 ** 4) => 429,496.7296
    // and up to 4 decimals of precision
    //
    // example 2, the price of BTC is 60,000, and BTC has 8 decimals
    // the price of one unit of BTC is 60,000 / (10 ** 8), 6 * (10 ** -4)
    // to represent the price with 30 decimals, store the price as
    // 60,000 / (10 ** 8) * (10 ** 30) => 6 * (10 ** 26) => 60,000 * (10 ** 22)
    // oracle precision for BTC can be set to (10 ** 20) to allow for prices with
    // a maximum value of (2 ** 64) / (10 ** 2) => 4,294,967,296 / (10 ** 2) => 42,949,672.96
    // and up to 2 decimals of precision
    //
    // example 3, the price of USDC is 1, and USDC has 6 decimals
    // the price of one unit of USDC is 1 / (10 ** 6), 1 * (10 ** -6)
    // to represent the price with 30 decimals, store the price as
    // 1 / (10 ** 6) * (10 ** 30) => 1 ** (10 ** 24)
    // oracle precision for USDC can be set to (10 ** 18) to allow for prices with
    // a maximum value of (2 ** 64) / (10 ** 6) => 4,294,967,296 / (10 ** 6) => 4294.967296
    // and up to 6 decimals of precision
    //
    // example 4, the price of DG is 0.00000001, and DG has 18 decimals
    // the price of one unit of DG is 0.00000001 / (10 ** 18), 1 * (10 ** -26)
    // to represent the price with 30 decimals, store the price as
    // 1 * (10 ** -26) * (10 ** 30) => 10,000 => 1 * (10 ** 3)
    // oracle precision for DG can be set to (10 ** 1) to allow for prices with
    // a maximum value of (2 ** 64) / (10 ** 11) => 4,294,967,296 / (10 ** 11) => 0.04294967296
    // and up to 11 decimals of precision
    //
    // formula to calculate what the precision value should be set to:
    // decimals: 30 - (token decimals) - (number of decimals desired for precision)
    // ETH: 30 - 18 - 4 => 8, precision: 10 ** 8
    // BTC: 30 - 8 - 2 => 20, precision: 10 ** 20
    // USDC: 30 - 6 - 6 => 18, precision: 10 ** 18
    // DG: 30 - 18 - 11 => 1, precision: 10 ** 1
    function getUncompactedPrecision(uint256[] memory compactedPrecisions, uint256 index) internal pure returns (uint256) {
        uint256 precision = Array.getUncompactedValue(
            compactedPrecisions,
            index,
            COMPACTED_PRECISION_BIT_LENGTH,
            COMPACTED_PRECISION_BITMASK
        );

        return 10 ** precision;
    }


    function getUncompactedPriceIndex(uint256[] memory compactedPriceIndexes, uint256 index) internal pure returns (uint256) {
        uint256 priceIndex = Array.getUncompactedValue(
            compactedPriceIndexes,
            index,
            COMPACTED_PRICE_INDEX_BIT_LENGTH,
            COMPACTED_PRICE_INDEX_BITMASK
        );

        return priceIndex;

    }

    function getUncompactedOracleBlockNumbers(uint256[] memory compactedOracleBlockNumbers, uint256 length) internal pure returns (uint256[] memory) {
        uint256[] memory blockNumbers = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            blockNumbers[i] = getUncompactedOracleBlockNumber(compactedOracleBlockNumbers, i);
        }

        return blockNumbers;
    }

    function getUncompactedOracleBlockNumber(uint256[] memory compactedOracleBlockNumbers, uint256 index) internal pure returns (uint256) {
        uint256 blockNumber = Array.getUncompactedValue(
            compactedOracleBlockNumbers,
            index,
            COMPACTED_BLOCK_NUMBER_BIT_LENGTH,
            COMPACTED_BLOCK_NUMBER_BITMASK
        );

        if (blockNumber == 0) { revert EmptyBlockNumber(); }

        return blockNumber;
    }
}
