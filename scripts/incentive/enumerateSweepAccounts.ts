import fs from "fs";
import path from "path";

import {
  REWARD_ROUTER_V2,
  getProvider,
  getRouterAddresses,
  collectDepositorsInto,
  collectTransferCounterparties,
  filterPositiveDepositBalances,
  sumAmounts,
  assertArbitrum,
} from "./lib";

// Enumerates the accounts the pre-cutover sweeps must process (sweeps 1 and 2):
//   bonusInFee    old-layout bonus receipts in feeGmxTracker -> batchRestakeForAccounts
//   bnInFee       old-layout bnGmx in feeGmxTracker          -> converted by the same restake
//   bnInExtended  staked multiplier points                   -> batchCompoundForAccounts at zero boost
// Verified via Multicall3 so the output holds only live balances; re-run near cutover.
// env: INCENTIVE_RPC, FROM_BLOCK, TO_BLOCK, CHUNK

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);

  const addresses = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  const latest = await provider.getBlockNumber();
  const fromBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 0;
  const toBlock = process.env.TO_BLOCK ? parseInt(process.env.TO_BLOCK) : latest;
  const chunk = process.env.CHUNK ? parseInt(process.env.CHUNK) : 500_000;

  console.log(`scanning blocks ${fromBlock}..${toBlock} (chunk ${chunk})`);
  console.log(`feeGmxTracker ${addresses.feeGmxTracker}`);
  console.log(`extendedGmxTracker ${addresses.extendedGmxTracker}`);

  const bonusIntoFee = await collectDepositorsInto(
    provider,
    addresses.bonusGmxTracker,
    addresses.feeGmxTracker,
    fromBlock,
    toBlock,
    chunk,
    "bonus receipts -> feeGmxTracker"
  );
  const bnIntoFee = await collectDepositorsInto(
    provider,
    addresses.bnGmx,
    addresses.feeGmxTracker,
    fromBlock,
    toBlock,
    chunk,
    "bnGmx -> feeGmxTracker"
  );
  const bnIntoExtended = await collectDepositorsInto(
    provider,
    addresses.bnGmx,
    addresses.extendedGmxTracker,
    fromBlock,
    toBlock,
    chunk,
    "bnGmx -> extendedGmxTracker"
  );

  // stakeForAccount funds from the sender, so a transfer receiver never appears as a
  // Transfer sender into the custodian; receipt counterparties are a covering superset
  const feeReceiptHolders = await collectTransferCounterparties(
    provider,
    addresses.feeGmxTracker,
    fromBlock,
    toBlock,
    chunk,
    "feeGmxTracker receipts"
  );
  const extendedReceiptHolders = await collectTransferCounterparties(
    provider,
    addresses.extendedGmxTracker,
    fromBlock,
    toBlock,
    chunk,
    "extendedGmxTracker receipts"
  );
  for (const account of feeReceiptHolders) {
    bonusIntoFee.add(account);
    bnIntoFee.add(account);
  }
  for (const account of extendedReceiptHolders) {
    bnIntoExtended.add(account);
  }

  console.log(
    `candidates: bonusInFee ${bonusIntoFee.size}, bnInFee ${bnIntoFee.size}, bnInExtended ${bnIntoExtended.size}`
  );
  console.log("verifying current balances via multicall...");

  const bonusInFee = await filterPositiveDepositBalances(provider, addresses.feeGmxTracker, addresses.bonusGmxTracker, [
    ...bonusIntoFee,
  ]);
  const bnInFee = await filterPositiveDepositBalances(provider, addresses.feeGmxTracker, addresses.bnGmx, [
    ...bnIntoFee,
  ]);
  const bnInExtended = await filterPositiveDepositBalances(provider, addresses.extendedGmxTracker, addresses.bnGmx, [
    ...bnIntoExtended,
  ]);

  const result = {
    generatedAt: new Date().toISOString(),
    verifiedAtBlock: latest,
    scan: { fromBlock, toBlock, chunk },
    routerConfig: addresses,
    bonusInFee: { count: bonusInFee.length, total: sumAmounts(bonusInFee), accounts: bonusInFee },
    bnInFee: { count: bnInFee.length, total: sumAmounts(bnInFee), accounts: bnInFee },
    bnInExtended: { count: bnInExtended.length, total: sumAmounts(bnInExtended), accounts: bnInExtended },
  };

  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "sweep-accounts.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log(`bonusInFee: ${bonusInFee.length} accounts, total ${result.bonusInFee.total}`);
  console.log(`bnInFee: ${bnInFee.length} accounts, total ${result.bnInFee.total}`);
  console.log(`bnInExtended: ${bnInExtended.length} accounts, total ${result.bnInExtended.total}`);
  console.log(`written to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
