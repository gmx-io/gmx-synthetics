
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../oracle/OracleModule.sol";
import "../oracle/Oracle.sol";
import "../oracle/GmOracleUtils.sol";
import "../utils/Uint256Mask.sol";
import "../chain/Chain.sol";

/**
 * @title OracleModuleTest
 * @dev Contract to help test the OracleModule contract
 */
contract OracleModuleTest is OracleModule {
    using Uint256Mask for Uint256Mask.Mask;

    constructor(Oracle _oracle) OracleModule(_oracle) {}

    function withOraclePricesTest(
        OracleUtils.SetPricesParams memory oracleParams
    ) external withOraclePrices(oracleParams) {
    }

    function getTokenOracleType(DataStore dataStore, address token) external view returns (bytes32) {
        return dataStore.getBytes32(Keys.oracleTypeKey(token));
    }

    function validateSignerWithSalt(
        DataStore dataStore,
        bytes32 SALT,
        GmOracleUtils.Report memory report,
        address token,
        uint256 minPrice,
        uint256 maxPrice,
        bytes memory signature,
        address expectedSigner
    ) external view {
        bytes32 tokenOracleType = dataStore.getBytes32(Keys.oracleTypeKey(token));

        GmOracleUtils.validateSigner(
            SALT,
            report,
            token,
            minPrice,
            maxPrice,
            tokenOracleType,
            signature,
            expectedSigner
        );
    }

    function validateSigner(
        DataStore dataStore,
        GmOracleUtils.Report memory report,
        address token,
        uint256 minPrice,
        uint256 maxPrice,
        bytes memory signature,
        address expectedSigner
    ) external view {
        bytes32 tokenOracleType = dataStore.getBytes32(Keys.oracleTypeKey(token));

        GmOracleUtils.validateSigner(
            getSalt(),
            report,
            token,
            minPrice,
            maxPrice,
            tokenOracleType,
            signature,
            expectedSigner
        );
    }

    function getSalt() public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, "xget-oracle-v1"));
    }
}
