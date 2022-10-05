# GMX Synthetics

Contracts for GMX Synthetics.

# General Overview

This section provides a general overview of how the contracts work.

For a Technical Overview, please see the section further below.

## Markets

Markets support both spot and perp trading, they are created by specifying a long collateral token, short collateral token and index token.

Examples:

- ETH/USD market with long collateral as ETH, short collateral as a stablecoin, index token as ETH
- BTC/USD market with long collateral as WBTC, short collateral as a stablecoin, index token as BTC
- SOL/USD market with long collateral as ETH, short collateral as a stablecoin, index token as SOL

Liquidity providers can deposit either the long or short collateral token or both to mint liquidity tokens.

The long collateral token is used to back long positions, while the short collateral token is used to back short positions.

Liquidity providers take on the profits and losses of traders for the market that they provide liquidity for.

Having separate markets allows for risk isolation, liquidity providers are only exposed to the markets that they deposit into, this potentially allow for permissionless listings.

## Features

The contracts support the following main features:

- Deposit and withdrawal of liquidity
- Spot Trading (Swaps)
- Leverage Trading (Perps, Long / Short)
- Market orders, limit orders, stop-loss, take-profit orders

## Oracle System

To avoid front-running issues, most actions require two steps to execute:

- User sends transaction with request details, e.g. deposit / withdraw liquidity, swap, increase / decrease position
- Keepers listen for the transactions, include the prices for the request then send a transaction to execute the request

Prices are provided by an off-chain oracle system:

- Oracle keepers continually check the latest blocks
- When there is a new block, oracle keepers fetch the latest prices from reference exchanges
- Oracle keepers then sign the median price for each token together with the block hash
- Oracle keepers then send the data and signature to archive nodes
- Archive nodes display this information for anyone to query

Example:

- Block 100 is finalized on the blockchain
- Oracle keepers observe this block
- Oracle keepers pull the latest prices from reference exchanges, token A: price 20,000, token B: price 80,000
- Oracle keepers sign [chainId, blockhash(100), 20,000], [chainId, blockhash(100), 80,000]
- If in block 100, there was a market order to open a long position for token A, the market order would have a block number of 100
- The prices signed at block 100 can be used to execute this order
- Order keepers would bundle the signature and price data for token A then execute the order

## Fees and Pricing

Funding fees and price impact keep longs / shorts balanced while reducing the risk of price manipulation.

- Funding fees: if there is an imbalance of longs / shorts, the larger side pays a funding fee to the smaller side
- Borrowing fees: to avoid a user opening equal longs / shorts and unnecessarily taking up capacity
- Price impact: this allows the contracts to simulate a price impact similar to if the trader were trading using an aggregator for the reference exchanges, there is a negative price impact if an action reduces balance, and a positive price impact if an action improves balance

## Keepers

There are a few keepers and nodes in the system:

- Oracle keepers: checks for latest finalized blocks, pull prices from reference exchanges, sign the information and publish it to Archive nodes
- Archive nodes: receives oracle keeper signatures and allows querying of this information
- Order keepers: checks for deposit / withdraw liquidity requests, order requests, bundles the signed oracle prices with the requests and executes them

## Structure

There are two main types of contracts:

- Storage contracts which hold funds and have internal state
- Logic contracts which do not hold funds and do not have internal state

The contracts are separated into these two types to allow for gradual upgradeability.

Using the OrderStore, OrderUtils and OrderHandler contracts as an example

- OrderStore: stores orders and funds for orders
- OrderUtils: logic library
- OrderHandler: logic contract

To avoid exceeding the maximum allowed contract size for contracts such as OrderHandler, OrderUtils and other library contracts are used.

If order logic needs to be updated, a new OrderHandler can be created and can run alongside the existing OrderHandler until it is fully tested, this facilitates zero downtimes updates.

Store contracts such as OrderStore, PositionStore store specific structs, while DataStore stores general data required by the system.

EnumberableSets are used to allow order lists and position lists to be easily queried by interfaces or keepers, this is used over indexers as there may be a lag for indexers to sync the latest block. Having the lists stored directly in the contract also helps to ensure that accurate data can be retrieved and verified when needed.

# Technical Overview

This section provides a more detailed technical description of the contracts.

## Exchange Contracts

- Router: approve token spending using this contract
- ExchangeRouter: create requests for deposits, withdrawals, orders, tokens are transferred using the Router
- /exchange contracts: execute user requests

## Markets

Markets are created using `MarketFactory.createMarket`, this creates a MarketToken and stores a Market.Props struct in the MarketStore.

The MarketToken is used to keep track of liquidity providers share of the market pool and to store the tokens for each market.

At any point in time, the price of a MarketToken is `(worth of market pool) / (MarketToken.totalSupply())`, the function `MarketUtils.getMarketTokenPrice` can be used to retrieve this value.

The worth of the market pool is the sum of

- worth of all tokens deposited into the pool
- total pending PnL of all open long / short positions

## Deposits

Deposits add liquidity to the market's pool and mint MarketTokens to the depositor.

Requests for deposits are created by calling ExchangeRouter.createDeposit, specifying the market to deposit into as well as the amount of long or short tokens to deposit.

Deposit requests are executed using DepositHandler.executeDeposit, if the deposit was created at block `n`, it should be executed with the oracle prices at block `n`.
