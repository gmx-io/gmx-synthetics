import { ethers } from "ethers";

import {
  REWARD_ROUTER_V2,
  getProvider,
  getRouterAddresses,
  getReferralVester,
  assertArbitrum,
  getExecutionSigner,
} from "./lib";
import { getDeployment, readOutFile, multiRead } from "./migrationLib";

// Zeroes the legacy vesting caps (step 9), looping to convergence: each
// pass re-checks that the deduction is at the maximum and re-batches the rest. The signer must
// hold INCENTIVE_DISTRIBUTOR. Dry run by default.
// env: INCENTIVE_RPC, NETWORK_NAME, BATCH_SIZE (default 250, about 72k gas per account), MAX_PASSES (default 3), ZERO_EXECUTE, ZERO_PK (or FORK_SIGNER on a fork)

const ZEROER_ABI = ["function zeroCaps(address[] accounts)"];

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const networkName = process.env.NETWORK_NAME || "arbitrum";
  const legacy = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  const capAccounts = readOutFile<any>("legacy-cap-accounts.json");
  if (!capAccounts) {
    throw new Error("no legacy-cap-accounts.json; run enumerateLegacyCapAccounts first");
  }
  if (capAccounts.scan?.fromBlock !== 0) {
    const message = `enumeration is a partial scan from block ${capAccounts.scan?.fromBlock}; re-run enumerateLegacyCapAccounts with FROM_BLOCK=0`;
    if (process.env.ZERO_EXECUTE === "1") {
      throw new Error(message);
    }
    console.log(`warning: ${message}`);
  }

  const referralVester = await getReferralVester(provider, legacy.esGmx);
  const targets: { name: string; vester: string; zeroer: string; accounts: string[] }[] = [];
  for (const [name, vester, deploymentName] of [
    ["gmxVester", legacy.gmxVester, "GmxVesterCapZeroer"],
    ["glpVester", legacy.glpVester, "GlpVesterCapZeroer"],
    ["referralVester", referralVester, "ReferralVesterCapZeroer"],
  ] as [string, string, string][]) {
    const zeroer = getDeployment(networkName, deploymentName)?.address;
    if (!zeroer) {
      throw new Error(`missing ${deploymentName} deployment`);
    }
    if (!capAccounts[name]) {
      throw new Error(`legacy-cap-accounts.json has no ${name} section; re-run enumerateLegacyCapAccounts`);
    }
    targets.push({ name, vester, zeroer, accounts: capAccounts[name].accounts.map((e: any) => e.account) });
  }

  for (const t of targets) {
    const [granted] = await multiRead(provider, [[t.vester, "isHandler(address) view returns (bool)", [t.zeroer]]]);
    if (granted !== true) {
      throw new Error(`${t.name} has not granted handler to its zeroer (step 9 grants pending)`);
    }
  }

  const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 250;
  const maxPasses = process.env.MAX_PASSES ? parseInt(process.env.MAX_PASSES) : 3;
  const execute = process.env.ZERO_EXECUTE === "1";

  // an account transfer through a router that still holds handler status on a legacy vester overwrites
  // the sender's deduction and hands the receiver an open cap, which undoes the zeroing
  const routerFlags = await multiRead(
    provider,
    targets.map(
      (t) => [t.vester, "isHandler(address) view returns (bool)", [legacy.router]] as [string, string, unknown[]]
    )
  );
  const routerLiveOn = targets.filter((_, i) => routerFlags[i] !== false).map((t) => t.name);
  if (routerLiveOn.length > 0) {
    const message = `RewardRouterV2 still holds handler status on ${routerLiveOn.join(", ")}; revoke it before zeroing`;
    if (execute) {
      throw new Error(message);
    }
    console.log(`warning: ${message}`);
  }

  if (!execute) {
    for (const t of targets) {
      console.log(
        `${t.name}: ${t.accounts.length} accounts, ${Math.ceil(t.accounts.length / batchSize)} zeroCaps batches on ${
          t.zeroer
        }`
      );
    }
    console.log("dry run only; set ZERO_EXECUTE=1 and ZERO_PK to send");
    return;
  }
  const signer = await getExecutionSigner(provider, "ZERO_PK");

  for (const t of targets) {
    let open = t.accounts;
    for (let pass = 1; pass <= maxPasses && open.length > 0; pass++) {
      console.log(`${t.name} pass ${pass}: ${open.length} accounts`);
      const zeroer = new ethers.Contract(t.zeroer, ZEROER_ABI, signer);
      for (let i = 0; i < open.length; i += batchSize) {
        const tx = await zeroer.zeroCaps(open.slice(i, i + batchSize));
        console.log(`  batch ${i / batchSize + 1}: ${tx.hash}`);
        await tx.wait();
      }
      const deductions = await multiRead(
        provider,
        open.map(
          (account) =>
            [t.vester, "cumulativeRewardDeductions(address) view returns (uint256)", [account]] as [
              string,
              string,
              unknown[]
            ]
        )
      );
      // a failed read counts as still open, never as converged
      open = open.filter((_, i) => !deductions[i] || !deductions[i].eq(ethers.constants.MaxUint256));
    }
    if (open.length > 0) {
      console.log(
        `${t.name}: ${open.length} accounts still open after ${maxPasses} passes (a cap writer may be live; check the inventory)`
      );
      process.exitCode = 1;
    } else {
      console.log(`${t.name}: converged`);
    }
  }
  console.log("re-run enumerateLegacyCapAccounts for the full convergence check and stand up the detection net");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
