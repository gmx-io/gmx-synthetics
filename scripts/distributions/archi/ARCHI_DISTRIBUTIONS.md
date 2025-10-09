# Archi Distributions

  - Farmers:   169,573.39 fsGLP (10.50%)
  - LPs:     1,445,599.59 fsGLP (89.50%)
  - Total:   1,615,172.98 fsGLP

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

Each vault's LPs only receive share of what was borrowed from their vault (vault-specific LP distribution)

| Vault | Borrowed fsGLP | % of LP Total |
|-------|----------------|---------------|
| **WBTC** | 848,962.09 | 58.72% |
| **WETH** | 248,165.92 | 17.16% |
| **USDT** | 190,986.02 | 13.21% |
| **USDC** | 157,485.56 | 10.89% |
| **TOTAL** | **1,445,599.59** | **100.00%** |

<details>
<summary><strong>How vault borrowing is calculated</strong></summary>

These amounts are calculated by analyzing all 47 active positions and aggregating borrowed fsGLP by vault.

**Prerequisites:**
```bash
# Step 4a: Extract complete position details from blockchain
npx hardhat run --network arbitrum scripts/distributions/archi/step4a_extractPositionDetails.ts
```

**Then calculate vault borrowing:**
```bash
# Step 4b: Calculate vault borrowing totals
npx hardhat run --network arbitrum scripts/distributions/archi/step4b_calculateVaultBorrowing.ts
```

**Process:**
1. `step4a_extractPositionDetails.ts` queries CreditUser #2 contract for all active positions and generates `step4a_position-details-complete.csv`
2. `step4b_calculateVaultBorrowing.ts` reads the CSV and:
   - Maps `credit_managers` addresses to vault tokens (WETH/WBTC/USDT/USDC)
   - Aggregates `borrowed_fsGLP` amounts per vault
3. Outputs:
   - `step4b_vault-borrowing-summary.csv` - Totals per vault (matches table above)
   - `step4b_vault-borrowing-breakdown.csv` - Detailed per-position borrowing

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
npx hardhat run --network arbitrum scripts/distributions/archi/calculateFarmerDistributions.ts
```

**Output Files:**

**`farmer-positions.csv`** - All 47 active positions with complete details

**`farmer-distributions.csv`** - Final distributions for 4 farmers (see "Farmer Breakdown" table above)

**`vault-borrowing-summary.csv`** - Total borrowed fsGLP by vault (see "Vault Borrowing" table above)

**`vault-borrowing-breakdown.csv`** - Detailed vault borrowing per position (71 vault borrowings across 47 positions)

<details>
<summary><strong>Alternative: Step-by-Step Scripts</strong></summary>

If you need to debug or verify individual steps:

```bash
# Step 1: Verify total fsGLP
npx hardhat run --network arbitrum scripts/distributions/archi/step1_verifyTotalFsGLP.ts

# Step 2: Extract active positions
npx hardhat run --network arbitrum scripts/distributions/archi/step2_extractPositionData.ts

# Step 3: Calculate distributions
npx hardhat run --network arbitrum scripts/distributions/archi/step3_calculateDistributions.ts

# Step 4a: Extract complete position details (prerequisite for 4b)
npx hardhat run --network arbitrum scripts/distributions/archi/step4a_extractPositionDetails.ts

# Step 4b: Calculate vault borrowing
npx hardhat run --network arbitrum scripts/distributions/archi/step4b_calculateVaultBorrowing.ts
```

#### Step 1: Verify Total fsGLP

Queries on-chain balances:
- **GMXExecutor** (`0x49ee14e37cb47bff8c512b3a0d672302a3446eb1`): 1,606,694.32 fsGLP
- **CreditUser #2** (`0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E`): 8,478.67 fsGLP
- **CreditAggregator** (`0x437a182b571390c7e5d14cc7103d3b9d7628faca`): ~100 fsGLP (not distributed, source unknown)
- **Total:** 1,615,172.99 fsGLP

#### Step 2: Extract Active Positions

Queries blockchain events from CreditUser #2:
1. **CreateUserLendCredit** events (112 position openings)
   - Captures: farmer address, collateral token/amount, borrowed tokens, leverage ratios
2. **CreateUserBorrowed** events (112 position executions)
   - Captures: fsGLP amounts (collateral + borrowed per vault), credit managers
3. **Filters** via `isTerminated()` on-chain calls
   - Result: 47 active positions

#### Step 3: Calculate Distributions

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

#### Step 4: Calculate Vault Borrowing

**Step 4a** extracts complete position details including:
- All borrowed tokens and amounts per position
- Credit manager addresses that map to vaults
- Calculates fsGLP equivalents for all borrowed amounts

**Step 4b** aggregates vault borrowing:
- Maps `credit_managers` addresses to vault tokens (WETH/WBTC/USDT/USDC)
- Sums borrowed fsGLP per vault across all 47 positions
- Outputs vault totals needed for LP distribution

Why this matters:
- Each position can borrow from multiple vaults simultaneously
- Each vault's LPs only receive share of their vault's borrowed fsGLP
- No cross-vault subsidization in LP distributions

</details>

---

## LP Distributions

Total to distribute: **1,445,599.59 fsGLP** (89.50% of protocol)

### LP Breakdown (469 LPs across 4 vaults, 469 out of 1383 have > $1)

| Vault | Distributed fsGLP | % of LP Total | Number of LPs |
|-------|------------------|---------------|---------------|
| **WBTC** | 848,962.09 | 58.72% | 23 |
| **WETH** | 248,165.92 | 17.16% | 221 |
| **USDT** | 190,986.02 | 13.21% | 196 |
| **USDC** | 157,485.56 | 10.89% | 103 |
| **TOTAL** | **1,445,599.59** | **100.00%** | **469** |

**Distribution Method:**
- Based on net positions (deposits - withdrawals) from Dune SQL query
- Formula: `LP_fsGLP = (LP_net_deposit / total_net_deposits) × vault_borrowed_fsGLP`
- Each vault distributes independently to its LPs

### Run Complete Calculation

```bash
npx hardhat run --network arbitrum scripts/distributions/archi/calculateLPDistributions.ts
```

**Prerequisites:**
1. `archi-unique-LPs.csv` - LP addresses with net positions from [Dune query](https://dune.com/queries/5818540)
2. `step4b_vault-borrowing-summary.csv` - Vault borrowed amounts (from farmer calculation)

**Output Files:**

**`lp-distributions.csv`** - Final LP distributions (469 LPs)

**`lp-distributions-by-vault.csv`** - Detailed per-vault breakdown

<details>
<summary><strong>How LP distribution is calculated</strong></summary>

**Data Source:**
- [archi-unique-LPs.sql](https://dune.com/queries/5818540) tracks all `addLiquidity()` and `removeLiquidity()` transactions
- Net position = total deposits - total withdrawals per vault per LP
- Captures complete transaction history from protocol launch to shutdown

**Calculation Process:**

1. **Read LP net positions** from `archi-unique-LPs.csv`:
   - Columns: `address`, `net_wbtc`, `net_weth`, `net_usdt`, `net_usdc`
   - Net positions represent current LP holdings in each vault

2. **For each vault** (WBTC, WETH, USDT, USDC):
   - Sum all positive net positions: `total_net_deposits = Σ(LP_net_deposits)`
   - For each LP: `share = LP_net_deposit / total_net_deposits`
   - Calculate entitlement: `fsGLP = share × vault_borrowed_fsGLP`

3. **Aggregate** across vaults per LP to get total distribution

**Key Points:**
- **Vault-specific distribution**: Each vault's LPs only receive share of that vault's borrowed fsGLP
- **No on-chain queries needed**: All data from Dune SQL transaction history
- **100% distributed**: All borrowed fsGLP allocated to LPs (precision: 99.9999999998%)
- **No cross-vault subsidization**: WETH LPs don't share WBTC vault's borrowed amounts

**Example:**
```
LP has:
  - 1 WETH deposited (net_weth = 1.0)
  - 0.5 WBTC deposited (net_wbtc = 0.5)

If total_net_deposits:
  - WETH vault: 100 WETH total
  - WBTC vault: 20 WBTC total

LP receives:
  - WETH: (1.0 / 100) × 248,165.92 = 2,481.66 fsGLP
  - WBTC: (0.5 / 20) × 848,962.09 = 21,224.05 fsGLP
  - Total: 23,705.71 fsGLP
```

</details>

---

## Complete Distribution Summary

| Category | Amount (fsGLP) | % of Total | Recipients |
|----------|---------------|------------|------------|
| **Farmers** | 169,573.39 | 10.50% | 4 farmers (47 positions) |
| **LPs** | 1,445,599.59 | 89.50% | 469 LPs (across 4 vaults) |
| **TOTAL** | **1,615,172.98** | **100%** | **473 unique addresses** |

**Not Distributed:**
- CreditAggregator: 99.81 fsGLP (source unknown, excluded from distribution)
- LPs having less than $1 in vaults (i.e. only the first 469 out of 1383 LPs receive distributions)
