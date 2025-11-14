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
anvil --fork-url $ARBITRUM_RPC_URL --fork-block-number 392496384 --host 127.0.0.1 --port 8545
```

**Terminal 2** - Run TypeScript test:
```bash
# Test opening and closing a long position
npm test
```

### Stop/Restart Anvil

To stop Anvil:
```bash
# Kill all anvil processes
pkill -9 anvil
```

### Key Files (Anvil)

- `scripts/testOpenPosition.ts` - Complete test (opens and closes long position)
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
- `scripts/testOpenPosition.ts` - Complete test (opens and closes position)
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

---

## Resources

- [GMX Synthetics Documentation](https://docs.gmx.io)
- [GMX Arbitrum Deployments](https://github.com/gmx-io/gmx-synthetics/blob/main/docs/arbitrum-deployments.md)
