// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title Deposit
// @dev Struct for deposits
library Deposit {
    // @param account the account depositing liquidity
    // @param receiver the address to send the liquidity tokens to
    // @param callbackContract the callback contract
    // @param market the market to deposit to
    // @param longTokenAmount the amount of long tokens to deposit
    // @param shortTokenAmount the amount of short tokens to deposit
    // @param minMarketTokens the minimum acceptable number of liquidity tokens
    // @param updatedAtBlock the block that the deposit was last updated at
    // @param shouldUnwrapNativeToken whether to unwrap the native token when
    // sending funds back to the user in case the deposit gets cancelled
    // @param executionFee the execution fee
    // @param callbackGasLimit the gas limit for the callbackContract
    // @param data for any additional data
    struct Props {
        address account;
        address receiver;
        address callbackContract;
        address market;
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        uint256 minMarketTokens;
        uint256 updatedAtBlock;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bytes data;
    }
}
