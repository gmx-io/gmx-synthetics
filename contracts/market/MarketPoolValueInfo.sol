// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title MarketPoolInfo
library MarketPoolValueInfo {
    // @dev struct to avoid stack too deep errors for the getPoolValue call
    // @param value the pool value
    // @param longTokenAmount the amount of long token in the pool
    // @param shortTokenAmount the amount of short token in the pool
    // @param longTokenUsd the USD value of the long tokens in the pool
    // @param shortTokenUsd the USD value of the short tokens in the pool
    // @param totalBorrowingFees the total pending borrowing fees for the market
    // @param borrowingFeePoolFactor the pool factor for borrowing fees
    // @param impactPoolAmount the amount of tokens in the impact pool
    // @param longPnl the pending pnl of long positions
    // @param shortPnl the pending pnl of short positions
    // @param netPnl the net pnl of long and short positions
    struct Props {
        int256 poolValue;
        int256 longPnl;
        int256 shortPnl;
        int256 netPnl;

        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        uint256 longTokenUsd;
        uint256 shortTokenUsd;

        uint256 totalBorrowingFees;
        uint256 borrowingFeePoolFactor;

        uint256 impactPoolAmount;
    }
}
