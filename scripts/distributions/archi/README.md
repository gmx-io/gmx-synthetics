# Archi Finance Protocol

Archi Finance is a **two-sided market** for GLP leveraged yield farming built on Arbitrum. The protocol connects **passive liquidity providers** who want low-risk yield with **leveraged farmers** who want up to 10x leverage on GLP farming.

For complete documentation go to [Archi web archive](https://web.archive.org/web/20240910232111/https://docs.archi.finance/).

### Two-Sided Market Overview

```
PASSIVE LIQUIDITY PROVIDERS          ←→          LEVERAGED FARMERS
     (Simple, Low Risk)                              (Advanced, High Leverage)

Single Asset Deposit (WETH/USDT/USDC/WBTC)    |    Collateral + Borrowed Assets
         ↓                                     |              ↓
vsTokens (Auto-staked)                        |    GMX GLP Positions (Up to 10x)
         ↓                                     |              ↓
WETH Rewards from Protocol Fees               |    GMX Trading Fees & Rewards
```

**The Connection**: Passive LPs provide the capital that leveraged farmers borrow. Farmers pay borrowing fees, and both sides earn from GMX protocol fee sharing, creating a symbiotic relationship.

---

## 1. Passive Liquidity Providers

**Target Users**: Investors seeking low-risk yield without complexity
**Risk Level**: Low (1:1 asset backing)
**Expected Returns**: WETH rewards from protocol activity
**Dune Query**: [unique-passive-LPs](https://dune.com/queries/5818540)

### User Entry Points
**Primary Contracts** (direct interaction):
- **WETH Vault**: [`0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4`](https://arbiscan.io/address/0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4)
- **USDT Vault**: [`0x179bD8d1d654DB8aa1603f232E284FF8d53a0688`](https://arbiscan.io/address/0x179bD8d1d654DB8aa1603f232E284FF8d53a0688)
- **USDC Vault**: [`0xa7490e0828Ed39DF886b9032ebBF98851193D79c`](https://arbiscan.io/address/0xa7490e0828Ed39DF886b9032ebBF98851193D79c)
- **WBTC Vault**: [`0xee54A31e9759B0F7FDbF48221b72CD9F3aEA00AB`](https://arbiscan.io/address/0xee54A31e9759B0F7FDbF48221b72CD9F3aEA00AB)

**Key Methods**:
- `addLiquidity(uint256 amount)` - Deposit assets and receive auto-staked vsTokens
- `removeLiquidity(uint256 amount)` - Withdraw assets and auto-unstake vsTokens
- `claim(address user)` - Claim accumulated WETH rewards (on BaseReward contracts)
- `balanceOf(address user)` - Check staked vsToken balance
- `pendingRewards(address user)` - View unclaimed WETH rewards

### How It Works

1. **Deposit**: Users deposit single assets (WETH, USDT, USDC, or WBTC) into vault contracts
2. **Auto-Staking**: Receive vsTokens that are automatically staked in reward pools
3. **Earn**: Accumulate WETH rewards from protocol fees and GMX integration
4. **Withdraw**: Remove liquidity anytime (subject to vault availability)

### Token Flow

```
Token:     Assets → vsTokens → Auto-staked → WETH rewards from protocol fees
Contract:  User → Vault Contract → vsTokens → BaseReward Pool → WETH Rewards
```

<details>
<summary><strong>Key Contracts & Addresses</strong></summary>

#### WETH Vault System
- **Vault**: [`0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4`](https://arbiscan.io/address/0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4) (WETHVaultProxy)
- **Reward Pool**: [`0x9eBC025393d86f211A720b95650dff133b270684`](https://arbiscan.io/address/0x9eBC025393d86f211A720b95650dff133b270684) (WETHSupplyBaseRewardProxy)
- **Manager**: [`0xf5eb3768b9b50E6E019E50e62DA8aC0444c6Af98`](https://arbiscan.io/address/0xf5eb3768b9b50E6E019E50e62DA8aC0444c6Af98) (WETHVaultManagerProxy)

#### USDT Vault System
- **Vault**: [`0x179bD8d1d654DB8aa1603f232E284FF8d53a0688`](https://arbiscan.io/address/0x179bD8d1d654DB8aa1603f232E284FF8d53a0688) (USDTVaultProxy)
- **Reward Pool**: [`0xEca975BeEc3bC90C424FF101605ECBCef22b66eA`](https://arbiscan.io/address/0xEca975BeEc3bC90C424FF101605ECBCef22b66eA) (USDTSupplyBaseRewardProxy)
- **Manager**: [`0x14192d4c06E223e54Cf72A03DA6fF21689802794`](https://arbiscan.io/address/0x14192d4c06E223e54Cf72A03DA6fF21689802794) (USDTVaultManagerProxy)

#### USDC Vault System
- **Vault**: [`0xa7490e0828Ed39DF886b9032ebBF98851193D79c`](https://arbiscan.io/address/0xa7490e0828Ed39DF886b9032ebBF98851193D79c) (USDCVaultProxy)
- **Reward Pool**: [`0x670c4391f6421e4cE64D108F810C56479ADFE4B3`](https://arbiscan.io/address/0x670c4391f6421e4cE64D108F810C56479ADFE4B3) (USDCSupplyBaseRewardProxy)
- **Manager**: [`0x0EA8C08C3b682A3CD964C416A2966b089B4497BA`](https://arbiscan.io/address/0x0EA8C08C3b682A3CD964C416A2966b089B4497BA) (USDCVaultManagerProxy)

#### WBTC Vault System
- **Vault**: [`0xee54A31e9759B0F7FDbF48221b72CD9F3aEA00AB`](https://arbiscan.io/address/0xee54A31e9759B0F7FDbF48221b72CD9F3aEA00AB) (WBTC Vault)
- **Reward Pool**: [`0x12e14fDc843Fb9c64B84Dfa6fB03350D6810d8e5`](https://arbiscan.io/address/0x12e14fDc843Fb9c64B84Dfa6fB03350D6810d8e5) (WBTC BaseReward Pool)

</details>

<details>
<summary><strong>Token Mechanics</strong></summary>

| Action | Input | Output | Location | Purpose |
|--------|-------|--------|----------|---------|
| **Deposit** | WETH/USDT/USDC/WBTC | vsTokens (1:1 ratio) | Vault Contract | Liquidity provision |
| **Auto-Stake** | vsTokens | Staked Position | BaseReward Pool | Reward earning |
| **Claim** | - | WETH Rewards | BaseReward Pool | Profit realization |
| **Withdraw** | vsTokens | Original Assets | Vault Contract | Liquidity removal |

</details>


---

## 2. Leveraged Farmers

**Target Users**: Advanced DeFi users seeking leveraged exposure to GLP yields
**Risk Level**: High (liquidation risk, up to 10x leverage)
**Expected Returns**: Amplified GMX GLP rewards minus borrowing costs
**Dune Query**: [unique-leveraged-farmers](https://dune.com/queries/5818949)

### User Entry Point
**Primary Contract**: [`0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35`](https://arbiscan.io/address/0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35) (CreditCaller)

**Key Methods**:
- `openLendCredit(address collateral, uint256 amount, address[] borrowTokens, uint256[] ratios)` - Open leveraged position
- `repayCredit(uint256 borrowedIndex)` - Close position and repay debts
- `liquidate(address user, uint256 borrowedIndex)` - Liquidate unhealthy positions

### How It Works

1. **Open Position**: Provide collateral and specify leverage ratio (up to 10x)
2. **Auto-Borrow**: Protocol borrows assets from LP vaults on user's behalf
3. **GMX Integration**: All assets converted to GLP tokens via GMXDepositor
4. **Earn**: Receive amplified GMX trading fees and rewards
5. **Manage**: Monitor health factor to avoid liquidation
6. **Close**: Repay borrowed amounts and receive remaining GLP value

### Token & Contract Flow

```
Token:    Collateral + Borrowed assets → GLP tokens → GMX rewards - borrowing costs

Contract: User → CreditCaller → CreditManager → Vault Borrowing → GMXDepositor → GMX Protocol
                                    ↓                                    ↓
                              Credit Position                        GLP Tokens
                                    ↓                                    ↓
                              Health Monitoring                   GMX Rewards
```

<details>
<summary><strong>Key Contracts & Addresses</strong></summary>

#### Credit System Core
- **Entry Point**: [`0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35`](https://arbiscan.io/address/0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35) (CreditCallerProxy)
- **Position Management**: [`0x8718CaD7DE1B411616145669c1e1242051342fb3`](https://arbiscan.io/address/0x8718CaD7DE1B411616145669c1e1242051342fb3) (CreditUserProxy)
- **Reward Tracking**: [`0x20B9359f8Bc3BE6a29dc3B2859c68d05EB9F1FC0`](https://arbiscan.io/address/0x20B9359f8Bc3BE6a29dc3B2859c68d05EB9F1FC0) (CreditRewardTrackerProxy)

#### GMX Integration Layer
- **Asset Management**: [`0x7093c218188d101f5E121Ab679cA3b5e034F7863`](https://arbiscan.io/address/0x7093c218188d101f5E121Ab679cA3b5e034F7863) (GMXDepositorProxy)
  - Converts user assets to GLP tokens via GMX protocol
  - Manages deposits/withdrawals to GMX GlpManager
- **GLP Execution**: [`0x65C59eE732BD249224718607Ee0EC0e293309923`](https://arbiscan.io/address/0x65C59eE732BD249224718607Ee0EC0e293309923) (GMXExecutorProxy)
  - Holds GLP/fsGLP tokens for leveraged positions
  - Claims WETH rewards from GMX V1 protocol
  - Interfaces with GMX RewardRouter for reward harvesting
- **Reward Distribution**: [`0x257db03e29976F900A188378Fc2c9A0C7d5615Be`](https://arbiscan.io/address/0x257db03e29976F900A188378Fc2c9A0C7d5615Be) (DepositorRewardDistributorProxy)
  - Distributes GMX-generated WETH rewards to Archi users
  - Manages reward flow from GMXExecutor to vault reward pools

#### Supporting Infrastructure
- **Data Aggregation**: [`0xeD36E66ad87dE148A908e8a51b78888553D87E16`](https://arbiscan.io/address/0xeD36E66ad87dE148A908e8a51b78888553D87E16) (CreditAggregatorProxy)
- **Token Staking**: [`0xC2202A59b806499f101F0712E7eF73C0f74FdF10`](https://arbiscan.io/address/0xC2202A59b806499f101F0712E7eF73C0f74FdF10) (CreditTokenStakerProxy)

</details>

<details>
<summary><strong>Position Lifecycle</strong></summary>

| Phase | Function | Description | Risk |
|-------|----------|-------------|------|
| **Open** | `openLendCredit()` | Provide collateral, set leverage | Liquidation if over-leveraged |
| **Monitor** | `getUserCreditHealth()` | Track health factor (>40% safe) | Liquidation risk below 40% |
| **Manage** | Various | Add collateral or reduce leverage | Active management required |
| **Close** | `repayCredit()` | Repay loans, receive remaining value | Market timing risk |

</details>


---

## 3. Market Interdependence & Economic Model

### Revenue Streams
1. **Borrowing Fees**: Leveraged farmers pay interest on borrowed assets
2. **GMX Fee Sharing**: Both sides earn from GMX trading volume
3. **Protocol Treasury**: [`0x150B4c6bFD6fd6C7dA3b012E597D74d80b9565AC`](https://arbiscan.io/address/0x150B4c6bFD6fd6C7dA3b012E597D74d80b9565AC) manages protocol-owned value

### Risk Distribution
- **Passive LPs**: Low risk, moderate returns, provide stability
- **Leveraged Farmers**: High risk, amplified returns, provide volume
- **Protocol**: Earns from both sides, manages systemic risk

### Core Infrastructure
- **Address Registry**: [`0xc5891c56c024EC2B82479D7A98582E4d7fE5d5Ff`](https://arbiscan.io/address/0xc5891c56c024EC2B82479D7A98582E4d7fE5d5Ff) (AddressProvider)
- **Access Control**: [`0x9821fC145052b740273fFae362350b226dfbaB38`](https://arbiscan.io/address/0x9821fC145052b740273fFae362350b226dfbaB38) (Allowlist)
- **Protocol Admin**: [`0x9ED9fD8dDd7281Dc3f9FFB2AA497E802b2b7aebA`](https://arbiscan.io/address/0x9ED9fD8dDd7281Dc3f9FFB2AA497E802b2b7aebA) (ProxyAdmin)

### Revenue Sharing Flow

```
GMX fees collected by GMXExecutor → DepositorRewardDistributor → VaultRewardDistributor → BaseReward pools → Individual users
```

### GMX Protocol Integration Details

#### GMX V1 Contracts (External)
Archi interfaces with these GMX V1 contracts for leveraged farming:
- **GlpManager**: `0x3963FfC9dff443c2A94f21b129D429891E32ec18` - Converts assets to GLP
- **RewardRouter**: `0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B` - Claims WETH rewards
- **GLP Token**: `0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258` - GMX Liquidity Provider token
- **fsGLP Token**: `0x1aDDD80E6039594eE970E5872D247bf0414C8903` - Fee + Staked GLP (earns WETH)

#### Integration Flow
1. **Asset → GLP**: GMXDepositor calls GlpManager to convert borrowed assets to GLP
2. **GLP → fsGLP**: Automatic staking for fee generation
3. **Reward Harvesting**: GMXExecutor claims WETH rewards from GMX RewardRouter
4. **Distribution**: WETH flows through Archi's reward system to all users

#### Token Holdings
- **GMXExecutor** holds: GLP/fsGLP tokens representing leveraged positions
- **Users receive**: Share of WETH rewards proportional to their vault participation
- **No direct user exposure**: Users don't hold GMX tokens directly, only vsTokens
