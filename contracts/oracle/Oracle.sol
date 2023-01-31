// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../role/RoleModule.sol";

import "./OracleStore.sol";
import "./OracleUtils.sol";
import "./IPriceFeed.sol";
import "../price/Price.sol";

import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";

import "../utils/Bits.sol";
import "../utils/Array.sol";
import "../utils/Precision.sol";
import "../utils/Cast.sol";

// @title Oracle
// @dev Contract to validate and store signed values
contract Oracle is RoleModule {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;
    using Price for Price.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // @dev SetPricesCache struct used in setPrices to avoid stack too deep errors
    // @param prevMinOracleBlockNumber the previous oracle block number of the loop
    // @param priceIndex the current price index to retrieve from compactedMinPrices and compactedMaxPrices
    // to construct the minPrices and maxPrices array
    // @param signatureIndex the current signature index to retrieve from the signatures array
    // @param maxPriceAge the max allowed age of price values
    // @param minPriceIndex the index of the min price in minPrices for the current signer
    // @param maxPriceIndex the index of the max price in maxPrices for the current signer
    // @param minPrices the min prices
    // @param maxPrices the max prices
    struct SetPricesCache {
        OracleUtils.ReportInfo info;
        uint256 minBlockConfirmations;
        uint256 maxPriceAge;
        uint256 prevMinOracleBlockNumber;
        uint256 priceIndex;
        uint256 signatureIndex;
        uint256 minPriceIndex;
        uint256 maxPriceIndex;
        uint256[] minPrices;
        uint256[] maxPrices;
    }

    bytes32 public immutable SALT;

    uint256 public constant SIGNER_INDEX_LENGTH = 16;
    // subtract 1 as the first slot is used to store number of signers
    uint256 public constant MAX_SIGNERS = 256 / SIGNER_INDEX_LENGTH - 1;
    // signer indexes are recorded in a signerIndexFlags uint256 value to check for uniqueness
    uint256 public constant MAX_SIGNER_INDEX = 256;

    OracleStore public oracleStore;

    // tokensWithPrices stores the tokens with prices that have been set
    // this is used in clearAllPrices to help ensure that all token prices
    // set in setPrices are cleared after use
    EnumerableSet.AddressSet internal tokensWithPrices;
    // prices for the same token can be sent multiple times in one txn
    // the prices can be for different block numbers
    // the first occurrence of the token's price will be stored in primaryPrices
    // the second occurrence will be stored in secondaryPrices
    mapping(address => Price.Props) public primaryPrices;
    mapping(address => Price.Props) public secondaryPrices;
    // customPrices can be used to store custom price values
    // these prices will be cleared in clearAllPrices
    mapping(address => Price.Props) public customPrices;

    error EmptyTokens();
    error InvalidBlockNumber(uint256 blockNumber);
    error InvalidMinMaxBlockNumber(uint256 minOracleBlockNumber, uint256 maxOracleBlockNumber);
    error MaxPriceAgeExceeded(uint256 oracleTimestamp);
    error MinOracleSigners(uint256 oracleSigners, uint256 minOracleSigners);
    error MaxOracleSigners(uint256 oracleSigners, uint256 maxOracleSigners);
    error BlockNumbersNotSorted(uint256 minOracleBlockNumber, uint256 prevMinOracleBlockNumber);
    error MinPricesNotSorted(address token, uint256 price, uint256 prevPrice);
    error MaxPricesNotSorted(address token, uint256 price, uint256 prevPrice);
    error EmptyPriceFeedMultiplier(address token);
    error EmptyFeedPrice(address token);
    error MaxSignerIndex(uint256 signerIndex, uint256 maxSignerIndex);
    error DuplicateSigner(uint256 signerIndex);
    error InvalidOraclePrice(address token);
    error InvalidSignerMinMaxPrice(uint256 minPrice, uint256 maxPrice);
    error InvalidMedianMinMaxPrice(uint256 minPrice, uint256 maxPrice);
    error NonEmptyTokensWithPrices(uint256 tokensWithPricesLength);
    error EmptyPriceFeed(address token);
    error PriceAlreadySet(address token, uint256 minPrice, uint256 maxPrice);

    constructor(
        RoleStore _roleStore,
        OracleStore _oracleStore
    ) RoleModule(_roleStore) {
        oracleStore = _oracleStore;

        // sign prices with only the chainid and oracle name so that there is
        // less config required in the oracle nodes
        SALT = keccak256(abi.encode(block.chainid, "xget-oracle-v1"));
    }

    // @dev validate and store signed prices
    //
    // The setPrices function is used to set the prices of tokens in the Oracle contract.
    // It accepts an array of tokens and a signerInfo parameter. The signerInfo parameter
    // contains information about the signers that have signed the transaction to set the prices.
    // The first 16 bits of the signerInfo parameter contain the number of signers, and the following
    // bits contain the index of each signer in the oracleStore. The function checks that the number
    // of signers is greater than or equal to the minimum number of signers required, and that
    // the signer indices are unique and within the maximum signer index. The function then calls
    // _setPrices and _setPricesFromPriceFeeds to set the prices of the tokens.
    //
    // Oracle prices are signed as a value together with a precision, this allows
    // prices to be compacted as uint32 values.
    //
    // The signed prices represent the price of one unit of the token using a value
    // with 30 decimals of precision.
    //
    // Representing the prices in this way allows for conversions between token amounts
    // and fiat values to be simplified, e.g. to calculate the fiat value of a given
    // number of tokens the calculation would just be: `token amount * oracle price`,
    // to calculate the token amount for a fiat value it would be: `fiat value / oracle price`.
    //
    // The trade-off of this simplicity in calculation is that tokens with a small USD
    // price and a lot of decimals may have precision issues it is also possible that
    // a token's price changes significantly and results in requiring higher precision.
    //
    // ## Example 1
    //
    // The price of ETH is 5000, and ETH has 18 decimals.
    //
    // The price of one unit of ETH is `5000 / (10 ^ 18), 5 * (10 ^ -15)`.
    //
    // To handle the decimals, multiply the value by `(10 ^ 30)`.
    //
    // Price would be stored as `5000 / (10 ^ 18) * (10 ^ 30) => 5000 * (10 ^ 12)`.
    //
    // For gas optimization, these prices are sent to the oracle in the form of a uint8
    // decimal multiplier value and uint32 price value.
    //
    // If the decimal multiplier value is set to 8, the uint32 value would be `5000 * (10 ^ 12) / (10 ^ 8) => 5000 * (10 ^ 4)`.
    //
    // With this config, ETH prices can have a maximum value of `(2 ^ 32) / (10 ^ 4) => 4,294,967,296 / (10 ^ 4) => 429,496.7296` with 4 decimals of precision.
    //
    // ## Example 2
    //
    // The price of BTC is 60,000, and BTC has 8 decimals.
    //
    // The price of one unit of BTC is `60,000 / (10 ^ 8), 6 * (10 ^ -4)`.
    //
    // Price would be stored as `60,000 / (10 ^ 8) * (10 ^ 30) => 6 * (10 ^ 26) => 60,000 * (10 ^ 22)`.
    //
    // BTC prices maximum value: `(2 ^ 64) / (10 ^ 2) => 4,294,967,296 / (10 ^ 2) => 42,949,672.96`.
    //
    // Decimals of precision: 2.
    //
    // ## Example 3
    //
    // The price of USDC is 1, and USDC has 6 decimals.
    //
    // The price of one unit of USDC is `1 / (10 ^ 6), 1 * (10 ^ -6)`.
    //
    // Price would be stored as `1 / (10 ^ 6) * (10 ^ 30) => 1 * (10 ^ 24)`.
    //
    // USDC prices maximum value: `(2 ^ 64) / (10 ^ 6) => 4,294,967,296 / (10 ^ 6) => 4294.967296`.
    //
    // Decimals of precision: 6.
    //
    // ## Example 4
    //
    // The price of DG is 0.00000001, and DG has 18 decimals.
    //
    // The price of one unit of DG is `0.00000001 / (10 ^ 18), 1 * (10 ^ -26)`.
    //
    // Price would be stored as `1 * (10 ^ -26) * (10 ^ 30) => 1 * (10 ^ 3)`.
    //
    // DG prices maximum value: `(2 ^ 64) / (10 ^ 11) => 4,294,967,296 / (10 ^ 11) => 0.04294967296`.
    //
    // Decimals of precision: 11.
    //
    // ## Decimal Multiplier
    //
    // The formula to calculate what the decimal multiplier value should be set to:
    //
    // Decimals: 30 - (token decimals) - (number of decimals desired for precision)
    //
    // - ETH: 30 - 18 - 4 => 8
    // - BTC: 30 - 8 - 2 => 20
    // - USDC: 30 - 6 - 6 => 18
    // - DG: 30 - 18 - 11 => 1
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param params OracleUtils.SetPricesParams
    function setPrices(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OracleUtils.SetPricesParams memory params
    ) external onlyController {
        if (tokensWithPrices.length() != 0) {
            revert NonEmptyTokensWithPrices(tokensWithPrices.length());
        }

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
            eventEmitter,
            signers,
            params
        );

        _setPricesFromPriceFeeds(dataStore, eventEmitter, params.priceFeedTokens);
    }

    // @dev set the primary price
    // @param token the token to set the price for
    // @param price the price value to set to
    function setPrimaryPrice(address token, Price.Props memory price) external onlyController {
        primaryPrices[token] = price;
    }

    // @dev set the secondary price
    // @param token the token to set the price for
    // @param price the price value to set to
    function setSecondaryPrice(address token, Price.Props memory price) external onlyController {
        secondaryPrices[token] = price;
    }

    // @dev set a custom price
    // @param token the token to set the price for
    // @param price the price value to set to
    function setCustomPrice(address token, Price.Props memory price) external onlyController {
        customPrices[token] = price;
    }

    // @dev clear all prices
    function clearAllPrices() external onlyController {
        uint256 length = tokensWithPrices.length();
        for (uint256 i = 0; i < length; i++) {
            address token = tokensWithPrices.at(0);
            delete primaryPrices[token];
            delete secondaryPrices[token];
            delete customPrices[token];
            tokensWithPrices.remove(token);
        }
    }

    // @dev get the length of tokensWithPrices
    // @return the length of tokensWithPrices
    function getTokensWithPricesCount() external view returns (uint256) {
        return tokensWithPrices.length();
    }

    // @dev get the tokens of tokensWithPrices for the specified indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the tokens of tokensWithPrices for the specified indexes
    function getTokensWithPrices(uint256 start, uint256 end) external view returns (address[] memory) {
        return tokensWithPrices.valuesAt(start, end);
    }

    // @dev get the primary price of a token
    // @param token the token to get the price for
    // @return the primary price of a token
    function getPrimaryPrice(address token) external view returns (Price.Props memory) {
        if (token == address(0)) { return Price.Props(0, 0); }

        Price.Props memory price = primaryPrices[token];
        if (price.isEmpty()) {
            revert OracleUtils.EmptyPrimaryPrice(token);
        }

        return price;
    }

    // @dev get the secondary price of a token
    // @param token the token to get the price for
    // @return the secondary price of a token
    function getSecondaryPrice(address token) external view returns (Price.Props memory) {
        if (token == address(0)) { return Price.Props(0, 0); }

        Price.Props memory price = secondaryPrices[token];
        if (price.isEmpty()) {
            revert OracleUtils.EmptySecondaryPrice(token);
        }

        return price;
    }

    // @dev get the latest price of a token
    // @param token the token to get the price for
    // @return the latest price of a token
    function getLatestPrice(address token) external view returns (Price.Props memory) {
        if (token == address(0)) { return Price.Props(0, 0); }

        Price.Props memory secondaryPrice = secondaryPrices[token];

        if (!secondaryPrice.isEmpty()) {
            return secondaryPrice;
        }

        Price.Props memory primaryPrice = primaryPrices[token];
        if (!primaryPrice.isEmpty()) {
            return primaryPrice;
        }

        revert OracleUtils.EmptyLatestPrice(token);
    }

    // @dev get the custom price of a token
    // @param token the token to get the price for
    // @return the custom price of a token
    function getCustomPrice(address token) external view returns (Price.Props memory) {
        Price.Props memory price = customPrices[token];
        if (price.isEmpty()) {
            revert OracleUtils.EmptyCustomPrice(token);
        }
        return price;
    }

    // @dev get the price feed address for a token
    // @param dataStore DataStore
    // @param token the token to get the price feed for
    // @return the price feed for the token
    function getPriceFeed(DataStore dataStore, address token) public view returns (IPriceFeed) {
        address priceFeedAddress = dataStore.getAddress(Keys.priceFeedKey(token));
        if (priceFeedAddress == address(0)) {
            revert EmptyPriceFeed(token);
        }

        return IPriceFeed(priceFeedAddress);
    }

    // @dev get the stable price of a token
    // @param dataStore DataStore
    // @param token the token to get the price for
    // @return the stable price of the token
    function getStablePrice(DataStore dataStore, address token) public view returns (uint256) {
        return dataStore.getUint(Keys.stablePriceKey(token));
    }

    // @dev get the multiplier value to convert the external price feed price to the price of 1 unit of the token
    // represented with 30 decimals
    // for example, if USDC has 6 decimals and a price of 1 USD, one unit of USDC would have a price of
    // 1 / (10 ^ 6) * (10 ^ 30) => 1 * (10 ^ 24)
    // if the external price feed has 8 decimals, the price feed price would be 1 * (10 ^ 8)
    // in this case the priceFeedMultiplier should be 10 ^ 46
    // the conversion of the price feed price would be 1 * (10 ^ 8) * (10 ^ 46) / (10 ^ 30) => 1 * (10 ^ 24)
    // formula for decimals for price feed multiplier: 60 - (external price feed decimals) - (token decimals)
    //
    // @param dataStore DataStore
    // @param token the token to get the price feed multiplier for
    // @return the price feed multipler
    function getPriceFeedMultiplier(DataStore dataStore, address token) public view returns (uint256) {
        uint256 multiplier = dataStore.getUint(Keys.priceFeedMultiplierKey(token));

        if (multiplier == 0) {
            revert EmptyPriceFeedMultiplier(token);
        }

        return multiplier;
    }

    // @dev validate and set prices
    // The _setPrices() function is a helper function that is called by the
    // setPrices() function. It takes in several parameters: a DataStore contract
    // instance, an EventEmitter contract instance, an array of signers, and an
    // OracleUtils.SetPricesParams struct containing information about the tokens
    // and their prices.
    // The function first initializes a SetPricesCache struct to store some temporary
    // values that will be used later in the function. It then loops through the array
    // of tokens and sets the corresponding values in the cache struct. For each token,
    // the function also loops through the array of signers and validates the signatures
    // for the min and max prices for that token. If the signatures are valid, the
    // function calculates the median min and max prices and sets them in the DataStore
    // contract.
    // Finally, the function emits an event to signal that the prices have been set.
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param signers the signers of the prices
    // @param params OracleUtils.SetPricesParams
    function _setPrices(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address[] memory signers,
        OracleUtils.SetPricesParams memory params
    ) internal {
        SetPricesCache memory cache;
        cache.minBlockConfirmations = dataStore.getUint(Keys.MIN_ORACLE_BLOCK_CONFIRMATIONS);
        cache.maxPriceAge = dataStore.getUint(Keys.MAX_ORACLE_PRICE_AGE);

        for (uint256 i = 0; i < params.tokens.length; i++) {
            cache.info.minOracleBlockNumber = OracleUtils.getUncompactedOracleBlockNumber(params.compactedMinOracleBlockNumbers, i);
            cache.info.maxOracleBlockNumber = OracleUtils.getUncompactedOracleBlockNumber(params.compactedMaxOracleBlockNumbers, i);

            if (cache.info.minOracleBlockNumber > cache.info.maxOracleBlockNumber) {
                revert InvalidMinMaxBlockNumber(cache.info.minOracleBlockNumber, cache.info.maxOracleBlockNumber);
            }

            cache.info.oracleTimestamp = OracleUtils.getUncompactedOracleTimestamp(params.compactedOracleTimestamps, i);

            if (cache.info.minOracleBlockNumber > Chain.currentBlockNumber()) {
                revert InvalidBlockNumber(cache.info.minOracleBlockNumber);
            }

            if (cache.info.oracleTimestamp + cache.maxPriceAge < Chain.currentTimestamp()) {
                revert MaxPriceAgeExceeded(cache.info.oracleTimestamp);
            }

            // block numbers must be in ascending order
            if (cache.info.minOracleBlockNumber < cache.prevMinOracleBlockNumber) {
                revert BlockNumbersNotSorted(cache.info.minOracleBlockNumber, cache.prevMinOracleBlockNumber);
            }
            cache.prevMinOracleBlockNumber = cache.info.minOracleBlockNumber;

            cache.info.blockHash = bytes32(0);
            if (Chain.currentBlockNumber() - cache.info.minOracleBlockNumber <= cache.minBlockConfirmations) {
                cache.info.blockHash = Chain.getBlockHash(cache.info.minOracleBlockNumber);
            }

            cache.info.token = params.tokens[i];
            cache.info.precision = 10 ** OracleUtils.getUncompactedDecimal(params.compactedDecimals, i);
            cache.info.tokenOracleType = dataStore.getBytes32(Keys.oracleTypeKey(cache.info.token));

            cache.minPrices = new uint256[](signers.length);
            cache.maxPrices = new uint256[](signers.length);

            for (uint256 j = 0; j < signers.length; j++) {
                cache.priceIndex = i * signers.length + j;
                cache.minPrices[j] = OracleUtils.getUncompactedPrice(params.compactedMinPrices, cache.priceIndex);
                cache.maxPrices[j] = OracleUtils.getUncompactedPrice(params.compactedMaxPrices, cache.priceIndex);

                if (j == 0) { continue; }

                // validate that minPrices are sorted in ascending order
                if (cache.minPrices[j - 1] > cache.minPrices[j]) {
                    revert MinPricesNotSorted(cache.info.token, cache.minPrices[j], cache.minPrices[j - 1]);
                }

                // validate that maxPrices are sorted in ascending order
                if (cache.maxPrices[j - 1] > cache.maxPrices[j]) {
                    revert MaxPricesNotSorted(cache.info.token, cache.maxPrices[j], cache.maxPrices[j - 1]);
                }
            }

            for (uint256 j = 0; j < signers.length; j++) {
                cache.signatureIndex = i * signers.length + j;
                cache.minPriceIndex = OracleUtils.getUncompactedPriceIndex(params.compactedMinPricesIndexes, cache.signatureIndex);
                cache.maxPriceIndex = OracleUtils.getUncompactedPriceIndex(params.compactedMaxPricesIndexes, cache.signatureIndex);

                if (cache.signatureIndex >= params.signatures.length) {
                    Array.revertArrayOutOfBounds(params.signatures, cache.signatureIndex, "signatures");
                }

                if (cache.minPriceIndex >= cache.minPrices.length) {
                    Array.revertArrayOutOfBounds(cache.minPrices, cache.minPriceIndex, "minPrices");
                }

                if (cache.maxPriceIndex >= cache.maxPrices.length) {
                    Array.revertArrayOutOfBounds(cache.maxPrices, cache.maxPriceIndex, "maxPrices");
                }

                cache.info.minPrice = cache.minPrices[cache.minPriceIndex];
                cache.info.maxPrice = cache.maxPrices[cache.maxPriceIndex];

                if (cache.info.minPrice > cache.info.maxPrice) {
                    revert InvalidSignerMinMaxPrice(cache.info.minPrice, cache.info.maxPrice);
                }

                OracleUtils.validateSigner(
                    SALT,
                    cache.info,
                    params.signatures[cache.signatureIndex],
                    signers[j]
                );
            }

            uint256 medianMinPrice = Array.getMedian(cache.minPrices) * cache.info.precision;
            uint256 medianMaxPrice = Array.getMedian(cache.maxPrices) * cache.info.precision;

            if (medianMinPrice == 0 || medianMaxPrice == 0) {
                revert InvalidOraclePrice(cache.info.token);
            }

            if (medianMinPrice > medianMaxPrice) {
                revert InvalidMedianMinMaxPrice(medianMinPrice, medianMaxPrice);
            }

            if (primaryPrices[cache.info.token].isEmpty()) {
                emitOraclePriceUpdated(eventEmitter, cache.info.token, medianMinPrice, medianMaxPrice, true, false);

                primaryPrices[cache.info.token] = Price.Props(
                    medianMinPrice,
                    medianMaxPrice
                );
            } else {
                emitOraclePriceUpdated(eventEmitter, cache.info.token, medianMinPrice, medianMaxPrice, false, false);

                secondaryPrices[cache.info.token] = Price.Props(
                    medianMinPrice,
                    medianMaxPrice
                );
            }

            tokensWithPrices.add(cache.info.token);
        }
    }

    // @dev set prices using external price feeds to save costs for tokens with stable prices
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param priceFeedTokens the tokens to set the prices using the price feeds for
    function _setPricesFromPriceFeeds(DataStore dataStore, EventEmitter eventEmitter, address[] memory priceFeedTokens) internal {
        for (uint256 i = 0; i < priceFeedTokens.length; i++) {
            address token = priceFeedTokens[i];

            if (!primaryPrices[token].isEmpty()) {
                revert PriceAlreadySet(token, primaryPrices[token].min, primaryPrices[token].max);
            }

            IPriceFeed priceFeed = getPriceFeed(dataStore, token);

            (
                /* uint80 roundID */,
                int256 _price,
                /* uint256 startedAt */,
                /* uint256 timestamp */,
                /* uint80 answeredInRound */
            ) = priceFeed.latestRoundData();

            uint256 price = SafeCast.toUint256(_price);
            uint256 precision = getPriceFeedMultiplier(dataStore, token);

            price = price * precision / Precision.FLOAT_PRECISION;

            if (price == 0) {
                revert EmptyFeedPrice(token);
            }

            uint256 stablePrice = getStablePrice(dataStore, token);

            Price.Props memory priceProps;

            if (stablePrice > 0) {
                priceProps = Price.Props(
                    price < stablePrice ? price : stablePrice,
                    price < stablePrice ? stablePrice : price
                );
            } else {
                priceProps = Price.Props(
                    price,
                    price
                );
            }

            primaryPrices[token] = priceProps;

            tokensWithPrices.add(token);

            emitOraclePriceUpdated(eventEmitter, token, priceProps.min, priceProps.max, true, true);
        }
    }

    function emitOraclePriceUpdated(
        EventEmitter eventEmitter,
        address token,
        uint256 minPrice,
        uint256 maxPrice,
        bool isPrimary,
        bool isPriceFeed
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "token", token);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "minPrice", minPrice);
        eventData.uintItems.setItem(1, "maxPrice", maxPrice);

        eventData.boolItems.initItems(2);
        eventData.boolItems.setItem(0, "isPrimary", isPrimary);
        eventData.boolItems.setItem(1, "isPriceFeed", isPriceFeed);

        eventEmitter.emitEventLog1(
            "InsufficientFundingFeePayment",
            Cast.toBytes32(token),
            eventData
        );

    }
}
