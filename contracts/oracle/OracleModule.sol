// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "./IOracle.sol";
import "../data/DataStoreAccessor.sol";

// @title OracleModule
// @dev Provides convenience functions for interacting with the Oracle
abstract contract OracleModule is DataStoreAccessor {

    function getOracle() internal view returns (IOracle) {
        DataStore store = _dataStore();
        address oracleAddress = store.getAddress(Keys.ORACLE_ADDRESS);
        if (oracleAddress == address(0)) {
            revert Errors.OracleAddressNotSet();
        }
        return IOracle(oracleAddress);
    }

    // @dev sets oracle prices, perform any additional tasks required,
    // and clear the oracle prices after
    //
    // care should be taken to avoid re-entrancy while using this call
    // since re-entrancy could allow functions to be called with prices
    // meant for a different type of transaction
    // the tokensWithPrices.length check in oracle.setPrices should help
    // mitigate this
    //
    // @param params OracleUtils.SetPricesParams
    modifier withOraclePrices(
        OracleUtils.SetPricesParams memory params
    ) {
        IOracle oracle = getOracle();
        oracle.setPrices(params);
        _;
        oracle.clearAllPrices();
    }

    modifier withOraclePricesForAtomicAction(
        OracleUtils.SetPricesParams memory params
    ) {
        IOracle oracle = getOracle();
        oracle.setPricesForAtomicAction(params);
        _;
        oracle.clearAllPrices();
    }

    // @dev set oracle prices for a simulation
    // tokensWithPrices is not set in this function
    // it is possible for withSimulatedOraclePrices to be called and a function
    // using withOraclePrices to be called after
    // or for a function using withOraclePrices to be called and withSimulatedOraclePrices
    // called after
    // this should not cause an issue because this transaction should always revert
    // and any state changes based on simulated prices as well as the setting of simulated
    // prices should not be persisted
    // @param params OracleUtils.SimulatePricesParams
    modifier withSimulatedOraclePrices(
        OracleUtils.SimulatePricesParams memory params
    ) {
        if (params.primaryTokens.length != params.primaryPrices.length) {
            revert Errors.InvalidPrimaryPricesForSimulation(params.primaryTokens.length, params.primaryPrices.length);
        }

        IOracle oracle = getOracle();

        for (uint256 i; i < params.primaryTokens.length; i++) {
            address token = params.primaryTokens[i];
            Price.Props memory price = params.primaryPrices[i];
            oracle.setPrimaryPrice(token, price);
        }

        oracle.setTimestamps(params.minTimestamp, params.maxTimestamp);

        _;

        revert Errors.EndOfOracleSimulation();
    }
}
