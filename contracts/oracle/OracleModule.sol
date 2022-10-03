// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Oracle.sol";

contract OracleModule {
    event OracleError(string reason);

    // care should be taken to avoid re-entrancy while using this call
    // since re-entrancy could allow functions to be called with prices
    // meant for a different type of transaction
    // the tempTokens.length check in oracle.setPrices should help
    // mitigate this
    modifier withOraclePrices(Oracle oracle, DataStore dataStore, OracleUtils.SetPricesParams memory params) {
        try oracle.setPrices(dataStore, params) {
        } catch Error(string memory reason) {
            emit OracleError(reason);
            revert(Keys.ORACLE_ERROR);
        }
        _;
        oracle.clearTempPrices();
    }
}
