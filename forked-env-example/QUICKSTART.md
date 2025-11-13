# GMX Forked env example - Quick Start

Standalone fork tests for GMX Synthetics V2 on Arbitrum. Demonstrates how to open/close positions using real mainnet contracts.

**Self-contained**: Copy this directory anywhere and follow the setup below.

**Two approaches**: Use either **Foundry** (Solidity tests) or **Anvil** (TypeScript scripts) depending on your preference.

---

## Table of Contents

- [Approach A: Foundry (Solidity Tests)](#approach-a-foundry-solidity-tests)
- [Approach B: Anvil (TypeScript Scripts)](#approach-b-anvil-typescript-scripts)
- [What This Does](#what-this-does)
- [How It Works](#how-it-works)
- [What You'll Learn](#what-youll-learn)
- [Choosing Your Approach](#choosing-your-approach)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)
- [Technical Details](#technical-details)
- [Resources](#resources)

---

## Approach A: Foundry (Solidity Tests)

**Best for**: Solidity-first developers, quick testing, vm cheatcode usage

### Setup (2 minutes)

```bash
cd forked-env-example

# Initialize git (required for forge install if setting up as standalone repo)
git init

# Install dependencies (just forge-std)
forge install foundry-rs/forge-std --no-commit

# Set Arbitrum RPC URL
cp .env.example .env
# Edit .env and set your ARBITRUM_RPC_URL
source .env
```

### Run Tests

```bash
# Run all tests
forge test --fork-url $ARBITRUM_RPC_URL -vv

# Run specific tests
forge test --fork-url $ARBITRUM_RPC_URL --match-test testOpenLongPosition -vv
forge test --fork-url $ARBITRUM_RPC_URL --match-test testCloseLongPosition -vv
```

### Key Files (Foundry)

- `test/GmxOrderFlow.t.sol` - Main Solidity test contract
- `contracts/utils/GmxForkHelpers.sol` - Reusable helpers (uses vm cheatcodes)

---

## Approach B: Anvil (TypeScript Scripts)

**Best for**: JavaScript/TypeScript developers, integration testing, production-like testing

### Prerequisites

- Node.js v18+ and npm
- Foundry (for Anvil binary: `curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Arbitrum RPC URL (see `.env.example` for options)

### Setup (3 minutes)

```bash
cd forked-env-example

# Install npm dependencies
npm install

# Set Arbitrum RPC URL
cp .env.example .env
# Edit .env and set your ARBITRUM_RPC_URL
source .env
```

### Run Tests

**Terminal 1** - Start Anvil fork:
```bash
npm run anvil:start

# Or run directly:
# anvil --fork-url $ARBITRUM_RPC_URL --fork-block-number 392496384 --host 127.0.0.1 --port 8545
```

**Terminal 2** - Run TypeScript tests:
```bash
# Test opening a long position
npm run test:open

# Test closing a position
npm run test:close

# Run all tests sequentially
npm run test:all
```

### Stop/Restart Anvil

To stop Anvil:
```bash
# Kill all anvil processes
pkill -9 anvil
```

**Note**: Anvil maintains state between test runs. Restart it for a fresh fork state:
```bash
pkill -9 anvil && npm run anvil:start
```

### Key Files (Anvil)

- `scripts/testOpenPosition.ts` - Open long position test
- `scripts/testClosePosition.ts` - Close position test
- `scripts/helpers.ts` - Reusable utilities (uses Anvil RPC methods)
- `hardhat.config.ts` - Hardhat/Anvil configuration

## What This Does

Tests demonstrate the GMX order flow:

1. **Create order** - User sends collateral + execution fee to GMX
2. **Execute order** - Keeper executes with oracle prices (mocked in these tests)
3. **Verify position** - Check position was created/closed correctly

Example: `testOpenLongPosition` opens a 2.5x leveraged long ETH position with 0.001 ETH collateral (~$3.89 → ~$9.7 position).

---

## How It Works

### Fork Testing
Both approaches run against **real GMX contracts** on Arbitrum mainnet at block **392496384** (matches a real production transaction for accurate price comparison).

### Oracle Mocking
GMX uses Chainlink Data Streams (off-chain signed prices that require cryptographic validation). To test on a fork without real signatures:

- **Foundry approach**: Uses `vm.etch()` to replace oracle provider bytecode at production address
- **Anvil approach**: Uses `anvil_setCode` RPC method to replace oracle provider bytecode

Both methods achieve the same result: bypass signature verification by replacing the provider contract with `MockOracleProvider.sol`.

### Architecture Overview

**Shared contracts** (used by both approaches):
- `contracts/constants/GmxArbitrumAddresses.sol` - Production contract addresses ([all Arbitrum deployments](https://github.com/gmx-io/gmx-synthetics/blob/main/docs/arbitrum-deployments.md))
- `contracts/mock/MockOracleProvider.sol` - Mock oracle implementation (critical for testing)
- `contracts/interfaces/IGmxV2.sol` - Minimal GMX interfaces (copied from main contracts)

**Foundry-specific**:
- `contracts/utils/GmxForkHelpers.sol` - Solidity helpers using vm cheatcodes
- `test/GmxOrderFlow.t.sol` - Solidity test contract

**Anvil-specific**:
- `scripts/helpers.ts` - TypeScript utilities using Anvil RPC methods
- `scripts/testOpenPosition.ts` - Open position test script
- `scripts/testClosePosition.ts` - Close position test script
- `hardhat.config.ts` - Hardhat configuration for Anvil network

---

## What You'll Learn

- How to create GMX orders (MarketIncrease, MarketDecrease)
- Two-step execution model (user creates → keeper executes)
- Handling oracle prices and execution fees
- Querying positions and verifying state changes
- Fork testing techniques (both Foundry and Anvil approaches)

**Oracle provider address mocked**: `0xE1d5a068c5b75E0c7Ea1A9Fe8EA056f9356C6fFD` (Chainlink Data Stream provider, verified from mainnet transactions)

---

## Choosing Your Approach

| Feature | Foundry | Anvil |
|---------|---------|-------|
| **Language** | Solidity | TypeScript/JavaScript |
| **Setup time** | ~2 min | ~3 min |
| **Dependencies** | forge-std only | Hardhat + ethers.js |
| **Speed** | Very fast | Fast (requires node running) |
| **Cheatcodes** | Native vm.* | Anvil RPC methods |
| **Use case** | Quick Solidity testing | Integration testing, JS apps |
| **Best for** | Protocol developers | DApp developers |

**Recommendation**:
- Choose **Foundry** if you're working primarily in Solidity or need fast iteration
- Choose **Anvil** if you're integrating with TypeScript/JavaScript applications or prefer production-like testing environments

---

## Troubleshooting

### "Connection refused" or "Cannot connect to Anvil"

**Issue**: Anvil is not running or not accessible.

**Solution**:
- Check that Anvil terminal is still running
- Verify it's listening on `127.0.0.1:8545`
- Restart Anvil: `pkill -9 anvil && npm run anvil:start`

### "Insufficient funds" error

**Issue**: Test accounts don't have enough ETH.

**Solution**: The scripts automatically fund accounts using `anvil_setBalance`. If this fails, check that Anvil RPC is accessible.

### "Invalid RPC URL" or fork errors

**Issue**: ARBITRUM_RPC_URL is not set or invalid.

**Solution**:
- Check `.env` file has `ARBITRUM_RPC_URL` set
- Test the URL: `curl -X POST $ARBITRUM_RPC_URL -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'`
- Try a different RPC provider (Alchemy, Infura, public endpoints in `.env.example`)

### "Order execution failed"

**Issue**: Oracle mocking might have failed.

**Solution**:
- Check Anvil logs for errors
- Verify `MockOracleProvider` deployed successfully (check script output)
- Ensure `anvil_setCode` succeeded

### TypeScript compilation errors

**Issue**: TypeScript or typechain types not generated.

**Solution**:
```bash
npm install
npx hardhat compile
```

---

## Advanced Usage

### Custom Fork Block

To fork at a different block, modify `package.json`:

```json
{
  "scripts": {
    "anvil:start": "anvil --fork-url $ARBITRUM_RPC_URL --fork-block-number YOUR_BLOCK_NUMBER"
  }
}
```

Or use `hardhat.config.ts` for Hardhat network forking.

### Different Test Parameters

Edit test scripts (`scripts/testOpenPosition.ts`, etc.) to modify:

- **Collateral amount**: Change `ETH_COLLATERAL` constant
- **Leverage**: Change `LEVERAGE` constant
- **Prices**: Adjust `ETH_PRICE_USD`, `USDC_PRICE_USD` in `setupMockOracleProvider()`
- **Markets**: Use different market addresses from `GMX_ADDRESSES`

### Running Against Different Networks

To test on Avalanche or other GMX-supported networks:

1. Update `GMX_ADDRESSES` constants in `scripts/helpers.ts`
2. Change `ARBITRUM_RPC_URL` to your network's RPC
3. Update whale addresses for token funding
4. Adjust fork block number to a recent block on that network

---

## Technical Details

### Key Versions
- **ethers.js**: v5.7.2 (compatible with most tooling)
- **Hardhat**: v2.26.1
- **TypeScript**: v4.8.4
- **Solidity**: 0.8.20 (Paris EVM)

### Fork Configuration
- **Block number**: 392496384 (chosen to match real mainnet transaction for accurate price comparison)
- **Network**: Arbitrum One (Chain ID: 42161)
- **Oracle provider**: `0xE1d5a068c5b75E0c7Ea1A9Fe8EA056f9356C6fFD` (Chainlink Data Streams, verified from mainnet)

### Package Size
- **node_modules**: ~50MB after `npm install`
- **Build artifacts**: ~15MB after compilation

---

## Resources

- [GMX Synthetics Documentation](https://docs.gmx.io)
- [GMX Arbitrum Deployments](https://github.com/gmx-io/gmx-synthetics/blob/main/docs/arbitrum-deployments.md)
- [Foundry Book - Anvil](https://book.getfoundry.sh/anvil/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Ethers.js v5 Docs](https://docs.ethers.org/v5/)
