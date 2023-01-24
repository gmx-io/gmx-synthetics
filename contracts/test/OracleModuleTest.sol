
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
}
