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

Total borrowed fsGLP: 1,445,599.59 (89.50% of protocol) --> each vault's LPs only receive share of what was borrowed from their vault (i.e. vault-specific LP distribution)

| Vault | Borrowed fsGLP | % of LP Total |
|-------|----------------|---------------|
| **WBTC** | 848,962.09 | 58.73% |
| **WETH** | 248,165.92 | 17.17% |
| **USDT** | 190,986.02 | 13.21% |
| **USDC** | 157,485.56 | 10.89% |
| **TOTAL** | **1,445,599.59** | **100.00%** |

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
- **`farmer-positions.csv`** - All 47 active positions with fsGLP breakdown
- **`farmer-distributions.csv`** - Final distributions for 4 farmers (see "Farmer Breakdown" table above)

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

Vault Borrowing Tracked:
- Each position can borrow from multiple vaults (WETH, WBTC, USDT, USDC)
- `credit_managers` array maps to specific vaults
- Critical for fair LP distribution (each vault's LPs receive share of their vault's borrowed fsGLP)

</details>

---

## LP Distributions

- **Total to distribute:** 1,445,599.59 fsGLP
- **Method:** Per-vault distribution based on vsToken holdings
- **Formula:** `LP_fsGLP = (LP_vsTokens / Total_vsTokens) × Vault_Borrowed_fsGLP`
