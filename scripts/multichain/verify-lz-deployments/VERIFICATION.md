# GMX LayerZero Verification Guide

## 1. LZ Verification Scripts (run these first in gmx-io/layer-zero repo)
1. **Validate configs** - checks structure, token decimals, symbols from `devtools/config/tokens.ts`
   - `npx hardhat lz:sdk:validate-config` [--market-pair, --token-type]
2. **Validate deployments** - tests quoteSend() between all network pairs
   - `npx hardhat lz:sdk:validate-deployments --mainnet` [--market-pair, --token-type, --filter-networks]
3. **Display deployments** - shows contracts with block explorer links
   - `npx hardhat lz:sdk:display-deployments --mainnet` [--filter-networks]
4. **Validate wiring** - fails if any wiring transactions needed
   - `npx hardhat lz:sdk:wire --assert --token-type GLV --market-pair WETH_USDC --signer 0x0000000000000000000000000000000000000001`
   - `npx hardhat lz:sdk:wire --assert --token-type GLV --market-pair WBTC_USDC --signer 0x0000000000000000000000000000000000000001`
   - `npx hardhat lz:sdk:wire --assert --token-type GM --market-pair WETH_USDC`
   - `npx hardhat lz:sdk:wire --assert --token-type GM --market-pair WBTC_USDC`
   - `npx hardhat lz:sdk:wire --assert --token-type GM --market-pair BTC_BTC`
   - `npx hardhat lz:sdk:wire --assert --token-type GM --market-pair WETH_WETH`
5. **Test transfers** - sends tokens cross-chain, shows LZ scan URLs (requires actual tokens)
   - `npx hardhat lz:sdk:vape:send-tokens --market-pair WETH_USDC --token-type GM --amount 0.001`

---

## 2. GMX Verification Scripts (run these in current repo)
1. **verifyContracts.ts** - Combined OFTAdapter and OFT verification (multi-network)
   - Checks Arbitrum hub: 6 OFTAdapter contracts (deployment, underlying, peers, DVN config, enforced options, quotes)
   - Checks spoke networks: 6 OFT contracts × 5 networks = 30 OFTs (deployment, token props, peers, enforced options, quotes)
   - Total: 474 checks across all 6 networks
   - RPC URLs: Uses `.env` variables if set, otherwise hardhat.config.ts defaults
   ```bash
   npx ts-node scripts/multichain/verify-lz-deployments/verifyContracts.ts
   ```

2. **verifyDvnConfigs.ts** - DVN configuration verification (multi-network, all directions)
   - Checks 6 contracts × 6 networks × 5 destinations = 180 checks
   - Validates: Required DVNs (LZ Labs + Canary), Optional DVNs (1 of Deutsche + Horizen)
   - Uses per-network DVN addresses from [LZ docs](https://docs.layerzero.network/v2/deployments/dvn-addresses)
   - RPC URLs: Uses `.env` variables if set, otherwise hardhat.config.ts defaults
   ```bash
   npx ts-node scripts/multichain/verify-lz-deployments/verifyDvnConfigs.ts
   ```

3. **verifyConfirmations.ts** - ⚠️ CRITICAL: Bidirectional confirmation verification (multi-network)
   - Prevents "bricked sends" caused by confirmation mismatches between networks
   - Checks 6 contracts × 6 networks × 5 destinations × 2 directions (send + receive)
   - Validates: SendLib confirmations, ReceiveLib confirmations, bidirectional consistency
   - RPC URLs: Uses `.env` variables if set, otherwise hardhat.config.ts defaults
   ```bash
   npx ts-node scripts/multichain/verify-lz-deployments/verifyConfirmations.ts
   ```

**Log files:** `out/_lz-verification/`

---

## 3. Contract Addresses

### GM Tokens
| Token | Address | Underlying (Arbitrum) |
|-------|---------|----------------------|
| WETH-USDC | `0xfcff5015627B8ce9CeAA7F5b38a6679F65fE39a7` (same on all networks) | [`0x70d95587d40a2caf56bd97485ab3eec10bee6336`](https://arbiscan.io/address/0x70d95587d40a2caf56bd97485ab3eec10bee6336) |
| WBTC-USDC | `0x91dd54AA8BA9Dfde8b956Cfb709a7c418f870e21` (same on all networks) | [`0x47c031236e19d024b42f8ae6780e44a573170703`](https://arbiscan.io/address/0x47c031236e19d024b42f8ae6780e44a573170703) |
| BTC-BTC | per-network (see `addresses.ts`) | [`0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77`](https://arbiscan.io/address/0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77) |
| WETH-WETH | per-network (see `addresses.ts`) | [`0x450bb6774Dd8a756274E0ab4107953259d2ac541`](https://arbiscan.io/address/0x450bb6774Dd8a756274E0ab4107953259d2ac541) |

### GLV Tokens
| Token | Address  | Underlying (Arbitrum) |
|-------|----------|----------------------|
| GLV WETH-USDC | per-network (see `addresses.ts`)  | [`0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9`](https://arbiscan.io/address/0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9) |
| GLV WBTC-USDC | per-network (see `addresses.ts`)  | [`0xdF03EEd325b82bC1d4Db8b49c30ecc9E05104b96`](https://arbiscan.io/address/0xdF03EEd325b82bC1d4Db8b49c30ecc9E05104b96) |

### Multisigs
| Scope | Address |
|-------|---------|
| All except Botanix | `0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D` |
| Botanix | `0x656fa39BdB5984b477FA6aB443195D72D1Accc1c` |

### Network EIDs & Endpoints
| Network | EID | LZ Endpoint |
|---------|-----|-------------|
| arbitrum | 30110 | `0x1a44076050125825900e736c501f859c50fE728c` |
| ethereum | 30101 | `0x1a44076050125825900e736c501f859c50fE728c` |
| base | 30184 | `0x1a44076050125825900e736c501f859c50fE728c` |
| bsc | 30102 | `0x1a44076050125825900e736c501f859c50fE728c` |
| bera | 30362 | `0x6F475642a6e85809B1c36Fa62763669b1b48DD5B` |
| botanix | 30376 | `0x6F475642a6e85809B1c36Fa62763669b1b48DD5B` |

---

## 4. Manual Cast Commands

```bash
# Peers (expect 0x000000000000000000000000<peer_addr>)
cast call <CONTRACT> "peers(uint32)" <DEST_EID> --rpc-url <RPC>

# Ownership
cast call <CONTRACT> "owner()" --rpc-url <RPC>

# DVN Config (SEND_LIB on Arbitrum: 0x975bcd720be66659e3eb3c0e4f1866a3020e493a)
cast call <LZ_ENDPOINT> "getConfig(address,address,uint32,uint32)" <CONTRACT> <SEND_LIB> <PEER_EID> 2 --rpc-url <RPC>

# Delegate
cast call <LZ_ENDPOINT> "delegates(address)" <CONTRACT> --rpc-url <RPC>

# Quote transfer
cast call <CONTRACT> "quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool)" "(<DEST_EID>,0x000000000000000000000000<TO_ADDR>,<AMOUNT>,0,0x,0x,0x)" false --rpc-url <RPC>

# OFT properties
cast call <CONTRACT> "decimals()" --rpc-url <RPC>        # expect 18
cast call <CONTRACT> "sharedDecimals()" --rpc-url <RPC>  # expect 6
cast call <CONTRACT> "totalSupply()" --rpc-url <RPC>     # 0 initially
```

---

## 5. Verification Checklist

### Contract Verification — `verifyContracts.ts`
**Adapters (Arbitrum hub):**
- [ ] All adapters deployed (4 GM + 2 GLV = 6 adapters)
- [ ] Underlying token addresses correct
- [ ] Owner = multisig
- [ ] Delegate = multisig on LZ endpoint
- [ ] Peers configured (5 expansion networks)
- [ ] DVN config exists for all 5 destinations
- [ ] Enforced options: msgType 1 = 80k gas
- [ ] quoteSend() works to all 5 destinations

**OFTs (5 spoke networks × 6 OFTs = 30 OFTs):**
- [ ] All OFTs deployed per network
- [ ] Token properties: decimals=18, sharedDecimals=6
- [ ] Owner = multisig (Botanix uses different multisig)
- [ ] Delegate = multisig on LZ endpoint
- [ ] Peers configured (5 other networks including Arbitrum)
- [ ] Enforced options: msgType 1 = 80k, msgType 2 = 80k + 8M compose
- [ ] quoteSend() works to Arbitrum

### DVN Configuration — `verifyDvnConfigs.ts`
- [ ] Required DVNs: LayerZero Labs + Canary (both must verify)
- [ ] Optional DVNs: Deutsche Telekom + Horizen (1 of 2 must verify)
- [ ] Threshold = 3 (2 required + 1 optional)
- [ ] Config verified for all 6 contracts × 6 networks × 5 destinations (180 checks)

### ⚠️ Confirmation Verification (CRITICAL) — `verifyConfirmations.ts`
- [ ] Lib addresses match endpoint.getSendLibrary() for all networks
- [ ] Bidirectional consistency verified for all network pairs:
  - For each pair (A → B): A's sendLib confirmations = B's receiveLib expectations from A
- [ ] Config verified for all 6 contracts × 30 network pairs (6×5 directional pairs)

**Why this matters:** If Network A sends with 60 confirmations but Network B expects 15, messages get stuck ("bricked") until the mismatch is fixed. This script queries actual values from contracts rather than comparing against hardcoded expectations.

### Manual Verification
- [ ] Bytecode verified on block explorers (Arbiscan, Etherscan, etc.)
- [ ] Test transfer successful (small amount, both directions)
- [ ] Tokens lock on adapter, mint on OFT (and reverse)
- [ ] Contracts visible on [LayerZero Scan](https://layerzeroscan.com)
