// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../role/RoleModule.sol";

import "./OracleStore.sol";
import "./OracleUtils.sol";
import "./IPriceFeed.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "../utils/Bits.sol";
import "../utils/Array.sol";
import "../utils/Precision.sol";

contract Oracle is RoleModule {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;

    struct _SetPricesCache {
        uint256 minBlockConfirmations;
        uint256 prevOracleBlockNumber;
        uint256 oracleBlockNumber;
        bytes32 blockHash;
        address token;
        uint256 prevPrice;
        uint256 priceAndSignatureIndex;
        uint256 maxBlockAge;
    }

    bytes32 public immutable SALT;

    uint256 public constant SIGNER_INDEX_LENGTH = 16;
    // subtract 1 as the first slot is used to store number of signers
    uint256 public constant MAX_SIGNERS = 256 / SIGNER_INDEX_LENGTH - 1;
    // signer indexes are recorded in a signerIndexFlags uint256 value to check for uniqueness
    uint256 public constant MAX_SIGNER_INDEX = 256;

    OracleStore public oracleStore;

    // tempTokens stores the tokens with prices that have been set
    // this is used in clearTempPrices to help ensure that all token prices
    // set in setPrices are cleared after use
    EnumerableSet.AddressSet internal tempTokens;
    // prices for the same token can be sent multiple times in one txn
    // the prices can be for different block numbers
    // the first occurrence of the token's price will be stored in primaryPrices
    // the second occurrence will be stored in secondaryPrices
    mapping(address => uint256) public primaryPrices;
    mapping(address => uint256) public secondaryPrices;

    error EmptyTokens();
    error InvalidBlockNumber(uint256 blockNumber);
    error MaxBlockAgeExceeded(uint256 blockNumber);
    error MinOracleSigners(uint256 oracleSigners, uint256 minOracleSigners);
    error MaxOracleSigners(uint256 oracleSigners, uint256 maxOracleSigners);
    error PricesNotSorted(uint256 price, uint256 prevPrice);
    error BlockNumbersNotSorted(uint256 oracleBlockNumber, uint256 prevOracleBlockNumber);
    error InvalidSignature(address recoveredSigner, address expectedSigner);
    error MaxSignerIndex(uint256 signerIndex, uint256 maxSignerIndex);
    error DuplicateSigner(uint256 signerIndex);
    error EmptyPrimaryPrice(address token);
    error EmptySecondaryPrice(address token);

    constructor(
        RoleStore _roleStore,
        OracleStore _oracleStore
    ) RoleModule(_roleStore) {
        oracleStore = _oracleStore;

        // sign prices with only the chainid and oracle name so that there is
        // less config required in the oracle nodes
        SALT = keccak256(abi.encodePacked(block.chainid, "xget-oracle-v1"));
    }

    function setPrices(DataStore dataStore, OracleUtils.SetPricesParams memory params) external onlyController {
        require(tempTokens.length() == 0, "Oracle: tempTokens not cleared");

        if (params.tokens.length == 0) { revert EmptyTokens(); }

        // first 16 bits of signer info contains the number of signers
        address[] memory signers = new address[](params.signerInfo & Bits.BITMASK_16);

        if (signers.length < dataStore.getUint(Keys.MIN_ORACLE_SIGNERS)) {
            revert MinOracleSigners(signers.length, dataStore.getUint(Keys.MIN_ORACLE_SIGNERS));
        }

        if (signers.length > MAX_SIGNERS) {
            revert MaxOracleSigners(signers.length, MAX_SIGNERS);
        }

        uint256 signerIndexFlags;

        for (uint256 i = 0; i < signers.length; i++) {
            uint256 signerIndex = params.signerInfo >> (16 + 16 * i) & Bits.BITMASK_16;

            if (signerIndex >= MAX_SIGNER_INDEX) {
                revert MaxSignerIndex(signerIndex, MAX_SIGNER_INDEX);
            }

            uint256 signerIndexBit = 1 << signerIndex;

            if (signerIndexFlags & signerIndexBit != 0) {
                revert DuplicateSigner(signerIndex);
            }

            signerIndexFlags = signerIndexFlags | signerIndexBit;

            signers[i] = oracleStore.getSigner(signerIndex);
        }

        _setPrices(
            dataStore,
            signers,
            params.tokens,
            params.compactedOracleBlockNumbers,
            params.compactedPrices,
            params.signatures
        );

        _setPricesFromPriceFeeds(dataStore, params.priceFeedTokens);
    }

    function setSecondaryPrice(address token, uint256 price) external onlyController {
        secondaryPrices[token] = price;
    }

    function clearTempPrices() external onlyController {
        uint256 length = tempTokens.length();
        for (uint256 i = 0; i < length; i++) {
            address token = tempTokens.at(0);
            delete primaryPrices[token];
            delete secondaryPrices[token];
            tempTokens.remove(token);
        }
    }

    function getTempTokensCount() external view returns (uint256) {
        return tempTokens.length();
    }

    function getTempTokens(uint256 start, uint256 end) external view returns (address[] memory) {
        return tempTokens.valuesAt(start, end);
    }

    function getPrimaryPrice(address token) external view returns (uint256) {
        uint256 price = primaryPrices[token];
        if (price == 0) { revert EmptyPrimaryPrice(token); }
        return price;
    }

    function getSecondaryPrice(address token) external view returns (uint256) {
        uint256 price = secondaryPrices[token];
        if (price == 0) { revert EmptySecondaryPrice(token); }
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
    // example 1, the price of ETH is 5000, and ETH has 18 decimals
    // the price of one unit of ETH is 5000 / (10 ** 18), 5 * (10 ** -15)
    // to represent the price with 30 decimals, store the price as
    // 5000 / (10 ** 18) * (10 ** 30) => 5 ** (10 ** 15) => 5000 * (10 ** 12)
    // oracle precision for ETH can be set to (10 ** 8) to allow for prices with
    // a maximum value of (2 ** 32) / (10 ** 4) => 4,294,967,296 / (10 ** 4) => 429,496
    // and up to 4 decimals of precision
    //
    // example 2, the price of BTC is 60,000, and BTC has 8 decimals
    // the price of one unit of BTC is 60,000 / (10 ** 8), 6 * (10 ** -4)
    // to represent the price with 30 decimals, store the price as
    // 60,000 / (10 ** 8) * (10 ** 30) => 6 * (10 ** 26) => 60,000 * (10 ** 22)
    // oracle precision for BTC can be set to (10 ** 20) to allow for prices with
    // a maximum value of (2 ** 32) / (10 ** 2) => 4,294,967,296 / (10 ** 2) => 42,949,672
    // and up to 2 decimals of precision
    //
    // example 3, the price of USDC is 1, and USDC has 6 decimals
    // the price of one unit of USDC is 1 / (10 ** 6), 1 * (10 ** -6)
    // to represent the price with 30 decimals, store the price as
    // 1 / (10 ** 6) * (10 ** 30) => 1 ** (10 ** 24)
    // oracle precision for USDC can be set to (10 ** 18) to allow for prices with
    // a maximum value of (2 ** 32) / (10 ** 6) => 4,294,967,296 / (10 ** 6) => 4294
    // and up to 6 decimals of precision
    //
    // example 4, the price of DG is 0.00000001, and DG has 18 decimals
    // the price of one unit of DG is 0.00000001 / (10 ** 18), 1 * (10 ** -26)
    // to represent the price with 30 decimals, store the price as
    // 1 * (10 ** -26) * (10 ** 30) => 10,000 => 1 * (10 ** 3)
    // oracle precision for DG can be set to (10 ** 1) to allow for prices with
    // a maximum value of (2 ** 32) / (10 ** 1) => 4,294,967,296 / (10 ** 1) => 429,496,729.6
    // and up to 11 decimals of precision
    //
    // formula to calculate what the precision value should be set to:
    // decimals: 30 - (token decimals) - (number of decimals desired for precision)
    // ETH: 30 - 18 - 4 => 8, precision: 10 ** 8
    // BTC: 30 - 8 - 2 => 20, precision: 10 ** 20
    // USDC: 30 - 6 - 6 => 18, precision: 10 ** 18
    // DG: 30 - 18 - 11 => 1, precision: 10 ** 1
    function getPrecision(DataStore dataStore, address token) public view returns (uint256) {
        return dataStore.getUint(Keys.oraclePrecisionKey(token));
    }

    function _setPrices(
        DataStore dataStore,
        address[] memory signers,
        address[] memory tokens,
        uint256[] memory compactedOracleBlockNumbers,
        uint256[] memory compactedPrices,
        bytes[] memory signatures
    ) internal {
        _SetPricesCache memory cache;
        cache.minBlockConfirmations = dataStore.getUint(Keys.MIN_ORACLE_BLOCK_CONFIRMATIONS);
        cache.maxBlockAge = dataStore.getUint(Keys.MAX_ORACLE_BLOCK_AGE);

        for (uint256 i = 0; i < tokens.length; i++) {
            cache.oracleBlockNumber = OracleUtils.getUncompactedOracleBlockNumber(compactedOracleBlockNumbers, i);

            if (cache.oracleBlockNumber > block.number) {
                revert InvalidBlockNumber(cache.oracleBlockNumber);
            }

            if (cache.oracleBlockNumber + cache.maxBlockAge < block.number) {
                revert MaxBlockAgeExceeded(cache.oracleBlockNumber);
            }

            // block numbers must be in ascending order
            if (cache.oracleBlockNumber < cache.prevOracleBlockNumber) {
                revert BlockNumbersNotSorted(cache.oracleBlockNumber, cache.prevOracleBlockNumber);
            }
            cache.prevOracleBlockNumber = cache.oracleBlockNumber;

            cache.blockHash = bytes32(0);
            if (block.number - cache.oracleBlockNumber <= cache.minBlockConfirmations) {
                cache.blockHash = blockhash(cache.oracleBlockNumber);
            }

            cache.token = tokens[i];
            cache.prevPrice = 0;

            uint256[] memory prices = new uint256[](signers.length);
            for (uint256 j = 0; j < signers.length; j++) {
                cache.priceAndSignatureIndex = i * signers.length + j;

                uint256 price = OracleUtils.getUncompactedPrice(compactedPrices, cache.priceAndSignatureIndex);

                // prices must be in ascending order
                if (price < cache.prevPrice) { revert PricesNotSorted(price, cache.prevPrice); }
                cache.prevPrice = price;

                _validateSigner(
                    cache.oracleBlockNumber,
                    cache.blockHash,
                    cache.token,
                    price,
                    signatures[cache.priceAndSignatureIndex],
                    signers[j]
                );

                prices[j] = price;
            }

            uint256 medianPrice = Array.getMedian(prices) * getPrecision(dataStore, cache.token);
            if (primaryPrices[cache.token] != 0) {
                secondaryPrices[cache.token] = medianPrice;
            } else {
                primaryPrices[cache.token] = medianPrice;
            }
            tempTokens.add(cache.token);
        }
    }

    // to save costs for tokens with stable prices
    function _setPricesFromPriceFeeds(DataStore dataStore, address[] memory priceFeedTokens) internal {
        for (uint256 i = 0; i < priceFeedTokens.length; i++) {
            address token = priceFeedTokens[i];

            require(primaryPrices[token] == 0, "Oracle: price already set");

            address priceFeedAddress = dataStore.getAddress(Keys.priceFeedKey(token));
            require(priceFeedAddress != address(0), "Oracle: invalid price feed");

            IPriceFeed priceFeed = IPriceFeed(priceFeedAddress);
            (
                /* uint80 roundID */,
                int256 _price,
                /* uint256 startedAt */,
                /* uint256 timeStamp */,
                /* uint80 answeredInRound */
            ) = priceFeed.latestRoundData();

            uint256 price = SafeCast.toUint256(_price);
            price = price * dataStore.getUint(Keys.priceFeedPrecisionKey(token)) / Precision.FLOAT_PRECISION;

            require(price != 0, "Oracle: invalid price");

            primaryPrices[token] = price;
            tempTokens.add(token);
        }
    }

    function _validateSigner(
        uint256 oracleBlockNumber,
        bytes32 blockHash,
        address token,
        uint256 price,
        bytes memory signature,
        address expectedSigner
    ) internal view {
        bytes32 digest = ECDSA.toEthSignedMessageHash(
            keccak256(abi.encodePacked(SALT, oracleBlockNumber, blockHash, token, price))
        );

        address recoveredSigner = ECDSA.recover(digest, signature);
        if (recoveredSigner != expectedSigner) {
            revert InvalidSignature(recoveredSigner, expectedSigner);
        }
    }
}
