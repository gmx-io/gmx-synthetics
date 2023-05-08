// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Oracle.sol";
import "../event/EventEmitter.sol";

// @title OracleModule
// @dev Provides convenience functions for interacting with the Oracle
contract OracleModule {
    event OracleError(string reason);

    // @dev sets oracle prices, perform any additional tasks required,
    // and clear the oracle prices after
    //
    // care should be taken to avoid re-entrancy while using this call
    // since re-entrancy could allow functions to be called with prices
    // meant for a different type of transaction
    // the tokensWithPrices.length check in oracle.setPrices should help
    // mitigate this
    //
    // @param oracle Oracle
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param params OracleUtils.SetPricesParams
    modifier withOraclePrices(
        Oracle oracle,
        DataStore dataStore,
        EventEmitter eventEmitter,
        OracleUtils.SetPricesParams memory params
    ) {
        oracle.setPrices(dataStore, eventEmitter, params);
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
    // @param oracle Oracle
    // @param params OracleUtils.SimulatePricesParams
    modifier withSimulatedOraclePrices(
        Oracle oracle,
        OracleUtils.SimulatePricesParams memory params
    ) {
        if (params.primaryTokens.length != params.primaryPrices.length) {
            revert Errors.InvalidPrimaryPricesForSimulation(params.primaryTokens.length, params.primaryPrices.length);
        }

        for (uint256 i; i < params.primaryTokens.length; i++) {
            address token = params.primaryTokens[i];
            Price.Props memory price = params.primaryPrices[i];
            oracle.setPrimaryPrice(token, price);
        }

        _;

        revert Errors.EndOfOracleSimulation();
    }
}
