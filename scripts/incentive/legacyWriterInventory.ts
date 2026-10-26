import fs from "fs";
import path from "path";
import { ethers } from "ethers";

import { REWARD_ROUTER_V2, getProvider, getRouterAddresses, getReferralVester, assertArbitrum } from "./lib";

// Reconstructs the legacy cap-writer inventory (step-1 preconditions):
// distributor emission and balances, esGMX minter and handler status, legacy gov addresses.
// Writers not derivable on-chain are read from legacy-writer-candidates.json; fill it from
// deployment records before zeroing.
// env: INCENTIVE_RPC

const ABI = [
  "function distributor() view returns (address)",
  "function rewardToken() view returns (address)",
  "function tokensPerInterval() view returns (uint256)",
  "function admin() view returns (address)",
  "function gov() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function isMinter(address) view returns (bool)",
  "function isHandler(address) view returns (bool)",
  "function inPrivateTransferMode() view returns (bool)",
];

type Candidate = { name: string; address: string };

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);

  const addresses = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  const at = (address: string) => new ethers.Contract(address, ABI, provider);
  const esGmx = at(addresses.esGmx);

  const candidatesFile = path.join(__dirname, "legacy-writer-candidates.json");
  const candidates: Candidate[] = fs.existsSync(candidatesFile)
    ? JSON.parse(fs.readFileSync(candidatesFile, "utf8")).candidates
    : [];
  const unfilled = candidates.filter((c) => !ethers.utils.isAddress(c.address));
  const filled = candidates.filter((c) => ethers.utils.isAddress(c.address));

  // the esGMX-emitting distributors must stop and drain; the fee distributors keep their cadence
  const trackers = [
    { name: "stakedGmxTracker", address: addresses.stakedGmxTracker },
    { name: "bonusGmxTracker", address: addresses.bonusGmxTracker },
    { name: "extendedGmxTracker", address: addresses.extendedGmxTracker },
    { name: "feeGmxTracker", address: addresses.feeGmxTracker },
    { name: "stakedGlpTracker", address: addresses.stakedGlpTracker },
    { name: "feeGlpTracker", address: addresses.feeGlpTracker },
  ];
  const distributors: any[] = [];
  for (const tracker of trackers) {
    const distributor = await at(tracker.address).distributor();
    const [rewardToken, tokensPerInterval, esGmxBalance, admin] = await Promise.all([
      at(distributor)
        .rewardToken()
        .catch(() => "n/a"),
      at(distributor).tokensPerInterval(),
      esGmx.balanceOf(distributor),
      at(distributor)
        .admin()
        .catch(() => "n/a"),
    ]);
    distributors.push({
      tracker: tracker.name,
      distributor,
      admin,
      rewardToken,
      emitsEsGmx: rewardToken === addresses.esGmx,
      tokensPerInterval: tokensPerInterval.toString(),
      esGmxBalance: esGmxBalance.toString(),
      emissionZero: tokensPerInterval.isZero(),
      drained: esGmxBalance.isZero(),
    });
  }

  // esGMX minter and handler status for every derivable and candidate writer
  const referralVester = await getReferralVester(provider, addresses.esGmx);
  const writers: Candidate[] = [
    { name: "gmxVester", address: addresses.gmxVester },
    { name: "glpVester", address: addresses.glpVester },
    { name: "referralVester", address: referralVester },
    { name: "rewardRouterV2", address: addresses.router },
    ...filled,
  ];
  // gov of each legacy contract that the sequence reconfigures (Timelock exposure)
  const govOf: any = {};
  for (const c of [
    { name: "esGmx", address: addresses.esGmx },
    { name: "gmxVester", address: addresses.gmxVester },
    { name: "glpVester", address: addresses.glpVester },
    { name: "referralVester", address: referralVester },
    ...trackers,
    ...distributors.map((d) => ({ name: `${d.tracker}Distributor`, address: d.distributor })),
  ]) {
    govOf[c.name] = await at(c.address)
      .gov()
      .catch(() => "n/a");
  }

  // a gov Timelock can hold a standing esGMX minter flag of its own
  const govAddresses = [...new Set(Object.values(govOf) as string[])].filter((gov) => ethers.utils.isAddress(gov));
  for (const gov of govAddresses) {
    const governs = Object.keys(govOf).filter((name) => govOf[name] === gov);
    writers.push({ name: `gov of ${governs.join(", ")}`, address: gov });
  }

  // feeGmxTracker is the new vesters' pair token, so its handler flag is read with the esGMX ones
  const feeGmxTracker = at(addresses.feeGmxTracker);
  const esGmxStatus: any[] = [];
  for (const writer of writers) {
    const [isMinter, isHandler, isPairHandler] = await Promise.all([
      esGmx.isMinter(writer.address),
      esGmx.isHandler(writer.address),
      feeGmxTracker.isHandler(writer.address),
    ]);
    esGmxStatus.push({
      ...writer,
      esGmxMinter: isMinter,
      esGmxHandler: isHandler,
      feeGmxTrackerHandler: isPairHandler,
    });
  }

  const inPrivateTransferMode = await esGmx.inPrivateTransferMode();

  const result = {
    generatedAt: new Date().toISOString(),
    block: await provider.getBlockNumber(),
    routerConfig: addresses,
    inPrivateTransferMode,
    distributors,
    esGmxStatus,
    govOf,
    unfilledCandidates: unfilled.map((c) => c.name),
  };

  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "legacy-writer-inventory.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log("distributors:");
  for (const d of distributors) {
    console.log(
      `  ${d.tracker}: rewardToken ${d.rewardToken} (esGMX: ${d.emitsEsGmx}), tokensPerInterval ${d.tokensPerInterval} (zero: ${d.emissionZero}), esGMX balance ${d.esGmxBalance} (drained: ${d.drained})`
    );
  }
  console.log("esGMX writer status:");
  for (const w of esGmxStatus) {
    console.log(
      `  ${w.name} ${w.address}: minter ${w.esGmxMinter}, handler ${w.esGmxHandler}, feeGmxTracker handler ${w.feeGmxTrackerHandler}`
    );
  }
  console.log("gov:", JSON.stringify(govOf, null, 2));
  if (unfilled.length) {
    console.log(
      `UNFILLED candidates (add addresses from deployment records): ${unfilled.map((c) => c.name).join(", ")}`
    );
  }
  console.log(`written to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
