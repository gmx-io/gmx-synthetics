// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Oracle.sol";
import "../event/EventEmitter.sol";

// @title OracleModule
// @dev Provides convenience functions for interacting with the Oracle
contract OracleModule {
    Oracle public immutable oracle;

    constructor(Oracle _oracle) {
        oracle = _oracle;
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
        oracle.setPrices(params);
        _;
        oracle.clearAllPrices();
    }

    modifier withOraclePricesForAtomicAction(
        OracleUtils.SetPricesParams memory params
    ) {
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
