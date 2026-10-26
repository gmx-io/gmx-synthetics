import fs from "fs";
import path from "path";
import { ethers } from "ethers";

import { REWARD_ROUTER_V2, getProvider, getLogsAdaptive, assertArbitrum } from "./lib";

// Inventories recent RewardRouterV2 callers for the integrator comms: transactions behind
// recent router events, classified as direct EOA calls or contract integrations (tx.to is
// not the router). Blind spot: flows emitting no router event (claim-only) need a trace
// node; stake, unstake, and compound are covered.
// env: INCENTIVE_RPC, FROM_BLOCK (default latest-2_000_000), TO_BLOCK, CHUNK, MAX_TX

const EVENT_TOPICS = {
  StakeGmx: ethers.utils.id("StakeGmx(address,address,uint256)"),
  UnstakeGmx: ethers.utils.id("UnstakeGmx(address,address,uint256)"),
  StakeGlp: ethers.utils.id("StakeGlp(address,uint256)"),
  UnstakeGlp: ethers.utils.id("UnstakeGlp(address,uint256)"),
};

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);

  const router = REWARD_ROUTER_V2.arbitrum;
  const latest = await provider.getBlockNumber();
  const fromBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : latest - 2_000_000;
  const toBlock = process.env.TO_BLOCK ? parseInt(process.env.TO_BLOCK) : latest;
  const chunk = process.env.CHUNK ? parseInt(process.env.CHUNK) : 250_000;
  const maxTx = process.env.MAX_TX ? parseInt(process.env.MAX_TX) : 2000;

  console.log(`scanning router events in blocks ${fromBlock}..${toBlock}`);

  const txHashes = new Set<string>();
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = Math.min(start + chunk - 1, toBlock);
    const logs = await getLogsAdaptive(
      provider,
      { address: router, topics: [Object.values(EVENT_TOPICS)] },
      start,
      end
    );
    for (const log of logs) {
      txHashes.add(log.transactionHash);
    }
  }
  console.log(`${txHashes.size} transactions with router events`);

  const hashes = [...txHashes];
  const sampled = hashes.length > maxTx ? hashes.filter((_, i) => i % Math.ceil(hashes.length / maxTx) === 0) : hashes;
  console.log(`classifying ${sampled.length} transactions${sampled.length < hashes.length ? " (sampled)" : ""}`);

  const contractCallers = new Map<string, number>();
  let directCalls = 0;
  const concurrency = 10;
  for (let i = 0; i < sampled.length; i += concurrency) {
    const txs = await Promise.all(sampled.slice(i, i + concurrency).map((h) => provider.getTransaction(h)));
    for (const tx of txs) {
      if (!tx || !tx.to) {
        continue;
      }
      if (tx.to.toLowerCase() === router.toLowerCase()) {
        directCalls += 1;
      } else {
        const to = ethers.utils.getAddress(tx.to);
        contractCallers.set(to, (contractCallers.get(to) || 0) + 1);
      }
    }
  }

  const integrations = [...contractCallers.entries()]
    .map(([address, txCount]) => ({ address, txCount }))
    .sort((a, b) => b.txCount - a.txCount);

  const result = {
    generatedAt: new Date().toISOString(),
    scan: { fromBlock, toBlock, sampled: sampled.length, totalTx: hashes.length },
    directCalls,
    integrations,
  };

  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "v2-caller-inventory.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log(`direct EOA calls: ${directCalls}`);
  console.log(`contract integrations: ${integrations.length}`);
  for (const entry of integrations.slice(0, 20)) {
    console.log(`  ${entry.address}: ${entry.txCount} txs`);
  }
  console.log(`written to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
