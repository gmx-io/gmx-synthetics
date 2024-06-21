// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";

import "./OracleStore.sol";
import "./OracleUtils.sol";
import "../price/Price.sol";
import "./GmOracleUtils.sol";
import "./IOracleProvider.sol";

import "../chain/Chain.sol";
import "../data/Keys.sol";
import "../data/DataStore.sol";

import "../utils/Bits.sol";
import "../utils/Array.sol";
import "../utils/Precision.sol";
import "../utils/Uint256Mask.sol";

// @title Oracle
// @dev Contract to validate and store signed values
// Some calculations e.g. calculating the size in tokens for a position
// may not work with zero / negative prices
// as a result, zero / negative prices are considered empty / invalid
// A market may need to be manually settled in this case
contract GmOracleProvider is RoleModule, IOracleProvider {
    using Price for Price.Props;
    using Uint256Mask for Uint256Mask.Mask;

    uint256 public constant SIGNER_INDEX_LENGTH = 16;
    // subtract 1 as the first slot is used to store number of signers
    uint256 public constant MAX_SIGNERS = 256 / SIGNER_INDEX_LENGTH - 1;
    // signer indexes are recorded in a signerIndexFlags uint256 value to check for uniqueness
    uint256 public constant MAX_SIGNER_INDEX = 256;

    DataStore public immutable dataStore;
    OracleStore public immutable oracleStore;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        OracleStore _oracleStore
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        oracleStore = _oracleStore;
    }

    // @dev Oracle prices are signed as a value together with a precision, this allows
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
    function getOraclePrice(
        address token,
        bytes memory data
    ) external view returns (OracleUtils.ValidatedPrice memory) {
        GmOracleUtils.Report memory report = abi.decode(data, (GmOracleUtils.Report));
        address[] memory signers = _getSigners(report.signerInfo);

        if (report.minOracleBlockNumber > report.maxOracleBlockNumber) {
            revert Errors.GmInvalidMinMaxBlockNumber(report.minOracleBlockNumber, report.maxOracleBlockNumber);
        }

        if (report.maxOracleBlockNumber >= Chain.currentBlockNumber()) {
            revert Errors.GmInvalidBlockNumber(report.maxOracleBlockNumber, Chain.currentBlockNumber());
        }

        bytes32 tokenOracleType = dataStore.getBytes32(Keys.oracleTypeKey(token));

        for (uint256 i = 0; i < signers.length; i++) {
            if (i == 0) { continue; }

            // validate that minPrices are sorted in ascending order
            if (report.minPrices[i - 1] > report.minPrices[i]) {
                revert Errors.GmMinPricesNotSorted(token, report.minPrices[i], report.minPrices[i - 1]);
            }

            // validate that maxPrices are sorted in ascending order
            if (report.maxPrices[i - 1] > report.maxPrices[i]) {
                revert Errors.GmMaxPricesNotSorted(token, report.maxPrices[i], report.maxPrices[i - 1]);
            }
        }

        bytes32 salt = _getSalt();

        for (uint256 i = 0; i < signers.length; i++) {
            uint256 minPrice = report.minPrices[i];
            uint256 maxPrice = report.maxPrices[i];

            if (minPrice > maxPrice) {
                revert Errors.InvalidGmSignerMinMaxPrice(minPrice, maxPrice);
            }

            GmOracleUtils.validateSigner(
                salt,
                report,
                token,
                minPrice,
                maxPrice,
                tokenOracleType,
                report.signatures[i],
                signers[i]
            );
        }

        uint256 medianMinPrice = Array.getMedian(report.minPrices) * (10 ** report.precision);
        uint256 medianMaxPrice = Array.getMedian(report.maxPrices) * (10 ** report.precision);

        if (medianMinPrice == 0 || medianMaxPrice == 0) {
            revert Errors.InvalidGmOraclePrice(token);
        }

        if (medianMinPrice > medianMaxPrice) {
            revert Errors.InvalidGmMedianMinMaxPrice(medianMinPrice, medianMaxPrice);
        }

        return OracleUtils.ValidatedPrice({
            token: token,
            min: medianMinPrice,
            max: medianMaxPrice,
            timestamp: report.oracleTimestamp,
            provider: address(this)
        });
    }

    function _getSigners(
        uint256 signerInfo
    ) internal view returns (address[] memory) {
        // first 16 bits of signer info contains the number of signers
        address[] memory signers = new address[](signerInfo & Bits.BITMASK_16);

        if (signers.length < dataStore.getUint(Keys.MIN_ORACLE_SIGNERS)) {
            revert Errors.GmMinOracleSigners(signers.length, dataStore.getUint(Keys.MIN_ORACLE_SIGNERS));
        }

        if (signers.length > MAX_SIGNERS) {
            revert Errors.GmMaxOracleSigners(signers.length, MAX_SIGNERS);
        }

        Uint256Mask.Mask memory signerIndexMask;

        for (uint256 i; i < signers.length; i++) {
            uint256 signerIndex = signerInfo >> (16 + 16 * i) & Bits.BITMASK_16;

            if (signerIndex >= MAX_SIGNER_INDEX) {
                revert Errors.GmMaxSignerIndex(signerIndex, MAX_SIGNER_INDEX);
            }

            signerIndexMask.validateUniqueAndSetIndex(signerIndex, "signerIndex");

            signers[i] = oracleStore.getSigner(signerIndex);

            if (signers[i] == address(0)) {
                revert Errors.GmEmptySigner(signerIndex);
            }
        }

        return signers;
    }

    // it might be possible for the block.chainid to change due to a fork or similar
    // for this reason, this salt is not cached
    function _getSalt() internal view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, "xget-oracle-v1"));
    }
}
