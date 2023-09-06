// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../role/RoleModule.sol";

import "./OracleStore.sol";
import "./OracleUtils.sol";
import "./IPriceFeed.sol";
import "./IRealtimeFeedVerifier.sol";
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
import "../utils/Uint256Mask.sol";

// @title Oracle
// @dev Contract to validate and store signed values
// Some calculations e.g. calculating the size in tokens for a position
// may not work with zero / negative prices
// as a result, zero / negative prices are considered empty / invalid
// A market may need to be manually settled in this case
contract Oracle is RoleModule {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;
    using Price for Price.Props;
    using Uint256Mask for Uint256Mask.Mask;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    struct ValidatedPrice {
        address token;
        uint256 min;
        uint256 max;
        uint256 timestamp;
        uint256 minBlockNumber;
        uint256 maxBlockNumber;
    }

    // @dev SetPricesCache struct used in setPrices to avoid stack too deep errors
    struct SetPricesCache {
        OracleUtils.ReportInfo info;
        uint256 minBlockConfirmations;
        uint256 maxPriceAge;
        uint256 maxRefPriceDeviationFactor;
        uint256 prevMinOracleBlockNumber;
        ValidatedPrice[] validatedPrices;
    }

    struct SetPricesInnerCache {
        bytes32 feedId;
        uint256 priceIndex;
        uint256 signatureIndex;
        uint256 minPriceIndex;
        uint256 maxPriceIndex;
        uint256[] minPrices;
        uint256[] maxPrices;
        Uint256Mask.Mask minPriceIndexMask;
        Uint256Mask.Mask maxPriceIndexMask;
    }

    uint256 public constant SIGNER_INDEX_LENGTH = 16;
    // subtract 1 as the first slot is used to store number of signers
    uint256 public constant MAX_SIGNERS = 256 / SIGNER_INDEX_LENGTH - 1;
    // signer indexes are recorded in a signerIndexFlags uint256 value to check for uniqueness
    uint256 public constant MAX_SIGNER_INDEX = 256;

    OracleStore public immutable oracleStore;
    IRealtimeFeedVerifier public immutable realtimeFeedVerifier;

    // tokensWithPrices stores the tokens with prices that have been set
    // this is used in clearAllPrices to help ensure that all token prices
    // set in setPrices are cleared after use
    EnumerableSet.AddressSet internal tokensWithPrices;
    mapping(address => Price.Props) public primaryPrices;

    constructor(
        RoleStore _roleStore,
        OracleStore _oracleStore,
        IRealtimeFeedVerifier _realtimeFeedVerifier
    ) RoleModule(_roleStore) {
        oracleStore = _oracleStore;
        realtimeFeedVerifier = _realtimeFeedVerifier;
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
    // BTC prices maximum value: `(2 ^ 32) / (10 ^ 2) => 4,294,967,296 / (10 ^ 2) => 42,949,672.96`.
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
            revert Errors.NonEmptyTokensWithPrices(tokensWithPrices.length());
        }

        _setPricesFromPriceFeeds(dataStore, eventEmitter, params.priceFeedTokens);

        OracleUtils.RealtimeFeedReport[] memory reports = _setPricesFromRealtimeFeeds(dataStore, eventEmitter, params);

        ValidatedPrice[] memory validatedPrices = _setPrices(
            dataStore,
            eventEmitter,
            params
        );

        _validateBlockRanges(reports, validatedPrices);
    }

    // @dev set the primary price
    // @param token the token to set the price for
    // @param price the price value to set to
    function setPrimaryPrice(address token, Price.Props memory price) external onlyController {
        _setPrimaryPrice(token, price);
    }

    // @dev clear all prices
    function clearAllPrices() external onlyController {
        uint256 length = tokensWithPrices.length();
        for (uint256 i; i < length; i++) {
            address token = tokensWithPrices.at(0);
            _removePrimaryPrice(token);
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
            revert Errors.EmptyPrimaryPrice(token);
        }

        return price;
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
            revert Errors.EmptyPriceFeedMultiplier(token);
        }

        return multiplier;
    }

    function getRealtimeFeedMultiplier(DataStore dataStore, address token) public view returns (uint256) {
        uint256 multiplier = dataStore.getUint(Keys.realtimeFeedMultiplierKey(token));

        if (multiplier == 0) {
            revert Errors.EmptyRealtimeFeedMultiplier(token);
        }

        return multiplier;
    }

    function validatePrices(
        DataStore dataStore,
        OracleUtils.SetPricesParams memory params
    ) external view returns (ValidatedPrice[] memory) {
        return _validatePrices(dataStore, params);
    }

    function validateRealtimeFeeds(
        DataStore dataStore,
        address[] memory realtimeFeedTokens,
        bytes[] memory realtimeFeedData
    ) external onlyController returns (OracleUtils.RealtimeFeedReport[] memory) {
        return _validateRealtimeFeeds(dataStore, realtimeFeedTokens, realtimeFeedData);
    }

    // @dev validate and set prices
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param params OracleUtils.SetPricesParams
    function _setPrices(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OracleUtils.SetPricesParams memory params
    ) internal returns (ValidatedPrice[] memory) {
        ValidatedPrice[] memory validatedPrices = _validatePrices(dataStore, params);

        for (uint256 i; i < validatedPrices.length; i++) {
            ValidatedPrice memory validatedPrice = validatedPrices[i];

            emitOraclePriceUpdated(
                eventEmitter,
                validatedPrice.token,
                validatedPrice.min,
                validatedPrice.max,
                validatedPrice.timestamp,
                OracleUtils.PriceSourceType.InternalFeed
            );

            _setPrimaryPrice(validatedPrice.token, Price.Props(
                validatedPrice.min,
                validatedPrice.max
            ));
        }

        return validatedPrices;
    }

    function _validatePrices(
        DataStore dataStore,
        OracleUtils.SetPricesParams memory params
    ) internal view returns (ValidatedPrice[] memory) {
        // it is possible for transactions to be executed using just params.priceFeedTokens
        // or just params.realtimeFeedTokens
        // in this case if params.tokens is empty, the function can return
        if (params.tokens.length == 0) {
            return new ValidatedPrice[](0);
        }

        address[] memory signers = _getSigners(dataStore, params);

        SetPricesCache memory cache;

        cache.validatedPrices = new ValidatedPrice[](params.tokens.length);
        cache.minBlockConfirmations = dataStore.getUint(Keys.MIN_ORACLE_BLOCK_CONFIRMATIONS);
        cache.maxPriceAge = dataStore.getUint(Keys.MAX_ORACLE_PRICE_AGE);
        cache.maxRefPriceDeviationFactor = dataStore.getUint(Keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR);

        for (uint256 i; i < params.tokens.length; i++) {
            OracleUtils.ReportInfo memory reportInfo;
            SetPricesInnerCache memory innerCache;

            reportInfo.minOracleBlockNumber = OracleUtils.getUncompactedOracleBlockNumber(params.compactedMinOracleBlockNumbers, i);
            reportInfo.maxOracleBlockNumber = OracleUtils.getUncompactedOracleBlockNumber(params.compactedMaxOracleBlockNumbers, i);

            if (reportInfo.minOracleBlockNumber > reportInfo.maxOracleBlockNumber) {
                revert Errors.InvalidMinMaxBlockNumber(reportInfo.minOracleBlockNumber, reportInfo.maxOracleBlockNumber);
            }

            reportInfo.oracleTimestamp = OracleUtils.getUncompactedOracleTimestamp(params.compactedOracleTimestamps, i);

            if (reportInfo.maxOracleBlockNumber >= Chain.currentBlockNumber()) {
                revert Errors.InvalidBlockNumber(reportInfo.maxOracleBlockNumber, Chain.currentBlockNumber());
            }

            if (reportInfo.oracleTimestamp + cache.maxPriceAge < Chain.currentTimestamp()) {
                revert Errors.MaxPriceAgeExceeded(reportInfo.oracleTimestamp, Chain.currentTimestamp());
            }

            // block numbers must be in ascending order
            if (reportInfo.minOracleBlockNumber < cache.prevMinOracleBlockNumber) {
                revert Errors.BlockNumbersNotSorted(reportInfo.minOracleBlockNumber, cache.prevMinOracleBlockNumber);
            }
            cache.prevMinOracleBlockNumber = reportInfo.minOracleBlockNumber;

            if (Chain.currentBlockNumber() - reportInfo.maxOracleBlockNumber <= cache.minBlockConfirmations) {
                reportInfo.blockHash = Chain.getBlockHash(reportInfo.maxOracleBlockNumber);
            }

            reportInfo.token = params.tokens[i];

            // only allow internal feeds if the token does not have a realtime feed id
            if (dataStore.getBool(Keys.IN_STRICT_PRICE_FEED_MODE)) {
                innerCache.feedId = dataStore.getBytes32(Keys.realtimeFeedIdKey(reportInfo.token));
                if (innerCache.feedId != bytes32(0)) {
                    revert Errors.HasRealtimeFeedId(reportInfo.token, innerCache.feedId);
                }
            }

            reportInfo.precision = 10 ** OracleUtils.getUncompactedDecimal(params.compactedDecimals, i);
            reportInfo.tokenOracleType = dataStore.getBytes32(Keys.oracleTypeKey(reportInfo.token));

            innerCache.minPrices = new uint256[](signers.length);
            innerCache.maxPrices = new uint256[](signers.length);

            for (uint256 j = 0; j < signers.length; j++) {
                innerCache.priceIndex = i * signers.length + j;
                innerCache.minPrices[j] = OracleUtils.getUncompactedPrice(params.compactedMinPrices, innerCache.priceIndex);
                innerCache.maxPrices[j] = OracleUtils.getUncompactedPrice(params.compactedMaxPrices, innerCache.priceIndex);

                if (j == 0) { continue; }

                // validate that minPrices are sorted in ascending order
                if (innerCache.minPrices[j - 1] > innerCache.minPrices[j]) {
                    revert Errors.MinPricesNotSorted(reportInfo.token, innerCache.minPrices[j], innerCache.minPrices[j - 1]);
                }

                // validate that maxPrices are sorted in ascending order
                if (innerCache.maxPrices[j - 1] > innerCache.maxPrices[j]) {
                    revert Errors.MaxPricesNotSorted(reportInfo.token, innerCache.maxPrices[j], innerCache.maxPrices[j - 1]);
                }
            }

            for (uint256 j = 0; j < signers.length; j++) {
                innerCache.signatureIndex = i * signers.length + j;
                innerCache.minPriceIndex = OracleUtils.getUncompactedPriceIndex(params.compactedMinPricesIndexes, innerCache.signatureIndex);
                innerCache.maxPriceIndex = OracleUtils.getUncompactedPriceIndex(params.compactedMaxPricesIndexes, innerCache.signatureIndex);

                if (innerCache.signatureIndex >= params.signatures.length) {
                    revert Errors.ArrayOutOfBoundsBytes(params.signatures, innerCache.signatureIndex, "signatures");
                }

                if (innerCache.minPriceIndex >= innerCache.minPrices.length) {
                    revert Errors.ArrayOutOfBoundsUint256(innerCache.minPrices, innerCache.minPriceIndex, "minPrices");
                }

                if (innerCache.maxPriceIndex >= innerCache.maxPrices.length) {
                    revert Errors.ArrayOutOfBoundsUint256(innerCache.maxPrices, innerCache.maxPriceIndex, "maxPrices");
                }

                // since minPrices, maxPrices have the same length as the signers array
                // and the signers array length is less than MAX_SIGNERS
                // minPriceIndexMask and maxPriceIndexMask should be able to store the indexes
                // using Uint256Mask
                innerCache.minPriceIndexMask.validateUniqueAndSetIndex(innerCache.minPriceIndex, "minPriceIndex");
                innerCache.maxPriceIndexMask.validateUniqueAndSetIndex(innerCache.maxPriceIndex, "maxPriceIndex");

                reportInfo.minPrice = innerCache.minPrices[innerCache.minPriceIndex];
                reportInfo.maxPrice = innerCache.maxPrices[innerCache.maxPriceIndex];

                if (reportInfo.minPrice > reportInfo.maxPrice) {
                    revert Errors.InvalidSignerMinMaxPrice(reportInfo.minPrice, reportInfo.maxPrice);
                }

                OracleUtils.validateSigner(
                    _getSalt(),
                    reportInfo,
                    params.signatures[innerCache.signatureIndex],
                    signers[j]
                );
            }

            uint256 medianMinPrice = Array.getMedian(innerCache.minPrices) * reportInfo.precision;
            uint256 medianMaxPrice = Array.getMedian(innerCache.maxPrices) * reportInfo.precision;

            (bool hasPriceFeed, uint256 refPrice) = _getPriceFeedPrice(dataStore, reportInfo.token);
            if (hasPriceFeed) {
                validateRefPrice(
                    reportInfo.token,
                    medianMinPrice,
                    refPrice,
                    cache.maxRefPriceDeviationFactor
                );

                validateRefPrice(
                    reportInfo.token,
                    medianMaxPrice,
                    refPrice,
                    cache.maxRefPriceDeviationFactor
                );
            }

            if (medianMinPrice == 0 || medianMaxPrice == 0) {
                revert Errors.InvalidOraclePrice(reportInfo.token);
            }

            if (medianMinPrice > medianMaxPrice) {
                revert Errors.InvalidMedianMinMaxPrice(medianMinPrice, medianMaxPrice);
            }

            cache.validatedPrices[i] = ValidatedPrice(
                reportInfo.token, // token
                medianMinPrice, // min
                medianMaxPrice, // max
                reportInfo.oracleTimestamp, // timestamp
                reportInfo.minOracleBlockNumber, // minBlockNumber
                reportInfo.maxOracleBlockNumber // maxBlockNumber
            );
        }

        return cache.validatedPrices;
    }

    function _validateRealtimeFeeds(
        DataStore dataStore,
        address[] memory realtimeFeedTokens,
        bytes[] memory realtimeFeedData
    ) internal returns (OracleUtils.RealtimeFeedReport[] memory) {
        if (realtimeFeedTokens.length != realtimeFeedData.length) {
            revert Errors.InvalidRealtimeFeedLengths(realtimeFeedTokens.length, realtimeFeedData.length);
        }

        OracleUtils.RealtimeFeedReport[] memory reports = new OracleUtils.RealtimeFeedReport[](realtimeFeedTokens.length);

        uint256 minBlockConfirmations = dataStore.getUint(Keys.MIN_ORACLE_BLOCK_CONFIRMATIONS);
        uint256 maxPriceAge = dataStore.getUint(Keys.MAX_ORACLE_PRICE_AGE);

        for (uint256 i; i < realtimeFeedTokens.length; i++) {
            address token = realtimeFeedTokens[i];
            bytes32 feedId = dataStore.getBytes32(Keys.realtimeFeedIdKey(token));
            if (feedId == bytes32(0)) {
                revert Errors.EmptyRealtimeFeedId(token);
            }

            bytes memory data = realtimeFeedData[i];
            bytes memory verifierResponse = realtimeFeedVerifier.verify(data);

            OracleUtils.RealtimeFeedReport memory report = abi.decode(verifierResponse, (OracleUtils.RealtimeFeedReport));

            // feedIds are unique per chain so this validation also ensures that the price was signed
            // for the current chain
            if (feedId != report.feedId) {
                revert Errors.InvalidRealtimeFeedId(token, report.feedId, feedId);
            }

            if (report.bid <= 0 || report.ask <= 0) {
                revert Errors.InvalidRealtimePrices(token, report.bid, report.ask);
            }

            if (report.bid > report.ask) {
                revert Errors.InvalidRealtimeBidAsk(token, report.bid, report.ask);
            }

            // only check the block hash if this is not an estimate gas call (tx.origin != address(0))
            // this helps to prevent estimate gas from failing when executed in the context of the block
            // that the deposit / order / withdrawal was created in
            if (
                !(tx.origin == address(0) && Chain.currentBlockNumber() == report.blocknumberUpperBound) &&
                (Chain.currentBlockNumber() - report.blocknumberUpperBound <= minBlockConfirmations)
            ) {
                bytes32 blockHash = Chain.getBlockHash(report.blocknumberUpperBound);
                if (report.upperBlockhash != blockHash) {
                    revert Errors.InvalidRealtimeBlockHash(token, report.upperBlockhash, blockHash);
                }
            }

            if (report.currentBlockTimestamp + maxPriceAge < Chain.currentTimestamp()) {
                revert Errors.RealtimeMaxPriceAgeExceeded(token, report.currentBlockTimestamp, Chain.currentTimestamp());
            }

            reports[i] = report;
        }

        return reports;
    }

    function _getSigners(
        DataStore dataStore,
        OracleUtils.SetPricesParams memory params
    ) internal view returns (address[] memory) {
        // first 16 bits of signer info contains the number of signers
        address[] memory signers = new address[](params.signerInfo & Bits.BITMASK_16);

        if (signers.length < dataStore.getUint(Keys.MIN_ORACLE_SIGNERS)) {
            revert Errors.MinOracleSigners(signers.length, dataStore.getUint(Keys.MIN_ORACLE_SIGNERS));
        }

        if (signers.length > MAX_SIGNERS) {
            revert Errors.MaxOracleSigners(signers.length, MAX_SIGNERS);
        }

        Uint256Mask.Mask memory signerIndexMask;

        for (uint256 i; i < signers.length; i++) {
            uint256 signerIndex = params.signerInfo >> (16 + 16 * i) & Bits.BITMASK_16;

            if (signerIndex >= MAX_SIGNER_INDEX) {
                revert Errors.MaxSignerIndex(signerIndex, MAX_SIGNER_INDEX);
            }

            signerIndexMask.validateUniqueAndSetIndex(signerIndex, "signerIndex");

            signers[i] = oracleStore.getSigner(signerIndex);

            if (signers[i] == address(0)) {
                revert Errors.EmptySigner(signerIndex);
            }
        }

        return signers;
    }

    function _validateBlockRanges(
        OracleUtils.RealtimeFeedReport[] memory reports,
        ValidatedPrice[] memory validatedPrices
    ) internal pure {
        uint256 largestMinBlockNumber; // defaults to zero
        uint256 smallestMaxBlockNumber = type(uint256).max;

        for (uint256 i; i < reports.length; i++) {
            OracleUtils.RealtimeFeedReport memory report = reports[i];

            if (report.blocknumberLowerBound > largestMinBlockNumber) {
                largestMinBlockNumber = report.blocknumberLowerBound;
            }

            if (report.blocknumberUpperBound < smallestMaxBlockNumber) {
                smallestMaxBlockNumber = report.blocknumberUpperBound;
            }
        }

        for (uint256 i; i < validatedPrices.length; i++) {
            ValidatedPrice memory validatedPrice = validatedPrices[i];

            if (validatedPrice.minBlockNumber > largestMinBlockNumber) {
                largestMinBlockNumber = validatedPrice.minBlockNumber;
            }

            if (validatedPrice.maxBlockNumber < smallestMaxBlockNumber) {
                smallestMaxBlockNumber = validatedPrice.maxBlockNumber;
            }
        }

        if (largestMinBlockNumber > smallestMaxBlockNumber) {
            revert Errors.InvalidBlockRangeSet(largestMinBlockNumber, smallestMaxBlockNumber);
        }
    }

    // it might be possible for the block.chainid to change due to a fork or similar
    // for this reason, this salt is not cached
    function _getSalt() internal view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, "xget-oracle-v1"));
    }

    function validateRefPrice(
        address token,
        uint256 price,
        uint256 refPrice,
        uint256 maxRefPriceDeviationFactor
    ) internal pure {
        uint256 diff = Calc.diff(price, refPrice);
        uint256 diffFactor = Precision.toFactor(diff, refPrice);

        if (diffFactor > maxRefPriceDeviationFactor) {
            revert Errors.MaxRefPriceDeviationExceeded(
                token,
                price,
                refPrice,
                maxRefPriceDeviationFactor
            );
        }
    }

    function _setPrimaryPrice(address token, Price.Props memory price) internal {
        if (price.min > price.max) {
            revert Errors.InvalidMinMaxForPrice(token, price.min, price.max);
        }

        Price.Props memory existingPrice = primaryPrices[token];

        if (!existingPrice.isEmpty()) {
            revert Errors.PriceAlreadySet(token, existingPrice.min, existingPrice.max);
        }

        primaryPrices[token] = price;
        tokensWithPrices.add(token);
    }

    function _removePrimaryPrice(address token) internal {
        delete primaryPrices[token];
        tokensWithPrices.remove(token);
    }

    // there is a small risk of stale pricing due to latency in price updates or if the chain is down
    // this is meant to be for temporary use until low latency price feeds are supported for all tokens
    function _getPriceFeedPrice(DataStore dataStore, address token) internal view returns (bool, uint256) {
        address priceFeedAddress = dataStore.getAddress(Keys.priceFeedKey(token));
        if (priceFeedAddress == address(0)) {
            return (false, 0);
        }

        IPriceFeed priceFeed = IPriceFeed(priceFeedAddress);

        (
            /* uint80 roundID */,
            int256 _price,
            /* uint256 startedAt */,
            uint256 timestamp,
            /* uint80 answeredInRound */
        ) = priceFeed.latestRoundData();

        if (_price <= 0) {
            revert Errors.InvalidFeedPrice(token, _price);
        }

        uint256 heartbeatDuration = dataStore.getUint(Keys.priceFeedHeartbeatDurationKey(token));
        if (Chain.currentTimestamp() > timestamp && Chain.currentTimestamp() - timestamp > heartbeatDuration) {
            revert Errors.PriceFeedNotUpdated(token, timestamp, heartbeatDuration);
        }

        uint256 price = SafeCast.toUint256(_price);
        uint256 precision = getPriceFeedMultiplier(dataStore, token);

        uint256 adjustedPrice = Precision.mulDiv(price, precision, Precision.FLOAT_PRECISION);

        return (true, adjustedPrice);
    }

    function _setPricesFromRealtimeFeeds(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OracleUtils.SetPricesParams memory params
    ) internal returns (OracleUtils.RealtimeFeedReport[] memory) {
        OracleUtils.RealtimeFeedReport[] memory reports = _validateRealtimeFeeds(
            dataStore,
            params.realtimeFeedTokens,
            params.realtimeFeedData
        );

        uint256 maxRefPriceDeviationFactor = dataStore.getUint(Keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR);

        for (uint256 i; i < params.realtimeFeedTokens.length; i++) {
            address token = params.realtimeFeedTokens[i];

            OracleUtils.RealtimeFeedReport memory report = reports[i];

            uint256 precision = getRealtimeFeedMultiplier(dataStore, token);
            uint256 adjustedBidPrice = Precision.mulDiv(uint256(uint192(report.bid)), precision, Precision.FLOAT_PRECISION);
            uint256 adjustedAskPrice = Precision.mulDiv(uint256(uint192(report.ask)), precision, Precision.FLOAT_PRECISION);

            (bool hasPriceFeed, uint256 refPrice) = _getPriceFeedPrice(dataStore, token);
            if (hasPriceFeed) {
                validateRefPrice(
                    token,
                    adjustedBidPrice,
                    refPrice,
                    maxRefPriceDeviationFactor
                );

                validateRefPrice(
                    token,
                    adjustedAskPrice,
                    refPrice,
                    maxRefPriceDeviationFactor
                );
            }

            Price.Props memory priceProps = Price.Props(
                adjustedBidPrice, // min
                adjustedAskPrice // max
            );

            _setPrimaryPrice(token, priceProps);

            emitOraclePriceUpdated(
                eventEmitter,
                token,
                priceProps.min,
                priceProps.max,
                report.currentBlockTimestamp,
                OracleUtils.PriceSourceType.RealtimeFeed
            );
        }

        return reports;
    }

    // @dev set prices using external price feeds to save costs for tokens with stable prices
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param priceFeedTokens the tokens to set the prices using the price feeds for
    function _setPricesFromPriceFeeds(DataStore dataStore, EventEmitter eventEmitter, address[] memory priceFeedTokens) internal {
        for (uint256 i; i < priceFeedTokens.length; i++) {
            address token = priceFeedTokens[i];

            (bool hasPriceFeed, uint256 price) = _getPriceFeedPrice(dataStore, token);

            if (!hasPriceFeed) {
                revert Errors.EmptyPriceFeed(token);
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

            _setPrimaryPrice(token, priceProps);

            emitOraclePriceUpdated(
                eventEmitter,
                token,
                priceProps.min,
                priceProps.max,
                Chain.currentTimestamp(),
                OracleUtils.PriceSourceType.PriceFeed
            );
        }
    }

    function emitOraclePriceUpdated(
        EventEmitter eventEmitter,
        address token,
        uint256 minPrice,
        uint256 maxPrice,
        uint256 timestamp,
        OracleUtils.PriceSourceType priceSourceType
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "token", token);

        eventData.uintItems.initItems(4);
        eventData.uintItems.setItem(0, "minPrice", minPrice);
        eventData.uintItems.setItem(1, "maxPrice", maxPrice);
        eventData.uintItems.setItem(2, "timestamp", timestamp);
        eventData.uintItems.setItem(3, "priceSourceType", uint256(priceSourceType));

        eventEmitter.emitEventLog1(
            "OraclePriceUpdate",
            Cast.toBytes32(token),
            eventData
        );
    }
}
