# USDG donation deployment and activation runbook

Network: Arbitrum One (`42161`). Target branch: `v2.2c-donation`.

## Status snapshot

Checked on 2026-10-01 against commit `3759bccfa49061f2d98349d8fea871cae4268357` and Arbitrum block `510602410`:

- All three donation contracts are already deployed. Deployment receipts succeeded and their dependency addresses match the deployment records.
- Neither donation handler has `CONTROLLER`; there are no `DONATION_KEEPER` members yet.
- All six intended donation configurations are unset and disabled.
- The timelock delay is `86400` seconds (24 hours).

This is a historical snapshot, not a live status check. Recheck chain state and pending timelock operations before execution.

## 1. Prepare the checkout and verify deployments

```bash
git fetch origin
git switch v2.2c-donation
git merge --ff-only origin/v2.2c-donation
npx hardhat compile
```

Verify the following addresses against the deployment records, reviewed source, and on-chain dependencies before granting permissions:

| Contract                  | Deployed address                             | Required role     |
| ------------------------- | -------------------------------------------- | ----------------- |
| MarketPoolDonationHandler | `0x2AB2B848F64637b5c69BbE42FE72800f2494DAc4` | `CONTROLLER`      |
| GlvDonationHandler        | `0x842c1E1e991F79805B1cbdf0EE427e2B44E3ae87` | `CONTROLLER`      |
| DonationBatcher           | `0x387E9b8B8F17d3F87f3Cf3b4f8b20a1f59b2947C` | `DONATION_KEEPER` |

See [Arbitrum deployments](arbitrum-deployments.md) and the JSON records under `deployments/arbitrum/`.

The deployment scripts do not automatically grant these roles on an existing mainnet deployment: `grantRoleIfNotGranted` returns without writing in that mode. Having `CONFIG_KEEPER` alone is not sufficient to activate the system or grant roles.

## 2. Grant roles through the existing timelock workflow

Review [rolesToAdd/arbitrum.ts](../scripts/roles/rolesToAdd/arbitrum.ts) and [rolesToRemove/arbitrum.ts](../scripts/roles/rolesToRemove/arbitrum.ts). At the snapshot, the add list contains exactly 23 entries: the three contract grants above plus `DONATION_KEEPER` for 20 keeper accounts. The remove list is empty. Do not include unrelated grants in this activation.

### Signal a new batch

First check whether these operations have already been scheduled or executed. For a new, not-yet-signalled batch only, generate a salt and save it with the release evidence; keep it unchanged through execution:

```bash
export DONATION_ROLE_SALT="0x$(openssl rand -hex 32)"

WRITE=false \
SALT="$DONATION_ROLE_SALT" \
TIMELOCK_METHOD=signalGrantRole \
npx hardhat run --network arbitrum scripts/updateRoles.ts
```

### Execute the grants after the delay

Wait until the scheduled grant operations are executable. The delay observed in the snapshot is 24 hours from successful scheduling; use the live controller delay and operation readiness, not merely the time the Safe proposal was created.

Use the original saved salt, with exactly the same recipient list:

```bash
WRITE=false \
SALT="$DONATION_ROLE_SALT" \
TIMELOCK_METHOD=grantRoleAfterSignal \
npx hardhat run --network arbitrum scripts/updateRoles.ts
```

Verify the resulting roles:

```bash
npx hardhat run --network arbitrum scripts/printRoles.ts
```

Both handlers must have `CONTROLLER`; the batcher and the intended execution bots must have `DONATION_KEEPER`.


## 3. Prepare configuration


Confirm that the three USDG markets in `config/markets.ts` include their GM `donation` settings and that the USDG GLV's three constituent entries in `config/glvs.ts` include their per-market `donation` settings. `scripts/updateDonationConfig.ts` reads both files independently. Review the merged values against this runbook. Stop if they differ from the approved configuration. These settings are applied only by the donation script, not the core market/GLV-config updaters. No contract deployment is needed for this configuration-only change.

GM addresses are resolved on-chain from the configured index/long/short tokens using the same lookup as the core updaters. For GLV donations, the index token comes from the constituent entry and the long/short tokens and GLV address come from its parent GLV config. A missing configured market stops the script rather than producing a partial batch. Funding accounts remain explicit configuration choices. Verify the resolved addresses in the preview against the intended targets below:

| Target      | Address                                      |
| ----------- | -------------------------------------------- |
| BTC/USDG GM | `0xe57B97F2f83F39E74Ec83f3e039FD370884784fF` |
| ETH/USDG GM | `0x6f095F58e9Eb2c583A1828202712c03962491d7e` |
| SOL/USDG GM | `0xfF63B0f938772e2b4fFD1A1b340Afe49616c95f2` |
| USDG GLV    | `0x4Cd5A94a30876320ac65F2e192493EE476f13866` |

There are six configurations: three GM markets and three GLV-market pairs, all using the same GLV.

Only explicit `donation` blocks are managed. Adding a constituent does not enable donations automatically; removing a block does not disable an existing on-chain configuration. Keep the block and set `isEnabled: false` to disable it. GLV donation caps are per GLV-market pair, not a shared vault budget, and do not require GM pool donations to be enabled.

## 4. Configure the handlers from an existing CONFIG_KEEPER

Use an existing authorized account; no new configuration-role grant is required by this runbook. For the Safe workflow below, the security multisig `0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D` held `CONFIG_KEEPER` at the snapshot. Confirm that it still does before use.

```bash
export CONFIG_KEEPER=0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D

WRITE=false CHECK=false \
npx hardhat run --network arbitrum scripts/updateDonationConfig.ts
```

This validates the network, dependencies, handler roles, and target tokens; reads all six configurations; simulates changed setters as the specified CONFIG_KEEPER; and exports a Safe batch. It does not send transactions or prompt for execution.


Expected initial configuration:

| Entry type           | Per-donation factor cap     | Per-period amount cap  |
| -------------------- | --------------------------- | ---------------------- |
| Each GM market       | 1.5 bp of that pool's value | 30,000 USDG per market |
| Each GLV-market pair | 3 bp of GLV value           | 30,000 GM per pair     |

All six entries use:

- Funding account: `0x62cCEB1d45268c47D1b25CDbdbdc9EE3B1fca457`.
- `isEnabled`: `true`.
- `donationPeriodDuration`: `86400` seconds, Unix-aligned days, not rolling 24-hour windows.

- GM `maxDonationFactor`: `150000000000000000000000000` (30-decimal factor).
- GM `maxDonationAmountPerPeriod`: `30000000000` (USDG, 6 decimals).
- GLV `maxDonationFactor`: `300000000000000000000000000` (30-decimal factor).
- GLV `maxDonationAmountPerPeriod`: `30000000000000000000000` (GM, 18 decimals).



Verify all six configurations after Safe execution:

```bash
WRITE=false CHECK=true \
npx hardhat run --network arbitrum scripts/updateDonationConfig.ts
```

Expected output: `All 6 donation configs match config/markets.ts / config/glvs.ts (on-chain readback).`

The configuration script is idempotent: matching entries produce no transaction, and rerunning after partial execution includes only remaining differences. Leave `ALLOW_PERIOD_RESET` unset for initial setup. A later change to an existing period duration resets accrued quota and requires explicit review and opt-in.

## 5. Fund and approve the correct spenders

From the configured funding Safe, provide the necessary token balances and approve only the authorized funding tranches:

| Token                                    | Spender                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| USDG                                     | MarketPoolDonationHandler: `0x2AB2B848F64637b5c69BbE42FE72800f2494DAc4` |
| Each GM token selected for GLV donations | GlvDonationHandler: `0x842c1E1e991F79805B1cbdf0EE427e2B44E3ae87`        |

Use bounded, approved tranche amounts, not unlimited allowances. **Do not approve DonationBatcher:** the handlers pull tokens directly from the configured funding account. Approvals are separate operations; the configuration script does not fund, approve, or donate tokens.

Keep the scheduled donation bot paused until configuration readback, approvals, and the keeper integration checks below are complete.

## 6. Validate keeper integration and run a pilot

Before any GLV donation, confirm that keepers will not execute GLV deposits or withdrawals using a pre-donation signed GLV valuation until the off-chain price includes the donation. Atomic balance sync updates recorded holdings, but does not refresh or invalidate an externally signed GLV price.

Simulate the pilot with fresh oracle inputs and verify market/GLV balance-cap headroom, remaining donation quota, sufficient funding and allowances, and live circulating supply beyond the locked bootstrap shares. Confirm above-cap donations revert through simulation or fork tests.

Then coordinate an authorized keeper's small pilot batch through DonationBatcher covering the three GM donations and one GLV donation. Verify:

- The batch succeeds atomically and accounting increases by the donated amounts.
- GM and GLV token supplies remain unchanged.
- The donated GM's actual GLV balance matches its recorded balance.
- Donation events are processed by the indexer and valuations include the donations.
- The applicable per-period quotas are consumed correctly.
- Fresh signed GLV valuation is available before normal GLV operations resume.

Only then enable scheduled execution. Save the checkout commit, role batch salt and transaction hashes, configuration batch and readback, approvals, and pilot evidence with the release record.
