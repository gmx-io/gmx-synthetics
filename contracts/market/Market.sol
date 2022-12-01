// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title Market
// @dev Struct for markets
library Market {
    // @param marketToken address of the market token for the market
    // @param indexToken address of the index token for the market
    // @param longToken address of the long token for the market
    // @param shortToken address of the short token for the market
    // @param data for any additional data
    struct Props {
        address marketToken;
        address indexToken;
        address longToken;
        address shortToken;
        bytes data;
    }
}
