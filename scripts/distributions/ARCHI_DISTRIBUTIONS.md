# Archi Distributions

  - Farmers:   169,573.39 fsGLP (10.50%)
  - LPs:     1,445,599.59 fsGLP (89.50%)
  - Total:   1,615,172.98 fsGLP

---

## How Archi Finance Works

Archi Finance is a **two-sided leveraged yield farming protocol** that connects passive liquidity providers with leveraged farmers seeking amplified exposure to GMX GLP yields.

### The Two Sides

#### 1. Liquidity Providers (LPs)
- deposit single assets (WETH, USDT, USDC, or WBTC) into vault contracts
- receive vsTokens (vault share tokens) that are auto-staked in BaseReward pools
- earn fsGLP proportional to their vault's borrowed amounts. fsGLP earns GMX trading fees (WETH rewards)
- low risk (1:1 asset backing, no liquidation risk)

#### 2. Leveraged Farmers
- Deposit collateral and borrow from LP vaults to create leveraged GLP positions (up to 10x)
- Borrow actual tokens (WETH, WBTC, USDT, USDC) from multiple vaults, then converts all borrowed tokens + collateral to fsGLP
- earn amplified GMX trading fees and esGMX rewards via leveraged fsGLP exposure
- high risk (liquidation if health factor < 40% or position open > 365 days)

```
LP deposits USDC → Vault → vsUSDC tokens → Earns yield
                      ↓
                   Borrowed by Farmer
                      ↓
Farmer's Collateral + Borrowed USDC → Converted to fsGLP → Earns GMX rewards
```

When a farmer borrows tokens from vaults, those tokens are converted to fsGLP for the leveraged position. The protocol tracks which vault each portion came from. Upon distribution, LPs get back the fsGLP value that originated from their vault's borrowed tokens, proportional to their vault share.

Current distribution returns collateral from active positions that remained open.

### Distributions Example

LP1 deposits: 10 WETH --> WETH Vault mints: 10 vsWETH (which is auto-staked in BaseReward pool)

LP2 deposits: 50,000 USDC --> USDC Vault mints: 50,000 vsUSDC (which is auto-staked in BaseReward pool)

Farmer Opens Position (Borrows from BOTH vaults):
- Farmer deposits: 5,000 USDC (collateral)
- Protocol reserves: 250 USDC (5% liquidator fee) → Net collateral: 4,750 USDC
- Farmer borrows: 10 WETH from WETH vault → WETH Vault mints: 10 vsWETH
- Protocol sends to GMX: 10 WETH + 20000 USDC + 5000 USDC (borrowed + collateral)
- GMX mints (if considerring $1 / fsGLP): 
  - fsGLP for farmer's collateral --> 4,750 fsGLP
  - fsGLP for WETH vault portion --> 50,000 fsGLP
  - fsGLP for USDC vault postion --> 20,000 fsGLP
Protocol records:
- Collateral portion: 4,750 fsGLP (from 4,750 USDC collateral)
- Liquidator fee: 250 USDC (5%): 250 fsGLP (held in CreditUser#2)
- WETH vault portion: 50,000 fsGLP (from 10 WETH borrowed)
- USDC vault portion: 20,000 fsGLP (from 20,000 USDC borrowed)


Distributions script splits the fsGLP according the farmer/vaults proportionally:
- farmer's share (i.e. collateral + liquidator's fee)
- vaults get back fsGLP proportional to the amounts borrowed (when position is created, events emit the fsGLP amounts, which are then mapped to vault addresses)
- from each vault, LPs get a proportional share (vsTokens / totalSupply)

Liquidator fee is held in CreditUser#2 (~8k) and the rest in GMXExecutor (~1.6M).

---


### Real-tx Example

This example shows an actual position that borrowed from **2 vaults simultaneously**: WETH and USDC.

#### Opening Position (April 5, 2023)

**Transaction:** [0x0914fd...09adac](https://arbiscan.io/tx/0x0914fd43c5607f2c680f973e616ba32e224559d4c631364ca744710f3409adac)

**Farmer Action:**
- Deposits **0.45 ETH** as collateral ($1,800 at the time)
- Borrows from **2 vaults**:
  - **WETH vault**: 1.71 WETH (ratio: 400 = 40%)
  - **USDC vault**: 4,081.23 USDC (ratio: 500 = 50%)
- Protocol takes 10% liquidator fee: **0.045 ETH** (note: early position with 10% fee)

**Position Created:**
```
Total borrowed: 1.71 WETH + 4,081.23 USDC (~$11,000 combined)
├── Collateral: 0.4275 ETH (after 10% fee) → 826.23 fsGLP
├── Liquidator fee: 0.0225 ETH → held in escrow (returned to farmer on normal close, or to liquidator if liquidated)
├── From WETH vault: 1.71 WETH → 3,304.93 fsGLP
└── From USDC vault: 4,081.23 USDC → 4,128.68 fsGLP

Total position: 8,259.84 fsGLP (~10x leverage)
```

**LP Outcomes:**
- WETH vault receive **1.71 vsWETH** tokens (representing their proportional share of vault liquidity)
- USDC vault receive **4,081.23 vsUSDC** tokens (representing their proportional share of vault liquidity)
- Each vault's earn returns only on what their vault lent

**Note:** The farmer borrowed actual tokens (1.71 WETH and 4,081.23 USDC), which along with the collateral were converted to fsGLP. The protocol tracks which vault each fsGLP portion came from via the CreateUserBorrowed event.

#### Closing Position (April 10, 2023) - 5 days later

**Transaction:** [0x342165...6fe7e3](https://arbiscan.io/tx/0x34216585484b65fbb5c00b3dda176ae8d509a20de5323fb53e11cd8a196fe7e3)

**Protocol Burns fsGLP:**
- Burns WETH borrowed portion: **3,247.32 fsGLP** → receives 1.71 WETH
- Burns USDC borrowed portion: **4,185.31 fsGLP** → receives 4,085.31 USDC
- Burns collateral portion: **827.21 fsGLP** → receives 0.436 WETH

**Repayment:**
- Repays WETH vault: **1.71 WETH** (borrowed 1.71 WETH, +0.0017 WETH profit)
- Repays USDC vault: **4,085.31 USDC** (borrowed 4,081.23 USDC, +4.08 USDC profit)

**Final Outcomes:**

|              | Deposited | Received | Gain/Loss | Return |
|--------------|-----------|----------|-----------|--------|
| **Farmer**   | 0.45 ETH | 0.436 ETH | -0.014 ETH | -3.1% |
| **WETH LPs** | 1.71 WETH | 1.71 WETH | +0.0017 WETH | +0.1% (5 days) |
| **USDC LPs** | 4,081.23 USDC | 4,085.31 USDC | +4.08 USDC | +0.1% (5 days) |

---

## Farmer Distributions

### Farmer Breakdown (4 farmers, 47 positions)

| Farmer | Positions | Collateral | Liquidator Fees | Total fsGLP | % |
|--------|-----------|------------|-----------------|-------------|---|
| 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 18 | 88,670.61 | 4,667.77 | **93,338.38** | 55.04% |
| 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 18 | 66,838.40 | 3,519.29 | **70,357.69** | 41.49% |
| 0xf9748b92ca6b8e220fd220f56ce527869e34bb66 | 10 | 5,486.26 | 289.51 | **5,775.77** | 3.41% |
| 0x500dd643792a3d283c0d3db3af9b69ad6b862aae | 1 | 99.45 | 2.10 | **101.55** | 0.06% |
| **TOTAL** | **47** | **161,094.72** | **8,478.67** | **169,573.39** | **100%** |

### Vault Borrowing (for LP distribution)

Total borrowed fsGLP: 1,445,599.59 (89.50% of protocol)

Farmers borrowed actual tokens (WETH, WBTC, USDT, USDC) from vaults, which were converted to fsGLP. Each vault's LPs receive their proportional share of the fsGLP that originated from their vault's borrowed tokens.

| Vault | Borrowed fsGLP | % of LP Total |
|-------|----------------|---------------|
| **WBTC** | 848,962.09 | 58.72% |
| **WETH** | 248,165.92 | 17.16% |
| **USDT** | 190,986.02 | 13.21% |
| **USDC** | 157,485.56 | 10.89% |
| **TOTAL** | **1,445,599.59** | **100.00%** |

<details>
<summary><strong>How vault borrowing is calculated</strong></summary>

The `calculateDistributions.ts` script analyzes all 47 active positions and aggregates borrowed fsGLP by vault.

**Process:**
1. Queries `CreateUserLendCredit` events from CreditUser #2 contract (all position openings)
2. Queries `CreateUserBorrowed` events (execution details with fsGLP amounts)
3. Checks `isTerminated()` to filter for active positions only
4. Maps credit manager addresses to vault tokens (WETH/WBTC/USDT/USDC)
5. Aggregates borrowed fsGLP per vault across all active positions

**Why this matters for LPs:**
- Farmer positions can borrow from multiple vaults simultaneously
- Each vault's LPs are only entitled to share of their vault's borrowed amount
- Example: If a farmer borrowed 10 fsGLP from WETH vault and 20 fsGLP from WBTC vault:
  - WETH LPs split the 10 fsGLP proportionally
  - WBTC LPs split the 20 fsGLP proportionally
  - No cross-vault subsidization

</details>

### Archi fsGLP holdings

  - GMXExecutor: 1,606,694.32 (farmer positions)
  - CreditUser #2: 8,478.67 (liquidator fees)
  - CreditAggregator: 99.81 (unacounted & not included in the above calculations)

Total:  1,615,172.98 + 99.81 = 1,615,272.79

### Contract Addresses

#### Archi Finance
- **CreditUser #1:** `0x8718CaD7DE1B411616145669c1e1242051342fb3` (from web archive --> 0 active positions)
- **CreditUser #2:** `0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E` (position data, events --> 47 active positions)
- **GMXExecutor:** `0x49ee14e37cb47bff8c512b3a0d672302a3446eb1` (holds fsGLP)
- **CreditAggregator:** `0x437a182b571390c7e5d14cc7103d3b9d7628faca` (small unaccounted amount)
- **CreditCaller:** `0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35` (user entry point)

#### Vaults
- **WETH Vault:** `0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4`
- **WBTC Vault:** `0xee54A31e9759B0F7FDbF48221b72CD9F3aEA00AB`
- **USDT Vault:** `0x179bD8d1d654DB8aa1603f232E284FF8d53a0688`
- **USDC Vault:** `0xa7490e0828Ed39DF886b9032ebBF98851193D79c`

#### Tokens
- **fsGLP Token:** `0x1aDDD80E6039594eE970E5872D247bf0414C8903`
- **WETH:** `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`
- **WBTC:** `0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f`
- **USDT:** `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`
- **USDC:** `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8`


### Run Complete Calculation (time: ~2-3 minutes)

```bash
# Use public RPC (slower with rate limiting)
npx hardhat run --network arbitrum scripts/distributions/archi/calculateDistributions.ts

# Or use fast RPC (paid Alchemy/Infura)
FAST_RPC=true npx hardhat run --network arbitrum scripts/distributions/archi/calculateDistributions.ts

# Preview all LPs in markdown (default shows top 20)
PREVIEW_ALL_LPS=true npx hardhat run --network arbitrum scripts/distributions/archi/calculateDistributions.ts
```

**What it does:**
1. **Step 1**: Verifies total fsGLP holdings across GMXExecutor, CreditUser #2, and CreditAggregator
2. **Step 2**: Extracts all active farmer positions from blockchain events
3. **Step 3**: Calculates farmer distributions (collateral + liquidator fee share)
4. **Step 4**: Calculates vault borrowing totals for LP distribution
5. **Step 5**: Calculates LP distributions based on vsToken holdings

**Output Files:**
- **`archi-farmer-positions.csv`** - All 47 active positions with complete details
- **`archi-farmer-distributions.csv`** - Final distributions for 4 farmers
- **`archi-lp-distributions.csv`** - LP distributions with vsToken balances per vault
- **`ARCHI_DISTRIBUTIONS.md`** - Updated distribution tables (this file)

<details>
<summary><strong>How calculations work</strong></summary>

### Step 1: Verify Total fsGLP

Queries on-chain balances:
- **GMXExecutor** (`0x49ee14e37cb47bff8c512b3a0d672302a3446eb1`): 1,606,694.32 fsGLP
- **CreditUser #2** (`0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E`): 8,478.67 fsGLP
- **CreditAggregator** (`0x437a182b571390c7e5d14cc7103d3b9d7628faca`): ~100 fsGLP (not distributed)
- **Total:** 1,615,172.99 fsGLP

### Step 2: Extract Active Positions

Queries blockchain events from CreditUser #2:
1. **CreateUserLendCredit** events (112 position openings)
   - Captures: farmer address, collateral token/amount, borrowed tokens, leverage ratios
2. **CreateUserBorrowed** events (112 position executions)
   - Captures: fsGLP amounts (collateral + borrowed per vault), credit managers
3. **Filters** via `isTerminated()` on-chain calls
   - Result: 47 active positions

### Step 3: Calculate Farmer Distributions

For each farmer:
```
Collateral fsGLP = Sum of collateral across all positions
Liquidator Fees Share = (farmer_total_fsGLP / all_positions_fsGLP) × 8,478.67
Total Distribution = Collateral fsGLP + Liquidator Fees Share
```

Liquidator Fee Context:
- 5% of collateral reserved at position opening
- Held in CreditUser #2 as incentive for liquidators
- Returned to farmers on normal position closure
- All 47 active positions use 5% fee (changed from 10% on Apr 5, 2023)

### Step 4: Calculate Vault Borrowing

Aggregates borrowed fsGLP by vault:
- Maps credit manager addresses to vault tokens (WETH/WBTC/USDT/USDC)
- Sums borrowed fsGLP per vault across all 47 positions
- Each position can borrow from multiple vaults simultaneously
- Each vault's LPs only receive share of their vault's borrowed fsGLP

### Step 5: Calculate LP Distributions

Discovers LPs and calculates distributions:
1. **Query StakeFor events** from each vault's BaseReward contract (100% accurate)
2. **Query current vsToken balances** for each LP
3. **Calculate share**: `LP_fsGLP = (LP_vsTokens / total_vsTokens) × vault_borrowed_fsGLP`
4. **Aggregate** across vaults per LP

**Prerequisites:**
- Core contract addresses (GMXExecutor, CreditUser2, CreditAggregator, fsGLP)
  - Found by analyzing contracts deployed by Archi Deployer (0x60A3D336c39e8faC40647142d3068780B4Bc4C93)
- Vault BaseReward contract addresses (WETH, WBTC, USDT, USDC)
  - Found from vault deployment transactions and contract interactions
- LP addresses are discovered automatically via StakeFor events

</details>

---

## LP Distributions

Total to distribute: **1,445,599.59 fsGLP** (89.50% of protocol)

### LP Breakdown (405 LPs across 4 vaults)

| Vault | Distributed fsGLP | % of LP Total | Number of LPs |
|-------|------------------|---------------|---------------|
| **WBTC** | 848,962.09 | 58.72% | 193 |
| **WETH** | 248,165.92 | 17.16% | 278 |
| **USDT** | 190,986.02 | 13.21% | 169 |
| **USDC** | 157,485.56 | 10.89% | 248 |

**Note:** LPs can provide to multiple vaults. Total unique LPs: 405

**Distribution Method:**
- Based on current vsToken holdings (queried on-chain from BaseReward contracts)
- Formula: `LP_fsGLP = (LP_vsTokens / total_vsTokens) × vault_borrowed_fsGLP`
- Each vault distributes independently to its LPs

---

## Complete Distribution Summary

| Category | Amount (fsGLP) | % of Total | Recipients |
|----------|---------------|------------|------------|
| **Farmers** | 169,573.39 | 10.50% | 4 farmers (47 positions) |
| **LPs** | 1,445,599.59 | 89.50% | 405 unique LPs |
| **TOTAL** | **1,615,172.98** | **100%** | **409 unique addresses** |

**Not Distributed:**
- CreditAggregator: 99.81 fsGLP (source unknown, excluded from distribution)

---

## Detailed Distribution Tables

*Last updated: 2025-11-04 13:19:19 UTC*

### Vault Borrowing Summary (Farmers)

Farmers borrowed tokens (WETH, WBTC, USDT, USDC) from these vaults to create leveraged positions. The borrowed tokens were converted to fsGLP and tracked by vault. This fsGLP is distributed to LPs based on their vsToken holdings.

| Vault | Borrowed fsGLP | % of Total | Farmer Positions |
|-------|----------------|------------|------------------|
| WBTC | 848,962.09 | 58.72% | 33 |
| WETH | 248,165.92 | 17.16% | 19 |
| USDT | 190,986.02 | 13.21% | 8 |
| USDC | 157,485.56 | 10.89% | 11 |
| **TOTAL** | **1,445,599.59** | **100%** | **71** |

### Farmer Distributions (4 farmers)

Farmers deposited collateral and borrowed tokens from vaults to create leveraged fsGLP positions. All assets were converted to fsGLP. They receive their collateral fsGLP entitlement plus a proportional share of liquidator fees.

The **Capped Total fsGLP** column accounts for the difference between the average fsGLP price when farmers opened their positions versus the fsGLP price at the time of the incident ($1.45), calculated as: `total_fsGLP * avg_price_at_open / price_at_incident`.

The **Recovery %** column shows what percentage of their original total fsGLP each farmer receives back after the cap is applied (i.e., `capped_total / total_fsGLP * 100`).

| Farmer Address | Collateral fsGLP | Liquidator Fees Share | Total fsGLP | Avg Price at Open | Price at Incident | Capped Total fsGLP | Recovery % |
|----------------|------------------|----------------------|-------------|-------------------|-------------------|--------------------|------------|
| 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 88,670.61 | 4,667.77 | **93,338.38** | $1.0929 | $1.45 | **70,243.62** | 75.26% |
| 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 66,838.40 | 3,519.29 | **70,357.69** | $1.0213 | $1.45 | **49,480.08** | 70.33% |
| 0xf9748b92ca6b8e220fd220f56ce527869e34bb66 | 5,486.26 | 289.51 | **5,775.77** | $1.2012 | $1.45 | **4,777.51** | 82.72% |
| 0x500dd643792a3d283c0d3db3af9b69ad6b862aae | 99.45 | 2.10 | **101.55** | $1.0117 | $1.45 | **70.74** | 69.67% |
| **TOTAL** | **161,094.72** | **8,478.67** | **169,573.39** | - | **$1.45** | **124,571.96** | **73.46%** |

**Note:** Full farmer distribution details available in `out/archi-farmer-distributions.csv` (4 farmers total)

<details>
<summary><strong>All Farmer Positions (47 positions)</strong></summary>

Complete details for all active farmer positions including opening dates, historical GLP prices, and transaction hashes.

| # | Farmer | Pos# | Opening Date | Collateral (fsGLP) | GLP Price | Collateral Value (USD) | Total fsGLP | Leverage | Transaction |
|---|--------|------|--------------|-------------------|-----------|----------------------|-------------|----------|-------------|
| 1 | 0x500dd643792a3d283c0d3db3af9b69ad6b862aae | 2 | 2023-07-07 | 99.45 | $1.0117 | $100.61 | 397.33 | 4.00x | [0x6993...](https://arbiscan.io/tx/0x69933b36da7191e45ddb84da3243d05bc30c70d0eee4a034b4f0eb8e4ed6982d) |
| 2 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 1 | 2023-06-27 | 2850.00 | $1.0194 | $2,905.31 | 28476.53 | 9.99x | [0x4b27...](https://arbiscan.io/tx/0x4b27f486966275af1d564359773d054d2d9f83375e17442e89bd988568d4d920) |
| 3 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 2 | 2023-06-27 | 2850.00 | $1.0197 | $2,906.28 | 28470.86 | 9.99x | [0xb9a1...](https://arbiscan.io/tx/0xb9a12a448811d54abc826b9595a62134b58bbd697677b7592d9cc40bc434c3e9) |
| 4 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 3 | 2023-06-27 | 3706.56 | $1.0200 | $3,780.57 | 37031.03 | 9.99x | [0x84f2...](https://arbiscan.io/tx/0x84f27f7ddda697d106df530aacec7f17445ffc855596452875523d02f2aabe21) |
| 5 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 6 | 2023-06-27 | 1900.00 | $1.0183 | $1,934.85 | 18952.21 | 9.97x | [0xefcd...](https://arbiscan.io/tx/0xefcd89238831fefc3200d9c407954799e0372d5c9c7b0e911ba74c2a8f6e6336) |
| 6 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 7 | 2023-06-27 | 2850.00 | $1.0181 | $2,901.67 | 28429.72 | 9.98x | [0xa78a...](https://arbiscan.io/tx/0xa78a1d106b8e14724e6bb4f6d940233713bacb73f66da817565ed0fd4fdf0098) |
| 7 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 8 | 2023-06-27 | 1900.00 | $1.0189 | $1,935.88 | 18953.15 | 9.98x | [0xfc23...](https://arbiscan.io/tx/0xfc2395d8be5d3496e922b57dd279d910ef7fa40f9074033ce993ddd711057538) |
| 8 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 9 | 2023-06-27 | 1900.00 | $1.0188 | $1,935.80 | 18950.32 | 9.97x | [0xe00a...](https://arbiscan.io/tx/0xe00a296d8a59d8fbbaf860af1e783b2398fa779095991887481c865b1610640b) |
| 9 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 10 | 2023-06-27 | 1665.85 | $1.0187 | $1,697.04 | 16614.09 | 9.97x | [0xbd16...](https://arbiscan.io/tx/0xbd16a2d0c318526942b132542ad0a3c36c9ad96dbe43e9c5473026db382d2c84) |
| 10 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 11 | 2023-06-27 | 3614.43 | $1.0187 | $3,682.03 | 36048.70 | 9.97x | [0x3040...](https://arbiscan.io/tx/0x30400c156ff42f102c309f21001bd633099e3b0f483cc098d84d62df875ab287) |
| 11 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 12 | 2023-06-28 | 665.00 | $1.0143 | $674.53 | 6638.03 | 9.98x | [0xf28a...](https://arbiscan.io/tx/0xf28ab324364549007e166310f8e9207303549c8fcc93c2e2a8504c95b8687cd9) |
| 12 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 13 | 2023-06-28 | 1208.06 | $1.0140 | $1,224.98 | 12058.88 | 9.98x | [0x1c15...](https://arbiscan.io/tx/0x1c157a4428776ff85a61c2edcc7854c397fc9c239d77615a7c6234b3611b542f) |
| 13 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 16 | 2023-06-30 | 950.00 | $1.0229 | $971.78 | 9482.90 | 9.98x | [0x0351...](https://arbiscan.io/tx/0x0351372ff1f5a60b899897c7c5a913373b61eaa7470125cc2c42b1002c0bb515) |
| 14 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 17 | 2023-06-30 | 1503.20 | $1.0229 | $1,537.64 | 15004.92 | 9.98x | [0x3edb...](https://arbiscan.io/tx/0x3edb640b004ef0a6deefb68441f9c4b93aa3fc5d2d04193418aeb12d8243e28d) |
| 15 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 18 | 2023-07-01 | 950.00 | $1.0221 | $971.01 | 9482.90 | 9.98x | [0x3323...](https://arbiscan.io/tx/0x3323f7f89a17f8aa525fecd976792c05c2af6dc9f7c7404b402c271fac48a0d5) |
| 16 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 19 | 2023-07-01 | 1172.27 | $1.0217 | $1,197.70 | 11701.60 | 9.98x | [0x470a...](https://arbiscan.io/tx/0x470acff1d49393a3b020e409fe8a6c9218ab46dfbb383062be27f0c6b5c86937) |
| 17 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 20 | 2023-07-01 | 950.00 | $1.0233 | $972.11 | 9482.90 | 9.98x | [0x0a5c...](https://arbiscan.io/tx/0x0a5ceb4d47c39e432c5f0df3227445eb4fcd5f1c1f65a6e7c5f29cffbce5494f) |
| 18 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 32 | 2023-07-28 | 4750.00 | $1.0052 | $4,774.94 | 47379.23 | 9.97x | [0x3540...](https://arbiscan.io/tx/0x35402fc86e424a02e537bad74ed3d5e0935b0383815927cbdcf2ccce92aac473) |
| 19 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 33 | 2023-07-28 | 4750.00 | $1.0053 | $4,775.01 | 47384.79 | 9.98x | [0xa4d8...](https://arbiscan.io/tx/0xa4d8d4a29647dd9a52b414602739a7fc50cea737119dc503c42980978b173092) |
| 20 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 35 | 2023-07-28 | 2375.00 | $1.0056 | $2,388.25 | 23688.44 | 9.97x | [0x8467...](https://arbiscan.io/tx/0x84677b56f1031576375cf4831fbd6783c349b53d9b1f385838ae5f2361040c0e) |
| 21 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 36 | 2023-07-30 | 4750.00 | $1.0064 | $4,780.31 | 47375.26 | 9.97x | [0x0dd5...](https://arbiscan.io/tx/0x0dd5478f4ad0ba43a449219f5cc2b559daaf6d2c7452fb4859dfa83f1fad3abf) |
| 22 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 37 | 2023-07-30 | 5083.71 | $1.0065 | $5,116.70 | 50707.89 | 9.97x | [0xe03c...](https://arbiscan.io/tx/0xe03c9627c333255e6c0538b035d69ceef9ae2ad8d670f8147eb3c420b177b244) |
| 23 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 38 | 2023-09-05 | 5403.70 | $0.9468 | $5,115.96 | 53934.83 | 9.98x | [0x89f9...](https://arbiscan.io/tx/0x89f952cd02e9bc259b86eeaca66d86a07db86ed0e8b3fc533c950dd8ad5b725c) |
| 24 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 43 | 2023-11-26 | 1472.50 | $1.1072 | $1,630.37 | 14721.02 | 10.00x | [0x60b1...](https://arbiscan.io/tx/0x60b14dd3ccebf76c08cd05a1b6c44be941d90b42ff12b9dae00771bbaca0707d) |
| 25 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 44 | 2023-11-26 | 2850.00 | $1.1072 | $3,155.55 | 28405.09 | 9.97x | [0x74e2...](https://arbiscan.io/tx/0x74e233b72b4da151689278cb13ea735016f6514143087efa43a05dea6365c6cf) |
| 26 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 45 | 2023-11-26 | 4166.72 | $1.1073 | $4,613.91 | 41528.46 | 9.97x | [0x91ee...](https://arbiscan.io/tx/0x91ee727e9022f201cf3c02b7a85e76f985934d19012fd3a4ced9e5aba3871a37) |
| 27 | 0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1 | 46 | 2023-12-03 | 601.41 | $1.1322 | $680.94 | 5996.22 | 9.97x | [0x3127...](https://arbiscan.io/tx/0x3127688b521a6ae547a3664f8928fae6891a6405eb13c5fb20261fb62ebec41f) |
| 28 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 1 | 2023-05-21 | 13518.97 | $0.9693 | $13,103.41 | 135148.24 | 10.00x | [0x1e10...](https://arbiscan.io/tx/0x1e104d3bebe34d60c648531d6510f1d77d3e88a4b1b056efdf4cd25e4565798e) |
| 29 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 5 | 2023-09-06 | 2106.64 | $0.9484 | $1,997.91 | 21030.42 | 9.98x | [0x85ed...](https://arbiscan.io/tx/0x85eddf9c1719e51464251ed3de0ad160075f00cab6bcff3c2da801c2a871557a) |
| 30 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 6 | 2023-09-06 | 2850.00 | $0.9477 | $2,701.01 | 28443.57 | 9.98x | [0x1410...](https://arbiscan.io/tx/0x141045833eddebba23ac995796a5c111ead6fc8f6b15a1662f93d4ec1d41c3ad) |
| 31 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 8 | 2023-11-24 | 2620.10 | $1.1016 | $2,886.36 | 26191.58 | 10.00x | [0x66e1...](https://arbiscan.io/tx/0x66e1bc0d7fe5800b7fe7eafb2589199f3ac8ed2fbdc3a17c9ff58e8a9884f5e8) |
| 32 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 9 | 2023-11-24 | 5925.62 | $1.1010 | $6,523.81 | 59058.87 | 9.97x | [0xeb17...](https://arbiscan.io/tx/0xeb1780f347d1a2dd62d21b8e6f51e1cf90950fac76e0e767f0367a18fdf18b19) |
| 33 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 10 | 2023-12-03 | 4750.00 | $1.1307 | $5,370.65 | 47358.92 | 9.97x | [0xa946...](https://arbiscan.io/tx/0xa946d3bebc2d1ecc016d2005718ad46b4764d66a3197be9df6c22c45a2151dd2) |
| 34 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 11 | 2023-12-03 | 950.00 | $1.1307 | $1,074.13 | 9471.78 | 9.97x | [0xaff5...](https://arbiscan.io/tx/0xaff555e0ffeb321316e4976cd140b88453e0cc4922af09ba1d5c9aff729ac5a6) |
| 35 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 12 | 2023-12-03 | 1900.00 | $1.1307 | $2,148.26 | 18943.57 | 9.97x | [0x644d...](https://arbiscan.io/tx/0x644d68626c1edf5256386d882844415b557030887525d7fc1a138b152dd15ceb) |
| 36 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 13 | 2023-12-03 | 2850.00 | $1.1305 | $3,221.81 | 28415.35 | 9.97x | [0x8056...](https://arbiscan.io/tx/0x8056abd36fb5a3728536050c2bedfff9ab93b7d890ba750cdbb7ecaa1ff1e99c) |
| 37 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 14 | 2023-12-03 | 4750.00 | $1.1305 | $5,369.69 | 47358.92 | 9.97x | [0x7696...](https://arbiscan.io/tx/0x769624e71ab479c50b0c71128658a6083521058df5ce7c91b4a0724a6bc7df30) |
| 38 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 15 | 2023-12-03 | 4750.00 | $1.1305 | $5,369.69 | 47358.92 | 9.97x | [0x33d6...](https://arbiscan.io/tx/0x33d6f5e7813e7e5f03ae008da99124eca56876960982f88e4b3c420d8c14e17b) |
| 39 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 16 | 2023-12-03 | 4750.00 | $1.1305 | $5,369.69 | 47358.92 | 9.97x | [0x7308...](https://arbiscan.io/tx/0x7308af3f2546589d0af653487e3b5cd1d6fd012adc06773dd1d07adc6fa00f6f) |
| 40 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 17 | 2023-12-03 | 4750.00 | $1.1305 | $5,369.69 | 47358.92 | 9.97x | [0xa5dd...](https://arbiscan.io/tx/0xa5ddb589e34f9e003a60611a355d24a300fedfb0498ddee031a49b12dc5eff3d) |
| 41 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 18 | 2023-12-03 | 9500.00 | $1.1305 | $10,739.38 | 94717.85 | 9.97x | [0x161b...](https://arbiscan.io/tx/0x161baa9938885824c73583a0958d6097a380d140309b78fbc6ec403563b5ad61) |
| 42 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 19 | 2023-12-03 | 11976.21 | $1.1305 | $13,539.04 | 119406.39 | 9.97x | [0xf43e...](https://arbiscan.io/tx/0xf43ee2c0826c1f14005457bcc06f965c4d9f61a633cda7bbca50392d16996fd7) |
| 43 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 20 | 2023-12-03 | 10723.07 | $1.1305 | $12,122.37 | 106912.19 | 9.97x | [0xca5b...](https://arbiscan.io/tx/0xca5b23a98a74856ee3c124eebd436dd0e1a623273cb42ad02cbbab593b689e7a) |
| 44 | 0xf9748b92ca6b8e220fd220f56ce527869e34bb66 | 2 | 2024-01-06 | 0.01 | $1.1662 | $0.01 | 0.09 | 9.92x | [0x22c8...](https://arbiscan.io/tx/0x22c8b6b27f9b3f8ca18a4e655b4c8a6e680e0c8bc483ef7e6b12c64e878d6057) |
| 45 | 0xf9748b92ca6b8e220fd220f56ce527869e34bb66 | 4 | 2024-01-11 | 1330.00 | $1.2210 | $1,623.87 | 13300.00 | 10.00x | [0x9a22...](https://arbiscan.io/tx/0x9a223a0348770f00a487828fe48e4d0d35cfa80361aac64f28dff1aeb8146732) |
| 46 | 0xf9748b92ca6b8e220fd220f56ce527869e34bb66 | 5 | 2024-01-13 | 2470.00 | $1.1960 | $2,954.14 | 24700.00 | 10.00x | [0x5a09...](https://arbiscan.io/tx/0x5a098d739f410139e7691c6598a91d094d0720daa3926f5cc1e72d95ca637392) |
| 47 | 0xf9748b92ca6b8e220fd220f56ce527869e34bb66 | 7 | 2024-01-13 | 1686.25 | $1.1933 | $2,012.14 | 16862.50 | 10.00x | [0xeabe...](https://arbiscan.io/tx/0xeabe3627b793b8435693e479bd1c66280ee5f64bc7d381a8be940865c18e0869) |

**Column Definitions:**
- **Farmer**: Address of the farmer who created the position
- **Pos#**: Position index number
- **Opening Date**: Date when position was opened (YYYY-MM-DD)
- **Collateral (fsGLP)**: Amount of fsGLP deposited as collateral
- **GLP Price**: Historical GLP price in USD at the time of opening
- **Collateral Value (USD)**: USD value of collateral at opening (collateral × GLP price)
- **Total fsGLP**: Total fsGLP including borrowed amounts (collateral + borrowed)
- **Leverage**: Leverage multiplier (total fsGLP ÷ collateral fsGLP)
- **Transaction**: Link to opening transaction on Arbiscan

✅ **All positions have historical price data.**

**Full Details:** See `out/archi-farmer-positions.csv` for complete data including block numbers, timestamps, borrowed tokens, credit managers, and more.

</details>

### LP Distributions - Top 20 (405 LPs total)

LPs provided liquidity to vaults and received vsTokens. They receive fsGLP distributions proportional to their vsToken holdings, based on what farmers borrowed from their vault (tracked as fsGLP value).

**Stablecoin Capping Applied:** USDC and USDT distributions are capped so that their fsGLP value at $1.45 does not exceed their original deposit value. The excess fsGLP from this capping is redistributed proportionally to WBTC and WETH LPs based on their volatile asset holdings.

**These are final distributions** after stablecoin capping and excess redistribution.

| Rank | LP Address | WBTC fsGLP | WETH fsGLP | USDT fsGLP | USDC fsGLP | Total fsGLP |
|------|------------|------------|------------|------------|------------|-------------|
| 1 | 0x69ce8721790edbdcd2b4155d853d99d2680477b0 | 819,191.53 | 0.00 | 0.00 | 0.00 | **819,191.53** |
| 2 | 0xcb89e891c581fbe0bea4fac2ba9829d816515a81 | 104,290.27 | 163,217.62 | 0.00 | 0.00 | **267,507.89** |
| 3 | 0xa827150caaebabcb696b9b44d16c2367dd03828b | 0.00 | 0.04 | 115,773.09 | 0.00 | **115,773.14** |
| 4 | 0x11d67fa925877813b744abc0917900c2b1d6eb81 | 0.00 | 0.00 | 0.00 | 48,276.54 | **48,276.54** |
| 5 | 0xa9a5f6a3777d128d7abf2ff972ca146a13a3fca3 | 0.00 | 26,775.98 | 0.00 | 0.00 | **26,775.98** |
| 6 | 0xc87374d34e66289005324ae0457fca898e823c68 | 0.00 | 0.00 | 0.00 | 14,466.70 | **14,466.70** |
| 7 | 0xced29ba48490c51e4348e654c313ac97762beccc | 0.00 | 0.00 | 6,758.62 | 6,896.55 | **13,655.17** |
| 8 | 0xf9748b92ca6b8e220fd220f56ce527869e34bb66 | 0.00 | 0.00 | 689.66 | 9,734.27 | **10,423.92** |
| 9 | 0x1b5b7b514771beec3c83add7e0165166dbc77320 | 0.00 | 0.00 | 0.00 | 10,344.83 | **10,344.83** |
| 10 | 0x19de5bf0977f858c530e8ec53242680386537d89 | 0.00 | 2,232.04 | 0.00 | 7,602.05 | **9,834.09** |
| 11 | 0x4b4d897cc153a5923730e86aa58ae30816229a7a | 0.00 | 11,189.43 | 0.00 | 0.00 | **11,189.43** |
| 12 | 0x3c01d937a899f95fbb26f478ae2d157d715293f9 | 0.00 | 10,942.12 | 0.00 | 0.00 | **10,942.12** |
| 13 | 0x30d14e0245063fc2c39f9d0720c2109719968e85 | 6,091.54 | 4,553.36 | 0.00 | 0.00 | **10,644.90** |
| 14 | 0xb80ebc2e6f0ae48d801471f563526efa47b1e236 | 0.00 | 0.00 | 3,448.16 | 3,448.28 | **6,896.43** |
| 15 | 0xd8c8f8e07f779c34aec474ba1a04e20e792b5c5f | 0.00 | 8,928.16 | 0.00 | 0.00 | **8,928.16** |
| 16 | 0x7453275ad8cacf3a44d19bd10e5b6a2832b05fc3 | 0.00 | 6,696.12 | 0.00 | 0.00 | **6,696.12** |
| 17 | 0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53 | 0.00 | 0.00 | 4,352.63 | 0.00 | **4,352.63** |
| 18 | 0xecca7559a64d3005c8c0cbeef7ce04dc2c8ff814 | 0.00 | 5,647.06 | 0.00 | 0.00 | **5,647.06** |
| 19 | 0xec9ebe950cad79fde4139714283145137ce24aad | 0.00 | 0.00 | 0.00 | 4,137.93 | **4,137.93** |
| 20 | 0xff2779e68e24b725c625f514acb36736a23391e8 | 5,561.36 | 0.00 | 0.00 | 0.00 | **5,561.36** |
| ... | ... | ... | ... | ... | ... | ... |
| 405 | **All LPs** | **942,848.99** | **275,610.65** | **143,203.01** | **128,938.38** | **1,490,601.03** |

**Note:** Full LP distribution list available in `out/archi-lp-distributions.csv` (405 LPs total)
