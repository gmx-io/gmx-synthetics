// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Bits.sol";

library OracleUtils {
    struct SetPricesParams {
        uint256 signerInfo;
        address[] tokens;
        uint256[] compactedOracleBlockNumbers;
        uint256[] compactedPrices;
        bytes[] signatures;
        address[] priceFeedTokens;
    }

    // compacted prices have a length of 32 bits
    uint256 public constant COMPACTED_PRICE_LENGTH = 32;
    uint256 public constant COMPACTED_PRICE_BITMASK = Bits.BITMASK_32;
    // one uint256 can store 8 prices
    uint256 public constant COMPACTED_PRICES_PER_SLOT = 256 / COMPACTED_PRICE_LENGTH;
    // compacted block numbers have a length of 64 bits
    uint256 public constant COMPACTED_BLOCK_NUMBER_LENGTH = 64;
    uint256 public constant COMPACTED_BLOCK_NUMBER_BITMASK = Bits.BITMASK_64;
    // one uint256 can store 4 block numbers
    uint256 public constant COMPACTED_BLOCK_NUMBERS_PER_SLOT = 256 / COMPACTED_BLOCK_NUMBER_LENGTH;

    error EmptyPrice();
    error EmptyBlockNumber();

    function getUncompactedPrice(uint256[] memory compactedPrices, uint256 index) internal pure returns (uint256) {
        uint256 slotIndex = index / COMPACTED_PRICES_PER_SLOT;
        uint256 priceBits = compactedPrices[slotIndex];
        uint256 offset = (index - slotIndex * COMPACTED_PRICES_PER_SLOT) * COMPACTED_PRICE_LENGTH;

        uint256 price = (priceBits >> offset) & COMPACTED_PRICE_BITMASK;
        if (price == 0) { revert EmptyPrice(); }

        return price;
    }

    function getUncompactedOracleBlockNumbers(uint256[] memory compactedOracleBlockNumbers, uint256 length) internal pure returns (uint256[] memory) {
        uint256[] memory blockNumbers = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            blockNumbers[i] = getUncompactedOracleBlockNumber(compactedOracleBlockNumbers, i);
        }

        return blockNumbers;
    }

    function getUncompactedOracleBlockNumber(uint256[] memory compactedOracleBlockNumbers, uint256 index) internal pure returns (uint256) {
        uint256 slotIndex = index / COMPACTED_BLOCK_NUMBERS_PER_SLOT;
        uint256 blockNumberBits = compactedOracleBlockNumbers[slotIndex];
        uint256 offset = (index - slotIndex * COMPACTED_BLOCK_NUMBERS_PER_SLOT) * COMPACTED_BLOCK_NUMBER_LENGTH;

        uint256 blockNumber = (blockNumberBits >> offset) & COMPACTED_BLOCK_NUMBER_BITMASK;
        if (blockNumber == 0) { revert EmptyBlockNumber(); }

        return blockNumber;
    }
}
