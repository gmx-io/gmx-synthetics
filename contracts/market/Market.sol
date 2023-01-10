// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title Market
// @dev Struct for markets
//
// Markets support both spot and perp trading, they are created by specifying a
// long collateral token, short collateral token and index token.
//
// Examples:
//
// - ETH/USD market with long collateral as ETH, short collateral as a stablecoin, index token as ETH
// - BTC/USD market with long collateral as WBTC, short collateral as a stablecoin, index token as BTC
// - SOL/USD market with long collateral as ETH, short collateral as a stablecoin, index token as SOL
//
// Liquidity providers can deposit either the long or short collateral token or
// both to mint liquidity tokens.
//
// The long collateral token is used to back long positions, while the short
// collateral token is used to back short positions.
//
// Liquidity providers take on the profits and losses of traders for the market
// that they provide liquidity for.
//
// Having separate markets allows for risk isolation, liquidity providers are
// only exposed to the markets that they deposit into, this potentially allow
// for permissionless listings.
//
// Traders can use either the long or short token as collateral for the market.
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
    }
}
