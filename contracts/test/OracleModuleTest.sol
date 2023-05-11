
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../oracle/OracleModule.sol";
import "../oracle/Oracle.sol";
import "../utils/Uint256Mask.sol";
import "../chain/Chain.sol";

/**
 * @title OracleModuleTest
 * @dev Contract to help test the OracleModule contract
 */
contract OracleModuleTest is OracleModule {
    using Uint256Mask for Uint256Mask.Mask;

    function withOraclePricesTest(
        Oracle oracle,
        DataStore dataStore,
        EventEmitter eventEmitter,
        OracleUtils.SetPricesParams memory oracleParams
    ) external withOraclePrices(oracle, dataStore, eventEmitter, oracleParams) {
    }

    function getTokenOracleType(DataStore dataStore, address token) external view returns (bytes32) {
        return dataStore.getBytes32(Keys.oracleTypeKey(token));
    }

    function getReportInfo(
        DataStore dataStore,
        OracleUtils.SetPricesParams memory params
    ) external view returns (OracleUtils.ReportInfo[] memory) {
        OracleUtils.ReportInfo[] memory result = new OracleUtils.ReportInfo[](params.tokens.length);

        for (uint256 i; i < params.tokens.length; i++) {
            Oracle.SetPricesInnerCache memory innerCache;
            OracleUtils.ReportInfo memory reportInfo;
            reportInfo.minOracleBlockNumber = OracleUtils.getUncompactedOracleBlockNumber(params.compactedMinOracleBlockNumbers, i);
            reportInfo.maxOracleBlockNumber = OracleUtils.getUncompactedOracleBlockNumber(params.compactedMaxOracleBlockNumbers, i);
            reportInfo.oracleTimestamp = OracleUtils.getUncompactedOracleTimestamp(params.compactedOracleTimestamps, i);
            reportInfo.token = params.tokens[i];
            reportInfo.precision = 10 ** OracleUtils.getUncompactedDecimal(params.compactedDecimals, i);
            reportInfo.tokenOracleType = dataStore.getBytes32(Keys.oracleTypeKey(reportInfo.token));

            if (Chain.currentBlockNumber() - reportInfo.minOracleBlockNumber <= 255) {
                reportInfo.blockHash = Chain.getBlockHash(reportInfo.minOracleBlockNumber);
            }

            innerCache.minPrices = new uint256[](1);
            innerCache.maxPrices = new uint256[](1);

            for (uint256 j = 0; j < 1; j++) {
                innerCache.priceIndex = i * 1 + j;
                innerCache.minPrices[j] = OracleUtils.getUncompactedPrice(params.compactedMinPrices, innerCache.priceIndex);
                innerCache.maxPrices[j] = OracleUtils.getUncompactedPrice(params.compactedMaxPrices, innerCache.priceIndex);
            }

            for (uint256 j = 0; j < 1; j++) {
                innerCache.signatureIndex = i * 1 + j;
                innerCache.minPriceIndex = OracleUtils.getUncompactedPriceIndex(params.compactedMinPricesIndexes, innerCache.signatureIndex);
                innerCache.maxPriceIndex = OracleUtils.getUncompactedPriceIndex(params.compactedMaxPricesIndexes, innerCache.signatureIndex);

                innerCache.minPriceIndexMask.validateUniqueAndSetIndex(innerCache.minPriceIndex, "minPriceIndex");
                innerCache.maxPriceIndexMask.validateUniqueAndSetIndex(innerCache.maxPriceIndex, "maxPriceIndex");

                reportInfo.minPrice = innerCache.minPrices[innerCache.minPriceIndex];
                reportInfo.maxPrice = innerCache.maxPrices[innerCache.maxPriceIndex];
            }
            result[i] = reportInfo;
        }
        return result;
    }

    function validateSignerWithSalt(
        bytes32 SALT,
        OracleUtils.ReportInfo memory info,
        bytes memory signature,
        address expectedSigner
    ) external pure {
        OracleUtils.validateSigner(
            SALT,
            info,
            signature,
            expectedSigner
        );
    }

    function validateSigner(
        OracleUtils.ReportInfo memory info,
        bytes memory signature,
        address expectedSigner
    ) external view {
        OracleUtils.validateSigner(
            getSalt(),
            info,
            signature,
            expectedSigner
        );
    }

    function getSalt() public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, "xget-oracle-v1"));
    }
}
