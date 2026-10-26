import { ethers } from "ethers";

import { REWARD_ROUTER_V2, getProvider, getRouterAddresses, assertArbitrum, getExecutionSigner } from "./lib";
import { readOutFile } from "./migrationLib";

// Executes the two pre-cutover sweeps on the live RewardRouterV2 from the enumeration
// artifact: batchRestakeForAccounts over the old-layout sets, batchCompoundForAccounts
// over staked multiplier points. Gov-gated on V2; dry run without SWEEP_EXECUTE=1. Safe
// to re-run; enumerateSweepAccounts verifies convergence after.
// env: INCENTIVE_RPC, SWEEP_EXECUTE, SWEEP_PK (or FORK_SIGNER on a fork), BATCH_SIZE (default 30)

const V2_ABI = [
  "function gov() view returns (address)",
  "function batchRestakeForAccounts(address[] accounts)",
  "function batchCompoundForAccounts(address[] accounts)",
];

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const sweeps = readOutFile<any>("sweep-accounts.json");
  if (!sweeps) {
    throw new Error("no sweep-accounts.json; run enumerateSweepAccounts first");
  }
  if (sweeps.scan?.fromBlock !== 0) {
    const message = `enumeration is a partial scan from block ${sweeps.scan?.fromBlock}; re-run enumerateSweepAccounts with FROM_BLOCK=0`;
    if (process.env.SWEEP_EXECUTE === "1") {
      throw new Error(message);
    }
    console.log(`warning: ${message}`);
  }

  const legacy = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  if (!legacy.inRestakingMode) {
    throw new Error("live V2 inRestakingMode is off; the restake sweep cannot convert old-layout accounts");
  }
  if (legacy.maxBoostBasisPoints !== "0") {
    throw new Error(
      `live V2 maxBoostBasisPoints is ${legacy.maxBoostBasisPoints}; the compound sweep only strips at zero boost`
    );
  }

  const restakeAccounts = [
    ...new Set([...sweeps.bonusInFee.accounts, ...sweeps.bnInFee.accounts].map((e: any) => e.account)),
  ];
  const compoundAccounts = sweeps.bnInExtended.accounts.map((e: any) => e.account);
  const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 30;

  console.log(`restake sweep: ${restakeAccounts.length} accounts; compound sweep: ${compoundAccounts.length} accounts`);
  console.log(`enumeration from ${sweeps.generatedAt} (re-run enumerateSweepAccounts if stale)`);

  const execute = process.env.SWEEP_EXECUTE === "1";
  if (!execute) {
    for (let i = 0; i < restakeAccounts.length; i += batchSize) {
      console.log(`batchRestakeForAccounts(${JSON.stringify(restakeAccounts.slice(i, i + batchSize))})`);
    }
    for (let i = 0; i < compoundAccounts.length; i += batchSize) {
      console.log(`batchCompoundForAccounts(${JSON.stringify(compoundAccounts.slice(i, i + batchSize))})`);
    }
    console.log("dry run only; set SWEEP_EXECUTE=1 and SWEEP_PK to send");
    return;
  }

  const signer = await getExecutionSigner(provider, "SWEEP_PK");
  const signerAddress = await signer.getAddress();
  const router = new ethers.Contract(legacy.router, V2_ABI, signer);
  const gov = await router.gov();
  if (gov.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`signer ${signerAddress} is not V2 gov ${gov}`);
  }

  // one account can revert a whole batch (a compound may need the account's own GMX allowance)
  const sendBatches = async (label: string, method: string, accounts: string[]) => {
    const blocked: string[] = [];
    for (let i = 0; i < accounts.length; i += batchSize) {
      let batch = accounts.slice(i, i + batchSize);
      try {
        await router.callStatic[method](batch);
      } catch {
        const bad: string[] = [];
        for (const account of batch) {
          try {
            await router.callStatic[method]([account]);
          } catch {
            bad.push(account);
          }
        }
        blocked.push(...bad);
        batch = batch.filter((a) => !bad.includes(a));
        if (batch.length === 0) {
          continue;
        }
      }
      const tx = await router[method](batch);
      console.log(`${label} batch ${Math.floor(i / batchSize) + 1}: ${tx.hash}`);
      await tx.wait();
    }
    if (blocked.length) {
      console.log(
        `${label}: ${blocked.length} accounts revert and were skipped (manual intervention): ${blocked.join(", ")}`
      );
    }
    return blocked.length;
  };

  const blockedCount =
    (await sendBatches("restake", "batchRestakeForAccounts", restakeAccounts)) +
    (await sendBatches("compound", "batchCompoundForAccounts", compoundAccounts));
  console.log("sweeps sent; re-run enumerateSweepAccounts to verify convergence");
  if (blockedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
