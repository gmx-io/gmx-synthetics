/*
Sets ReferralStorage tier slots 6 and 7 only. Tiers 0–5 are snapshotted and must
read back identical after the on-chain txs land (this script never calls setTier for 0–5).

Desired:
  tier 6: totalRebate = 2500 (25%), discountShare = 0
  tier 7: totalRebate = 5000 (50%), discountShare = 0

Networks: arbitrum, avalanche, megaEth (ReferralStorage from config/overwrite.ts).

Mainnet flow:
- gov is ReferralStorageTimelock; setTier(referralStorage, tierId, totalRebate, discountShare)
  is onlyKeeperAndAbove (admin / Protocol Multisig can call it).
- writes out/safe-batch-updateReferralStorageTiers-setTier-<network>-<stamp>.json
  for Safe Tx Builder (no broadcast).

Testnet flow:
- sends setTier txs directly after a confirm prompt.

Usage:
  npx hardhat run --network arbitrum scripts/updateReferralStorageTiers.ts
  npx hardhat run --network avalanche scripts/updateReferralStorageTiers.ts
  npx hardhat run --network megaEth scripts/updateReferralStorageTiers.ts

  # testnet
  npx hardhat run --network arbitrumSepolia scripts/updateReferralStorageTiers.ts
*/

import hre from "hardhat";
import prompts from "prompts";

import { isExistingMainnetDeployment } from "../config/chains";
import { getExistingContractAddresses } from "../config/overwrite";
import { inputsOf, writeSafeBatchJson } from "../utils/safeTx";

const ALLOWED_NETWORKS = new Set(["arbitrum", "avalanche", "megaEth", "arbitrumSepolia", "avalancheFuji"]);

const DESIRED_TIERS: { tierId: number; totalRebate: number; discountShare: number }[] = [
  { tierId: 6, totalRebate: 2500, discountShare: 0 },
  { tierId: 7, totalRebate: 5000, discountShare: 0 },
];

const PROTECTED_TIER_IDS = [0, 1, 2, 3, 4, 5];

type TierValues = { totalRebate: string; discountShare: string };

async function withRetries<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.log(`  retry ${i}/${attempts} ${label}: ${(e as Error).message?.slice(0, 80) ?? e}`);
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw lastError;
}

async function readTier(referralStorage: any, tierId: number): Promise<TierValues> {
  return withRetries(`tiers(${tierId})`, async () => {
    const [totalRebate, discountShare] = await referralStorage.tiers(tierId);
    return {
      totalRebate: totalRebate.toString(),
      discountShare: discountShare.toString(),
    };
  });
}

async function snapshotTiers(referralStorage: any, tierIds: number[]): Promise<Record<number, TierValues>> {
  const out: Record<number, TierValues> = {};
  for (const tierId of tierIds) {
    out[tierId] = await readTier(referralStorage, tierId);
  }
  return out;
}

function formatTier(t: TierValues): string {
  return `totalRebate=${t.totalRebate} discountShare=${t.discountShare}`;
}

export async function main() {
  if (!ALLOWED_NETWORKS.has(hre.network.name)) {
    throw new Error(`Unsupported network ${hre.network.name}. Allowed: ${[...ALLOWED_NETWORKS].join(", ")}`);
  }

  const isMainnet = isExistingMainnetDeployment(hre);

  const referralStorage = isMainnet
    ? await hre.ethers.getContractAt(
        "ReferralStorage",
        getExistingContractAddresses(hre.network).ReferralStorage.address
      )
    : await hre.ethers.getContract("ReferralStorage");

  const govAddress = await referralStorage.gov();
  // Named-param ABI so Safe Tx Builder pairs inputs/values correctly.
  const gov = await hre.ethers.getContractAt(
    [
      "function setTier(address _referralStorage, uint256 _tierId, uint256 _totalRebate, uint256 _discountShare) external",
      "function admin() external view returns (address)",
    ],
    govAddress
  );

  console.log(`\n=== ReferralStorage tiers on ${hre.network.name} ===`);
  console.log(`ReferralStorage: ${referralStorage.address}`);
  console.log(`Timelock (gov):  ${govAddress}`);

  const protectedBefore = await snapshotTiers(referralStorage, PROTECTED_TIER_IDS);
  console.log("\nProtected tiers 0–5 (must remain unchanged):");
  for (const tierId of PROTECTED_TIER_IDS) {
    console.log(`  tier ${tierId}: ${formatTier(protectedBefore[tierId])}`);
  }

  console.log("\nTarget tiers 6–7:");
  const changes: typeof DESIRED_TIERS = [];
  for (const desired of DESIRED_TIERS) {
    const current = await readTier(referralStorage, desired.tierId);
    const already =
      current.totalRebate === String(desired.totalRebate) && current.discountShare === String(desired.discountShare);
    console.log(
      `  tier ${desired.tierId}: current ${formatTier(current)} --> desired totalRebate=${
        desired.totalRebate
      } discountShare=${desired.discountShare}` + (already ? " (already set, skip)" : "")
    );
    if (!already) {
      changes.push(desired);
    }
  }

  if (changes.length === 0) {
    console.log("\nTiers 6–7 already match desired values. No txs.");
    return;
  }

  if (isMainnet) {
    const safeBatchTransactions = changes.map(({ tierId, totalRebate, discountShare }) => ({
      to: govAddress,
      value: "0",
      data: null,
      contractMethod: {
        name: "setTier",
        payable: false,
        inputs: inputsOf(gov, "setTier"),
      },
      contractInputsValues: {
        _referralStorage: referralStorage.address,
        _tierId: String(tierId),
        _totalRebate: String(totalRebate),
        _discountShare: String(discountShare),
      },
    }));

    console.log(`\n--> Mainnet flow: Safe batch JSON for the Protocol Multisig (${changes.length} setTier)`);
    writeSafeBatchJson({
      scriptName: "updateReferralStorageTiers",
      label: "setTier",
      transactions: safeBatchTransactions,
      createdFromSafeAddress: await gov.admin(),
      description: `Set ReferralStorage tiers 6–7 only on ${hre.network.name}. Tiers 0–5 must stay unchanged.`,
    });

    console.log("\nAfter the Safe batch executes, re-run this script to confirm:");
    console.log("  - tiers 6–7 match desired values (script will report already set)");
    console.log("  - tiers 0–5 still match the snapshot printed above");
  } else {
    const { write } = await prompts({
      type: "confirm",
      name: "write",
      message: `Send ${changes.length} setTier tx(s) to ${hre.network.name}?`,
    });
    if (!write) {
      console.log("Aborted.");
      return;
    }

    console.log(`\n--> Testnet flow: direct setTier calls from admin EOA`);
    for (const { tierId, totalRebate, discountShare } of changes) {
      const tx = await gov.setTier(referralStorage.address, tierId, totalRebate, discountShare);
      console.log(`  setTier(${tierId}, ${totalRebate}, ${discountShare}) --> ${tx.hash}`);
      await tx.wait();
    }

    const protectedAfter = await snapshotTiers(referralStorage, PROTECTED_TIER_IDS);
    for (const tierId of PROTECTED_TIER_IDS) {
      const before = protectedBefore[tierId];
      const after = protectedAfter[tierId];
      if (before.totalRebate !== after.totalRebate || before.discountShare !== after.discountShare) {
        throw new Error(`Protected tier ${tierId} changed: before ${formatTier(before)} after ${formatTier(after)}`);
      }
    }
    console.log("\nVerified: tiers 0–5 unchanged after setTier.");

    for (const desired of DESIRED_TIERS) {
      const after = await readTier(referralStorage, desired.tierId);
      if (after.totalRebate !== String(desired.totalRebate) || after.discountShare !== String(desired.discountShare)) {
        throw new Error(
          `Tier ${desired.tierId} mismatch after write: got ${formatTier(after)}, expected totalRebate=${
            desired.totalRebate
          } discountShare=${desired.discountShare}`
        );
      }
    }
    console.log("Verified: tiers 6–7 match desired values.");
  }

  console.log(`\nDone. ${changes.length} change(s).`);
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
