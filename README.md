# GMX Synthetics

Contracts for GMX Synthetics.

# General Overview

This section provides a general overview of how the system works.

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

Traders can use either the long or short token as collateral for the market.

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

This section provides a technical description of the contracts.

## Exchange Contracts

- Router: approve token spending using this contract
- ExchangeRouter: create requests for deposits, withdrawals, orders, tokens are transferred using the Router
- /exchange contracts: execute user requests

## Markets

Markets are created using `MarketFactory.createMarket`, this creates a MarketToken and stores a Market.Props struct in the MarketStore.

The MarketToken is used to keep track of liquidity providers share of the market pool and to store the tokens for each market.

At any point in time, the price of a MarketToken is `(worth of market pool) / MarketToken.totalSupply()`, the function `MarketUtils.getMarketTokenPrice` can be used to retrieve this value.

The worth of the market pool is the sum of

- worth of all tokens deposited into the pool
- total pending PnL of all open positions
- total pending borrow fees of all open positions

## Deposits

Deposits add long / short tokens to the market's pool and mints MarketTokens to the depositor.

Requests for deposits are created by calling ExchangeRouter.createDeposit, specifying:

- the market to deposit into
- amount of long tokens to deposit
- amount of short tokens to deposit

Deposit requests are executed using DepositHandler.executeDeposit, if the deposit was created at block `n`, it should be executed with the oracle prices at block `n`.

The amount of MarketTokens to be minted, before fees and price impact, is calculated as `(worth of tokens deposited) / (worth of market pool) * MarketToken.totalSupply()`.

## Withdrawals

Withdrawals burn MarketTokens in exchange for the long / short tokens of a market's pool.

Requests for withdrawals are created by calling ExchangeRouter.createWithdrawal, specifying:

- the market to withdraw from
- the number of market tokens to burn for long tokens
- the number of market tokens to burn for short tokens

Withdrawal requests are executed using WithdrawalHandler.executeWithdrawal, if the withdrawal was created at block `n`, it should be executed with the oracle prices at block `n`.

The amount of long or short tokens to be redeemed, before fees and price impact, is calculated as `(worth of market tokens) / (long / short token price)`.

## Market Swaps

Long and short tokens of a market can be swapped for each other.

For example, if the ETH / USD market has WETH as the long token and USDC as the short token, WETH can be sent to the market to be swapped for USDC and USDC can be sent to the market to be swapped for WETH.

Swap order requests are created by calling ExchangeRouter.createOrder, specifying:

- the initial collateral token
- the array of markets to swap through
- the minimum expected output amount

The swap output amount, before fees and price impact, `(amount of tokens in) * (token in price) / (token out price)`.

Market swap order requests are executed using OrderHandler.executeOrder, if the order was created at block `n`, it should be executed with the oracle prices at block `n`.

## Limit Swaps

Passive swap orders that should be executed when the output amount matches the minimum output amount specified by the user.

Limit swap order requests are executed using OrderHandler.executeOrder, if the order was created at block `n`, it should be executed with oracle prices after block `n`.

## Market Increase

Open or increase a long / short perp position.

Market increase order requests are created by calling ExchangeRouter.createOrder, specifying:

- the initial collateral token
- the array of markets to swap through to get the actual collateral token
- the amount to increase the position by
- whether it is a long or short position

Market increase order requests are executed using OrderHandler.executeOrder, if the order was created at block `n`, it should be executed with the oracle prices at block `n`.

## Limit Increase

Passive increase position orders that should be executed when the index token price matches the acceptable price specified by the user.

Long position example: if the current index token price is $5000, a limit increase order can be created with acceptable price as $4990, the order can be executed when the index token price is <= $4990.

Short position example: if the current index token price is $5000, a limit increase order can be created with acceptable price as $5010, the order can be executed when the index token price is >= $5010.

Limit increase order requests are executed using OrderHandler.executeOrder, if the order was created at block `n`, it should be executed with the oracle prices after block `n`.

## Market Decrease

Close or decrease a long / short perp position.

Market decrease order requests are created by calling ExchangeRouter.createOrder, specifying:

- the initial collateral token
- the array of markets to swap through for the actual output token
- the amount to decrease the position by

Market decrease order requests are executed using OrderHandler.executeOrder, if the order was created at block `n`, it should be executed with the oracle prices at block `n`.

## Limit Decrease

Passive decrease position orders that should be executed when the index token price matches the acceptable price specified by the user.

Long position example: if the current index token price is $5000, a limit decrease order can be created with acceptable price as $5010, the order can be executed when the index token price is >= $5010.

Short position example: if the current index token price is $5000, a limit decrease order can be created with acceptable price as $4990, the order can be executed when the index token price is <= $4990.

Limit decrease order requests are executed using OrderHandler.executeOrder, if the order was created at block `n`, it should be executed with the oracle prices after block `n`.

## Stop-Loss Decrease

Passive decrease position orders that should be executed when the index token price crosses the acceptable price specified by the user.

Long position example: if the current index token price is $5000, a stop-loss decrease order can be created with acceptable price as $4990, the order can be executed when the index token price is <= $4990.

Short position example: if the current index token price is $5000, a stop-loss decrease order can be created with acceptable price as $5010, the order can be executed when the index token price is >= $5010.

Stop-loss decrease order requests are executed using OrderHandler.executeOrder, if the order was created at block `n`, it should be executed with the oracle prices after block `n`.

## Price Impact

The code for price impact can be found in the `/pricing` contracts.

Price impact is calculated as:

```
(initial imbalance) ^ (price impact exponent) * (price impact factor) - (next imbalance) ^ (price impact exponent) * (price impact factor)
```

For spot actions (deposits, withdrawals, swaps), imbalance is calculated as the difference in the worth of the long tokens and short tokens.

For example:

- A pool has 10 long tokens, each long token is worth $5000
- The pool also has 50,000 short tokens, each short token is worth $1
- The `price impact exponent` is set to 2 and `price impact factor` is set to `0.01 / 50,000`
- The pool is equally balanced with $50,000 of long tokens and $50,000 of short tokens
- If a user deposits 10 long tokens, the pool would now have $100,000 of long tokens and $50,000 of short tokens
- The change in imbalance would be from $0 to -$50,000
- There would be negative price impact charged on the user's deposit, calculated as `0 ^ 2 * (0.01 / 50,000) - 50,000 ^ 2 * (0.01 / 50,000) => -$500`
- If the user now withdraws 5 long tokens, the balance would change from -$50,000 to -$25,000, a net change of +$25,000
- There would be a positive price impact rebated to the user in the form of additional long tokens, calculated as `50,000 ^ 2 * (0.01 / 50,000) - 25,000 ^ 2 * (0.01 / 50,000) => $375`

For position actions (increase / decrease position), imbalance is calculated as the difference in the long and short open interest.

`price impact exponents` and `price impact factors` are configured per market and can differ for spot and position actions.

The purpose of the price impact is to help reduce the risk of price manipulation, since the contracts use an oracle price which would be an average or median price of multiple reference exchanges. Without a price impact, it may be profitable to manipulate the prices on reference exchanges while executing orders on the contracts.

This risk will also be present if the positive and negative price impact values are similar, for that reason the positive price impact should be set to a low value in times of volatility or irregular price movements.
