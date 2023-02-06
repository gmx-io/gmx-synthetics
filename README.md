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

The oracle system allows for both a minimum price and a maximum price to be signed, this allows information about bid-ask spreads to be included.

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

There are a few main types of contracts:

- Bank contracts which hold funds
- Data storage which stores data
- \*storeUtils utils to serialize, store and retrieve data for structs
- Logic contracts which do not hold funds and do not have internal state
- \*eventUtils utils to emit events

The contracts are separated into these types to allow for gradual upgradeability.

Majority of data is stored using the DataStore contract.

\*storeUtils contracts store struct data using the DataStore, this allows new keys to be added to structs.

EnumberableSets are used to allow order lists and position lists to be easily queried by interfaces or keepers, this is used over indexers as there may be a lag for indexers to sync the latest block. Having the lists stored directly in the contract also helps to ensure that accurate data can be retrieved and verified when needed.

\*eventUtils contracts emit events using the event emitter, the events are generalized to allow new key-values to be added to events without requiring an update of ABIs.

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

# Order Pricing

For limit swap, limit increase, limit decrease and stop-loss decrease orders, the order can be executed at the acceptable price if it is within the range of the validated oracle prices.

For example, if the current index token price is $5000 and a user creates a limit long decrease order with acceptable price as $5010, the order can be executed with the index token price as $5010 if oracle prices $5008 and $5012 are validated, the blocks of the oracle prices must be after the order was updated and must be in ascending order.

# Oracle Prices

Oracle prices are signed as a value together with a precision, this allows prices to be compacted as uint32 values.

The signed prices represent the price of one unit of the token using a value with 30 decimals of precision.

Representing the prices in this way allows for conversions between token amounts and fiat values to be simplified, e.g. to calculate the fiat value of a given number of tokens the calculation would just be: `token amount * oracle price`, to calculate the token amount for a fiat value it would be: `fiat value / oracle price`.

The trade-off of this simplicity in calculation is that tokens with a small USD price and a lot of decimals may have precision issues it is also possible that a token's price changes significantly and results in requiring higher precision.

## Example 1

The price of ETH is 5000, and ETH has 18 decimals.

The price of one unit of ETH is `5000 / (10 ^ 18), 5 * (10 ^ -15)`.

To handle the decimals, multiply the value by `(10 ^ 30)`.

Price would be stored as `5000 / (10 ^ 18) * (10 ^ 30) => 5000 * (10 ^ 12)`.

For gas optimization, these prices are sent to the oracle in the form of a uint8 decimal multiplier value and uint32 price value.

If the decimal multiplier value is set to 8, the uint32 value would be `5000 * (10 ^ 12) / (10 ^ 8) => 5000 * (10 ^ 4)`.

With this config, ETH prices can have a maximum value of `(2 ^ 32) / (10 ^ 4) => 4,294,967,296 / (10 ^ 4) => 429,496.7296` with 4 decimals of precision.

## Example 2

The price of BTC is 60,000, and BTC has 8 decimals.

The price of one unit of BTC is `60,000 / (10 ^ 8), 6 * (10 ^ -4)`.

Price would be stored as `60,000 / (10 ^ 8) * (10 ^ 30) => 6 * (10 ^ 26) => 60,000 * (10 ^ 22)`.

BTC prices maximum value: `(2 ^ 64) / (10 ^ 2) => 4,294,967,296 / (10 ^ 2) => 42,949,672.96`.

Decimals of precision: 2.

## Example 3

The price of USDC is 1, and USDC has 6 decimals.

The price of one unit of USDC is `1 / (10 ^ 6), 1 * (10 ^ -6)`.

Price would be stored as `1 / (10 ^ 6) * (10 ^ 30) => 1 * (10 ^ 24)`.

USDC prices maximum value: `(2 ^ 64) / (10 ^ 6) => 4,294,967,296 / (10 ^ 6) => 4294.967296`.

Decimals of precision: 6.

## Example 4

The price of DG is 0.00000001, and DG has 18 decimals.

The price of one unit of DG is `0.00000001 / (10 ^ 18), 1 * (10 ^ -26)`.

Price would be stored as `1 * (10 ^ -26) * (10 ^ 30) => 1 * (10 ^ 3)`.

DG prices maximum value: `(2 ^ 64) / (10 ^ 11) => 4,294,967,296 / (10 ^ 11) => 0.04294967296`.

Decimals of precision: 11.

## Decimal Multiplier

The formula to calculate what the decimal multiplier value should be set to:

Decimals: 30 - (token decimals) - (number of decimals desired for precision)

- ETH: 30 - 18 - 4 => 8
- BTC: 30 - 8 - 2 => 20
- USDC: 30 - 6 - 6 => 18
- DG: 30 - 18 - 11 => 1

# Funding Fees

Funding fees incentivise the balancing of long and short positions, the side with the larger open interest pays a funding fee to the side with the smaller open interest.

Funding fees for the larger side is calculated as `(funding factor per second) * (open interest imbalance) ^ (funding exponent factor) / (total open interest)`.

For example if the funding factor per second is 1 / 50,000, and the funding exponent factor is 1, and the long open interest is $150,000 and the short open interest is $50,000 then the funding fee per second for longs would be `(1 / 50,000) * 150,000 / 200,000 => 0.000015 => 0.0015%`.

The funding fee per second for shorts would be `0.000015 * 150,000 / 50,000 => 0.000045 => 0.0045%`.

# Borrowing Fees

There is a borrowing fee paid to liquidity providers, this helps prevent users from opening both long and short positions to take up pool capacity without paying any fees.

Borrowing fees are calculated as `borrowing factor * (open interest in usd + pending pnl) ^ (borrowing exponent factor) / (pool usd)` for longs and `borrowing factor * (open interest in usd) ^ (borrowing exponent factor) / (pool usd)` for shorts.

For example if the borrowing factor per second is 1 / 50,000, and the borrowing exponent factor is 1, and the long open interest is $150,000 with +$50,000 of pending pnl, and the pool has $250,000 worth of tokens, the borrowing fee per second for longs would be `(1 / 50,000) * (150,000 + 50,000) / 250,000 => 0.000016 => 0.0016%`.

## Price Impact

The code for price impact can be found in the `/pricing` contracts.

Price impact is calculated as:

```
(initial USD difference) ^ (price impact exponent) * (price impact factor / 2) - (next USD difference) ^ (price impact exponent) * (price impact factor / 2)
```

For swaps, imbalance is calculated as the difference in the worth of the long tokens and short tokens.

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

Note that this calculation is the price impact for a user's trade not the price impact on the pool. For example, a user's trade may have a 0.25% price impact, the next trade for a very small amount may have a 0.5% price impact.

The purpose of the price impact is to:

- Incentivise balance of tokens in pools
- Incentivise balance of longs / shorts
- Reduce risk of price manipulation

Since the contracts use an oracle price which would be an average or median price of multiple reference exchanges. Without a price impact, it may be profitable to manipulate the prices on reference exchanges while executing orders on the contracts.

This risk will also be present if the positive and negative price impact values are similar, for that reason the positive price impact should be set to a low value in times of volatility or irregular price movements.

For the price impact on position increases / decreases, if negative price impact is deducted as collateral from the position, this could lead to the position having a different leverage from what the user intended, so instead of deducting collateral the position's entry / exit price is adjusted based on the price impact.

For example:

- The oracle price of the index token is $5000
- A user opens a long position of size $50,000 with a negative price impact of 0.1%
- The user's position size is in USD is $50,000 and the size in tokens is (50,000 / 5000) \* (100 - 0.1)% => 9.99
- This gives the position an entry price of 50,000 / 9.99 => ~$5005
- The negative price impact is tracked as a number of index tokens in the pool
- In this case there would be 0.01 index tokens in the position impact pool
- The pending PnL of the user at this point would be (50,000 - 9.99 \* 5000) => $50
- The tokens in the position impact pool should be accounted for when calculating the pool value to offset this pending PnL
- The net impact on the pool is zero, +$50 from the pending negative PnL due to price impact and -$50 from the 0.01 index tokens in the position impact pool worth $50
- If the user closes the position at a negative price impact of 0.2%, the position impact pool would increase to 0.03 index tokens
- The user would receive (original position collateral - $150)
- The pool would have an extra $150 of collateral which continues to have a net zero impact on the pool value due to the 0.03 index tokens in the position impact pool

If the index token is different from both the long and short token of the market, then it is possible that the pool value becomes significantly affected by the position impact pool, if the position impact pool is very large and the index token has a large price increase. Due to this, there should be a method to gradually reduce the size of the position impact pool.

Price impact is also tracked using a virtual inventory value for positions and swaps, this tracks the imbalance of tokens across similar markets, e.g. ETH/USDC, ETH/USDT.

# Fees

There are configurable swap fees and position fees and per market.

Execution fees are also estimated and accounted for on creation of deposit, withdrawal, order requests so that keepers can execute transactions at a close to net zero cost.

# Reserve Amounts

If a market has stablecoins as the short collateral token it should be able to fully pay short profits if the max short open interest does not exceed the amount of stablecoins in the pool.

If a market has a long collateral token that is different from the index token, the long profits may not be fully paid out if the price increase of the index token exceeds the price increase of the long collateral token.

Markets have a reserve factor that allows open interest to be capped to a percentage of the pool size, this reduces the impact of profits of short positions and reduces the risk that long positions cannot be fully paid out.

# Roles

Roles are managed in the RoleStore, the RoleAdmin has access to grant and revoke any role.

The RoleAdmin will be the deployer initially, but this should be removed after roles have been setup.

After the initial setup:

- Only the Timelock contract should have the RoleAdmin role

- New roles can be granted by timelock admins with a time delay

- System values should only be set using the Config contract

- No EOA should have a Controller role

- Config keepers and timelock admins could potentially disrupt regular operation through the disabling of features, incorrect setting of values, whitelisting malicious tokens, abusing the positive price impact value, etc

- It is expected that the timelock multisig should revoke the permissions of malicious or compromised accounts

- Order keepers and frozen order keepers could potentially extract value through transaction ordering, delayed transaction execution etc, this will be partially mitigated with a keeper network

- Oracle signers are expected to accurately report the price of tokens

# Known Issues

- Collateral tokens need to be whitelisted with a configured TOKEN_TRANSFER_GAS_LIMIT

- Rebasing tokens, tokens that change balance on transfer, with token burns, etc, are not compatible with the system and should not be whitelisted

- Order keepers can use prices from different blocks for limit orders with a swap, which would lead to different output amounts

- Order keepers are expected to validate whether a transaction will revert before sending the transaction to minimize gas wastage

- A user can reduce price impact by using high leverage positions, this is partially mitigated with the MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER value

- Price impact can be reduced by using positions and swaps and trading across markets, chains, forks, other protocols, this is partially mitigated with virtual inventory tracking

- Virtual IDs must be set on market creation / token whitelisting, if it is set after trading for the token / market is done, the tracking would not be accurate and may need to be adjusted

# Commands

To compile contracts:

```
npx hardhat compile
```

To run all tests:

```
npx hardhat test
```

To print code metrics:

```
npx ts-node metrics.ts
```

To print test coverage:

```
npx hardhat coverage
```
