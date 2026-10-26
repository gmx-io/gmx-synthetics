import fs from "fs";
import path from "path";
import { ethers } from "ethers";

import {
  REWARD_ROUTER_V2,
  getProvider,
  getRouterAddresses,
  getReferralVester,
  forEachExplorerTx,
  assertArbitrum,
} from "./lib";
import { multiRead, multiReadStrict, writeOutFile } from "./migrationLib";

// Recovers the accounts credited with eventless cap terms on the three legacy vesters from
// the writers' transaction inputs: EsGmxBatchSender.send (transferred caps) and the Timelocks'
// batchSetBonusRewards and batchIncreaseBonusRewards (bonus caps), top-level or wrapped in
// multicall, across every Timelock that has governed a vester (the timelocks list in
// legacy-writer-candidates.json plus the live governors). Writes out/bonus-rewards-accounts.json
// for the cap enumeration and reports each Timelock's live contract handlers and keepers, since
// those can call the bonus functions without a buffer.
// env: INCENTIVE_RPC, EXPLORER_API_URL, EXPLORER_API_KEY

const SEND = ethers.utils.id("send(address,uint256,address[],uint256[])").slice(0, 10);
const BONUS_FUNCTIONS: { [selector: string]: string } = Object.fromEntries(
  ["batchSetBonusRewards", "batchIncreaseBonusRewards"].map((name) => [
    ethers.utils.id(`${name}(address,address[],uint256[])`).slice(0, 10),
    name,
  ])
);
const SET_HANDLER = ethers.utils.id("setContractHandler(address,bool)").slice(0, 10);
const SET_KEEPER = ethers.utils.id("setKeeper(address,bool)").slice(0, 10);
const MULTICALL = ethers.utils.id("multicall(bytes[])").slice(0, 10);

// visits a Timelock call and, for multicall, each wrapped call
function forEachTimelockCall(input: string, onCall: (selector: string, data: string) => void) {
  if (input.startsWith(MULTICALL)) {
    const [calls] = ethers.utils.defaultAbiCoder.decode(["bytes[]"], "0x" + input.slice(10));
    calls.forEach((call: string) => forEachTimelockCall(call, onCall));
    return;
  }
  onCall(input.slice(0, 10), "0x" + input.slice(10));
}

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const legacy = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  const referralVester = await getReferralVester(provider, legacy.esGmx);
  const latest = await provider.getBlockNumber();
  const vesterNames: { [address: string]: string } = {
    [legacy.gmxVester.toLowerCase()]: "gmxVester",
    [legacy.glpVester.toLowerCase()]: "glpVester",
    [referralVester.toLowerCase()]: "referralVester",
  };
  const credited: { [vester: string]: Set<string> } = {
    gmxVester: new Set(),
    glpVester: new Set(),
    referralVester: new Set(),
  };
  const provenance: { writer: string; address: string; calls: number; term: string }[] = [];

  const candidatesFile = path.join(__dirname, "legacy-writer-candidates.json");
  const candidatesJson = JSON.parse(fs.readFileSync(candidatesFile, "utf8"));
  const candidates: { name: string; address: string }[] = candidatesJson.candidates || [];
  const listedTimelocks: { name: string; address: string }[] = (candidatesJson.timelocks || []).filter(
    (t: { address: string }) => ethers.utils.isAddress(t.address)
  );
  const referralTimelockHandlers: string[] = (candidatesJson.referralTimelockHandlers || []).filter((a: string) =>
    ethers.utils.isAddress(a)
  );
  const batchSender = candidates.find((c) => c.name === "EsGmxBatchSender" && ethers.utils.isAddress(c.address));
  if (batchSender) {
    let calls = 0;
    await forEachExplorerTx(batchSender.address, 0, latest, "EsGmxBatchSender", (tx) => {
      if (!tx.input?.startsWith(SEND)) {
        return;
      }
      const [vester, , accounts] = ethers.utils.defaultAbiCoder.decode(
        ["address", "uint256", "address[]", "uint256[]"],
        "0x" + tx.input.slice(10)
      );
      const name = vesterNames[vester.toLowerCase()];
      if (!name) {
        return;
      }
      calls++;
      accounts.forEach((a: string) => credited[name].add(ethers.utils.getAddress(a)));
    });
    provenance.push({
      writer: "EsGmxBatchSender.send",
      address: batchSender.address,
      calls,
      term: "transferredCumulativeRewards",
    });
    console.log(`EsGmxBatchSender: ${calls} send calls to the legacy vesters`);
  } else {
    console.log("EsGmxBatchSender unfilled in legacy-writer-candidates.json; transferred-cap credits not recovered");
  }

  const [referralGov, mainGov, distributor] = await multiReadStrict(provider, [
    [referralVester, "gov() view returns (address)", []],
    [legacy.esGmx, "gov() view returns (address)", []],
    [legacy.stakedGmxTracker, "distributor() view returns (address)", []],
  ]);
  const [distributorGov] = await multiReadStrict(provider, [[distributor, "gov() view returns (address)", []]]);
  const liveGovs: { [what: string]: string } = {
    referralVester: referralGov,
    "esGMX and main vesters": mainGov,
    distributors: distributorGov,
  };
  const nameOf = new Map(listedTimelocks.map((t) => [t.address.toLowerCase(), t.name]));
  for (const gov of Object.values(liveGovs)) {
    if (!nameOf.has(gov.toLowerCase())) {
      console.log(
        `live gov ${gov} is missing from the timelocks list in legacy-writer-candidates.json; scanned anyway, add it`
      );
    }
  }
  const timelocks = [
    ...new Set([...listedTimelocks.map((t) => ethers.utils.getAddress(t.address)), ...Object.values(liveGovs)]),
  ];
  const scanned: {
    timelock: string;
    label: string;
    calls: { [fn: string]: number };
    bonusCalls: number;
    multicalls: number;
    undecodable: number;
    privileged: Set<string>;
  }[] = [];
  for (const timelock of timelocks) {
    const label = `Timelock ${nameOf.get(timelock.toLowerCase()) || timelock}`;
    if ((await provider.getCode(timelock)) === "0x") {
      console.log(`${label}: no code at ${timelock}, skipped`);
      continue;
    }
    const calls: { [fn: string]: number } = {};
    let multicalls = 0;
    let undecodable = 0;
    const privileged = new Set<string>();
    await forEachExplorerTx(timelock, 0, latest, label, (tx) => {
      const input: string = tx.input || "";
      if (input.startsWith(MULTICALL)) {
        multicalls++;
      }
      try {
        forEachTimelockCall(input, (selector, data) => {
          const fn = BONUS_FUNCTIONS[selector];
          if (fn) {
            const [vester, accounts] = ethers.utils.defaultAbiCoder.decode(["address", "address[]", "uint256[]"], data);
            const name = vesterNames[vester.toLowerCase()];
            privileged.add(ethers.utils.getAddress(tx.from));
            if (name) {
              calls[fn] = (calls[fn] || 0) + 1;
              accounts.forEach((a: string) => credited[name].add(ethers.utils.getAddress(a)));
            }
          } else if (selector === SET_HANDLER || selector === SET_KEEPER) {
            privileged.add(ethers.utils.getAddress(ethers.utils.defaultAbiCoder.decode(["address", "bool"], data)[0]));
          }
        });
      } catch {
        undecodable++;
      }
    });
    for (const [fn, count] of Object.entries(calls)) {
      provenance.push({ writer: `Timelock.${fn}`, address: timelock, calls: count, term: "bonusRewards" });
    }
    const bonusCalls = Object.values(calls).reduce((sum, count) => sum + count, 0);
    scanned.push({ timelock, label, calls, bonusCalls, multicalls, undecodable, privileged });
  }

  // live flags are checked against every privileged address seen on any Timelock plus the recorded
  // referral handlers: grants made through a multisig are internal calls the explorer list omits
  const privilegedUnion = [...new Set([...scanned.flatMap((s) => [...s.privileged]), ...referralTimelockHandlers])];
  const timelockReport: any[] = [];
  for (const { timelock, label, calls, bonusCalls, multicalls, undecodable, privileged } of scanned) {
    const [admin] = await multiRead(provider, [[timelock, "admin() view returns (address)", []]]);
    const handlers = await multiRead(
      provider,
      privilegedUnion.map(
        (a) => [timelock, "isHandler(address) view returns (bool)", [a]] as [string, string, unknown[]]
      )
    );
    const keepers = await multiRead(
      provider,
      privilegedUnion.map(
        (a) => [timelock, "isKeeper(address) view returns (bool)", [a]] as [string, string, unknown[]]
      )
    );
    // an older Timelock without these getters reads as undefined rather than false
    const flagsReadable = handlers.some((h) => h !== undefined) || keepers.some((k) => k !== undefined);
    const liveHandlers = privilegedUnion.filter((_, i) => handlers[i] === true);
    const liveKeepers = privilegedUnion.filter((_, i) => keepers[i] === true);
    const governs = Object.entries(liveGovs)
      .filter(([, gov]) => gov === timelock)
      .map(([what]) => what);
    timelockReport.push({
      name: nameOf.get(timelock.toLowerCase()) || null,
      timelock,
      governs,
      admin: admin ?? null,
      bonusCalls,
      calls,
      multicalls,
      undecodable,
      privilegedSeen: [...privileged],
      flagsReadable,
      liveHandlers,
      liveKeepers,
    });
    const flags = flagsReadable
      ? `${liveHandlers.length} live handlers, ${liveKeepers.length} live keepers`
      : "handler and keeper getters unavailable";
    console.log(
      `${label} (${governs.join(", ") || "governs nothing in scope now"}): admin ${
        admin ?? "n/a"
      }, ${bonusCalls} bonus calls ${JSON.stringify(calls)}, ${multicalls} multicalls, ${flags}`
    );
  }

  const union = new Set<string>();
  Object.values(credited).forEach((set) => set.forEach((a) => union.add(a)));
  const outFile = writeOutFile("bonus-rewards-accounts.json", {
    generatedAt: new Date().toISOString(),
    toBlock: latest,
    provenance,
    timelocks: timelockReport,
    perVester: Object.fromEntries(Object.entries(credited).map(([name, set]) => [name, [...set]])),
    accounts: [...union],
  });
  console.log(
    `credited accounts: gmx ${credited.gmxVester.size}, glp ${credited.glpVester.size}, referral ${credited.referralVester.size}, union ${union.size}`
  );
  console.log(`written to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
