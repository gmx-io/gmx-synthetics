import { ethers } from "ethers";

import {
  REWARD_ROUTER_V2,
  getProvider,
  getRouterAddresses,
  collectTransferCounterparties,
  assertArbitrum,
} from "./lib";
import { getDeployment, readOutFile, writeOutFile, multiRead, multiReadStrict } from "./migrationLib";

// Lists accounts whose sbfGMX is not backed by their own stake: wallet balance plus the pair amounts owed by
// the legacy gmxVester and the new vesters, against stakedAmounts in feeGmxTracker. A RatioVester takes its
// pair by balance, so the excess has to be gone, or the account blocked, before deposits open.
// Candidates are the stakedGmxTracker receipt counterparties; the excess over all of them must equal what
// the custodians owe beyond what they hold, which fails if an over-credited account is missing.
// env: INCENTIVE_RPC, CHECK_BLOCK (default latest), FROM_BLOCK, CHUNK, NETWORK_NAME,
//      EXCESS_TOLERANCE (wei, default 0), STRICT=1 (exit 1 while any account is above the tolerance)

const PARALLEL_READS = 4;

async function readAll(
  provider: ethers.providers.Provider,
  entries: [string, string, unknown[]][],
  block: number
): Promise<ethers.BigNumber[]> {
  const size = Math.max(1, Math.ceil(entries.length / PARALLEL_READS));
  const slices: [string, string, unknown[]][][] = [];
  for (let i = 0; i < entries.length; i += size) {
    slices.push(entries.slice(i, i + size));
  }
  const parts = await Promise.all(slices.map((slice) => multiReadStrict(provider, slice, block)));
  return ([] as ethers.BigNumber[]).concat(...parts);
}

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const networkName = process.env.NETWORK_NAME || "arbitrum";
  const legacy = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  const latest = await provider.getBlockNumber();
  const block = process.env.CHECK_BLOCK ? parseInt(process.env.CHECK_BLOCK) : latest;
  const fromBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 0;
  const chunk = process.env.CHUNK ? parseInt(process.env.CHUNK) : 500_000;
  const tolerance = ethers.BigNumber.from(process.env.EXCESS_TOLERANCE || "0");
  const pairToken = legacy.feeGmxTracker;
  const zero = ethers.constants.Zero;

  const custodians: { name: string; address: string }[] = [{ name: "gmxVester", address: legacy.gmxVester }];
  for (const name of ["SeasonRatioVester", "OrphanRatioVester"]) {
    const address = getDeployment(networkName, name)?.address;
    if (!address) {
      continue;
    }
    const [token] = await multiRead(provider, [[address, "pairToken() view returns (address)", []]], block);
    if (token && token.toLowerCase() === pairToken.toLowerCase()) {
      custodians.push({ name, address });
    }
  }
  const custodyReads = await multiReadStrict(
    provider,
    custodians.flatMap(({ address }) => [
      [address, "pairSupply() view returns (uint256)", []],
      [pairToken, "balanceOf(address) view returns (uint256)", [address]],
    ]) as [string, string, unknown[]][],
    block
  );
  const custody = custodians.map(({ name, address }, i) => ({
    name,
    address,
    owed: custodyReads[2 * i] as ethers.BigNumber,
    held: custodyReads[2 * i + 1] as ethers.BigNumber,
  }));
  // a new vester is read per account only once it holds pair
  const newVesters = custody.slice(1).filter((c) => !c.owed.isZero());

  const cache = fromBlock === 0 ? readOutFile<any>("candidate-scan-cache.json") : undefined;
  const entry = cache?.entries?.[`transfers:${legacy.stakedGmxTracker}`];
  const candidates = new Set<string>(entry?.accounts ?? []);
  const start = entry ? entry.toBlock + 1 : fromBlock;
  if (entry) {
    console.log(`resuming from the candidate cache at block ${entry.toBlock} (${candidates.size} candidates)`);
  }
  if (start <= block) {
    const found = await collectTransferCounterparties(
      provider,
      legacy.stakedGmxTracker,
      start,
      block,
      chunk,
      "stakedGmxTracker receipts"
    );
    for (const account of found) {
      candidates.add(account);
    }
  }
  for (const address of [pairToken, ...custodians.map((c) => c.address)]) {
    candidates.delete(ethers.utils.getAddress(address));
  }
  const accounts = [...candidates];
  console.log(`${accounts.length} candidates; reading balances, stakes and pair amounts at block ${block}`);

  const perAccount = 3 + newVesters.length;
  const entries: [string, string, unknown[]][] = [];
  for (const account of accounts) {
    entries.push([pairToken, "balanceOf(address) view returns (uint256)", [account]]);
    entries.push([pairToken, "stakedAmounts(address) view returns (uint256)", [account]]);
    entries.push([legacy.gmxVester, "pairAmounts(address) view returns (uint256)", [account]]);
    for (const vester of newVesters) {
      entries.push([vester.address, "pairAmounts(address) view returns (uint256)", [account]]);
    }
  }
  const values = await readAll(provider, entries, block);

  // walletExcess can be used as pair today and lockedExcess reaches the wallet on withdrawal; syncAmount is
  // what VesterCap.syncFeeGmxTrackerBalance moves, which ignores the pair amounts
  let pairSum = zero;
  let excessSum = zero;
  let underCount = 0;
  const over: {
    account: string;
    staked: string;
    wallet: string;
    legacyPair: string;
    newPair: string;
    excess: string;
    walletExcess: string;
    lockedExcess: string;
    syncAmount: string;
  }[] = [];
  const totals = { excess: zero, walletExcess: zero, lockedExcess: zero, syncAmount: zero };
  let syncCount = 0;
  let afterSyncCount = 0;
  for (let i = 0; i < accounts.length; i++) {
    const wallet = values[perAccount * i];
    const staked = values[perAccount * i + 1];
    const legacyPair = values[perAccount * i + 2];
    let newPair = zero;
    for (let j = 0; j < newVesters.length; j++) {
      newPair = newPair.add(values[perAccount * i + 3 + j]);
    }
    pairSum = pairSum.add(legacyPair);
    const held = wallet.add(legacyPair).add(newPair);
    excessSum = excessSum.add(held).sub(staked);
    if (held.lt(staked)) {
      underCount++;
    }
    if (!held.gt(staked.add(tolerance))) {
      continue;
    }
    const excess = held.sub(staked);
    const walletExcess = wallet.lt(excess) ? wallet : excess;
    const syncAmount = wallet.gt(staked) ? wallet.sub(staked) : zero;
    totals.excess = totals.excess.add(excess);
    totals.walletExcess = totals.walletExcess.add(walletExcess);
    totals.lockedExcess = totals.lockedExcess.add(excess.sub(walletExcess));
    totals.syncAmount = totals.syncAmount.add(syncAmount);
    if (!syncAmount.isZero()) {
      syncCount++;
    }
    if (excess.gt(syncAmount)) {
      afterSyncCount++;
    }
    over.push({
      account: accounts[i],
      staked: staked.toString(),
      wallet: wallet.toString(),
      legacyPair: legacyPair.toString(),
      newPair: newPair.toString(),
      excess: excess.toString(),
      walletExcess: walletExcess.toString(),
      lockedExcess: excess.sub(walletExcess).toString(),
      syncAmount: syncAmount.toString(),
    });
  }
  over.sort((a, b) =>
    ethers.BigNumber.from(b.excess).gt(a.excess) ? 1 : ethers.BigNumber.from(b.excess).eq(a.excess) ? 0 : -1
  );

  const shortfall = custody.reduce((sum, c) => sum.add(c.owed).sub(c.held), zero);
  const pairsMatch = pairSum.eq(custody[0].owed);
  const excessMatches = excessSum.eq(shortfall);
  const format = (value: ethers.BigNumber) => ethers.utils.formatEther(value);

  const outFile = writeOutFile("unbacked-pair-accounts.json", {
    generatedAt: new Date().toISOString(),
    block,
    scan: { fromBlock: entry ? 0 : fromBlock, toBlock: block, candidates: accounts.length },
    pairToken,
    tolerance: tolerance.toString(),
    custody: custody.map((c) => ({
      name: c.name,
      address: c.address,
      owed: c.owed.toString(),
      held: c.held.toString(),
      shortfall: c.owed.sub(c.held).toString(),
    })),
    reconciliation: {
      pairAmountsSum: pairSum.toString(),
      legacyPairSupply: custody[0].owed.toString(),
      pairsMatch,
      excessSum: excessSum.toString(),
      custodyShortfall: shortfall.toString(),
      excessMatches,
      underCreditedAccounts: underCount,
    },
    totals: {
      accounts: over.length,
      excess: totals.excess.toString(),
      walletExcess: totals.walletExcess.toString(),
      lockedExcess: totals.lockedExcess.toString(),
      syncAmount: totals.syncAmount.toString(),
      syncAccounts: syncCount,
      remainingAfterSync: totals.excess.sub(totals.syncAmount).toString(),
      accountsAfterSync: afterSyncCount,
    },
    accounts: over,
  });

  for (const c of custody) {
    console.log(`${c.name}: owes ${format(c.owed)} sbfGMX in pair amounts, holds ${format(c.held)}`);
  }
  console.log(`over-credited accounts: ${over.length}, excess ${format(totals.excess)} sbfGMX`);
  console.log(`  in wallets now, usable as pair: ${format(totals.walletExcess)}`);
  console.log(`  inside a vester until withdrawal: ${format(totals.lockedExcess)}`);
  console.log(
    `  syncFeeGmxTrackerBalance would move ${format(totals.syncAmount)} from ${syncCount} accounts, leaving ${format(
      totals.excess.sub(totals.syncAmount)
    )} with ${afterSyncCount} accounts`
  );
  console.log(
    `reconciliation: pair amounts ${pairsMatch ? "match" : "DO NOT match"} the gmxVester's pairSupply; excess ${
      excessMatches ? "matches" : "DOES NOT match"
    } the custodians' shortfall of ${format(shortfall)}; under-credited accounts ${underCount}`
  );
  console.log(`written to ${outFile}`);

  if (!pairsMatch || !excessMatches) {
    throw new Error("reconciliation failed: the candidate set does not cover every pair amount or every excess");
  }
  if (process.env.STRICT === "1" && over.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
