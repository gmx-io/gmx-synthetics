
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../oracle/OracleModule.sol";

/**
 * @title OracleModuleTest
 * @dev Contract to help test the OracleModule contract
 */
contract OracleModuleTest is OracleModule {
    function withOraclePricesTest(
        Oracle oracle,
        DataStore dataStore,
        EventEmitter eventEmitter,
        OracleUtils.SetPricesParams memory oracleParams
    ) external withOraclePrices(oracle, dataStore, eventEmitter, oracleParams) {
    }

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
    ) external pure {
        OracleUtils.validateSigner(
            SALT,
            oracleBlockNumber,
            oracleTimestamp,
            blockHash,
            token,
            tokenOracleType,
            precision,
            minPrice,
            maxPrice,
            signature,
            expectedSigner
        );
    }
}
