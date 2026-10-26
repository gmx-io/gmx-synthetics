import fs from "fs";
import path from "path";
import { ethers } from "ethers";

import {
  REWARD_ROUTER_V2,
  getProvider,
  getRouterAddresses,
  getReferralVester,
  collectTransferCounterparties,
  collectAcceptTransferParties,
  assertArbitrum,
} from "./lib";
import { readOutFile, writeOutFile, multiReadStrict } from "./migrationLib";

// Enumerates accounts with an open cap on all three legacy vesters (step 9 input), plus
// accounts whose cap is zero only until pending tracker rewards land on their next touch:
// candidates from receipt and vester token histories plus acceptTransfer transaction
// inputs (transferred and bonus caps emit no events), verified with getMaxVestableAmount.
// bonusRewards-only accounts need out/bonus-rewards-accounts.json from the sender
// records; prior router generations come from legacy-writer-candidates.json.
// env: INCENTIVE_RPC, FROM_BLOCK, TO_BLOCK, CHUNK, EXPLORER_API_URL, EXPLORER_API_KEY

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const legacy = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  const latest = await provider.getBlockNumber();
  const fromBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 0;
  const toBlock = process.env.TO_BLOCK ? parseInt(process.env.TO_BLOCK) : latest;
  const chunk = process.env.CHUNK ? parseInt(process.env.CHUNK) : 500_000;

  const referralVester = await getReferralVester(provider, legacy.esGmx);

  // full-history scans resume from a per-source checkpoint: candidate sets only grow, so a
  // re-run scans the blocks since the last run and a retired router's history is scanned once
  const cacheFile = "candidate-scan-cache.json";
  const cache: { entries: { [key: string]: { toBlock: number; accounts: string[] } } } = (fromBlock === 0 &&
    readOutFile<any>(cacheFile)) || { entries: {} };
  const incremental = async (
    key: string,
    scan: (from: number, to: number) => Promise<Set<string>>
  ): Promise<Set<string>> => {
    const entry = fromBlock === 0 ? cache.entries[key] : undefined;
    const accounts = new Set<string>(entry?.accounts ?? []);
    const start = entry ? entry.toBlock + 1 : fromBlock;
    if (start <= toBlock) {
      for (const account of await scan(start, toBlock)) {
        accounts.add(account);
      }
    } else {
      console.log(`${key}: checkpoint at block ${entry!.toBlock} covers the range`);
    }
    if (fromBlock === 0) {
      cache.entries[key] = { toBlock, accounts: [...accounts] };
      writeOutFile(cacheFile, cache);
    }
    return accounts;
  };

  const gmxSide = await incremental(`transfers:${legacy.stakedGmxTracker}`, (from, to) =>
    collectTransferCounterparties(provider, legacy.stakedGmxTracker, from, to, chunk, "stakedGmxTracker receipts")
  );
  const glpSide = await incremental(`transfers:${legacy.stakedGlpTracker}`, (from, to) =>
    collectTransferCounterparties(provider, legacy.stakedGlpTracker, from, to, chunk, "stakedGlpTracker receipts")
  );
  const referralSide = await incremental(`transfers:${referralVester}`, (from, to) =>
    collectTransferCounterparties(provider, referralVester, from, to, chunk, "referral vester tokens")
  );

  const candidatesFile = path.join(__dirname, "legacy-writer-candidates.json");
  const routerGenerations: string[] = fs.existsSync(candidatesFile)
    ? (JSON.parse(fs.readFileSync(candidatesFile, "utf8")).routerGenerations || []).filter((a: string) =>
        ethers.utils.isAddress(a)
      )
    : [];
  if (routerGenerations.length === 0) {
    console.log(
      "routerGenerations unfilled in legacy-writer-candidates.json; only the current router's acceptTransfer history is scanned"
    );
  }
  const transferParties = new Set<string>();
  for (const router of [legacy.router, ...routerGenerations]) {
    const parties = await incremental(`acceptTransfer:${router}`, (from, to) =>
      collectAcceptTransferParties(router, from, to, `acceptTransfer ${router}`)
    );
    for (const account of parties) {
      transferParties.add(account);
    }
  }

  const merged = readOutFile<any>("bonus-rewards-accounts.json");
  const bonusSide: string[] = merged ? merged.accounts.map((e: any) => ethers.utils.getAddress(e.account ?? e)) : [];
  if (!merged) {
    console.log("no out/bonus-rewards-accounts.json; bonusRewards-only accounts are not covered by the receipt scan");
  }
  // the orphan snapshot's account set (every esGMX counterparty) is unioned in when present, so a cap
  // credited through a writer path the records scan cannot see, such as a multisig's internal calls,
  // is still checked by state
  const snapshot = readOutFile<any>("orphan-snapshot.json");
  const snapshotSide: string[] = snapshot ? snapshot.accounts.map((e: any) => ethers.utils.getAddress(e.account)) : [];
  if (!snapshot) {
    console.log(
      "no out/orphan-snapshot.json; caps on accounts outside the receipt, transfer and records scans are not checked"
    );
  }
  const candidates = [
    ...new Set([...gmxSide, ...glpSide, ...referralSide, ...transferParties, ...bonusSide, ...snapshotSide]),
  ];
  console.log(`${candidates.length} candidates; checking caps on all three legacy vesters`);

  const results: {
    [name: string]: { count: number; accounts: { vester: string; account: string; amount: string }[] };
  } = {};
  for (const [name, vester, tracker] of [
    ["gmxVester", legacy.gmxVester, legacy.stakedGmxTracker],
    ["glpVester", legacy.glpVester, legacy.stakedGlpTracker],
    ["referralVester", referralVester, undefined],
  ] as [string, string, string | undefined][]) {
    const caps = await multiReadStrict(
      provider,
      candidates.map(
        (account) =>
          [vester, "getMaxVestableAmount(address) view returns (uint256)", [account]] as [string, string, unknown[]]
      )
    );
    const pending = tracker
      ? await multiReadStrict(
          provider,
          candidates.map(
            (account) =>
              [tracker, "claimable(address) view returns (uint256)", [account]] as [string, string, unknown[]]
          )
        )
      : candidates.map(() => ethers.constants.Zero);
    const open = candidates
      .map((account, i) => ({ vester, account, amount: caps[i].toString(), pending: pending[i].toString() }))
      .filter((e) => e.amount !== "0" || e.pending !== "0");
    const pendingOnly = open.filter((e) => e.amount === "0").length;
    results[name] = { count: open.length, accounts: open };
    console.log(
      `${name}: ${open.length} accounts with an open cap (${pendingOnly} open only once pending tracker rewards land)`
    );
  }

  const outFile = writeOutFile("legacy-cap-accounts.json", {
    generatedAt: new Date().toISOString(),
    verifiedAtBlock: latest,
    scan: { fromBlock, toBlock, chunk, routersScanned: [legacy.router, ...routerGenerations] },
    gmxVester: results.gmxVester,
    glpVester: results.glpVester,
    referralVester: results.referralVester,
  });
  console.log(`written to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
