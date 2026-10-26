import { ethers } from "ethers";

import { getProvider, assertArbitrum, getExecutionSigner } from "./lib";
import { getDeployment, readOutFile, writeOutFile, makeAction, multiRead, GovAction } from "./migrationLib";

// Loads the Orphan's provisionCaps from the snapshot in batches (step 7).
// Dry run emits the INCENTIVE_ADMIN calldata bundle; with PROVISION_EXECUTE=1 and
// PROVISION_PK it sends and verifies a sample. Refuses once provisioningComplete is set.
// env: INCENTIVE_RPC, NETWORK_NAME, BATCH_SIZE (default 150), PROVISION_EXECUTE, PROVISION_PK (or FORK_SIGNER on a fork)

const ORPHAN_ABI = [
  "function provisioningComplete() view returns (bool)",
  "function setProvisionCaps(address[] accounts, uint256[] caps)",
  "function provisionCaps(address) view returns (uint256)",
];

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const networkName = process.env.NETWORK_NAME || "arbitrum";
  const orphanAddress = getDeployment(networkName, "OrphanRatioVester")?.address;
  if (!orphanAddress) {
    throw new Error("missing OrphanRatioVester deployment; run the deploy scripts first");
  }
  const snapshot = readOutFile<any>("orphan-snapshot.json");
  if (!snapshot) {
    throw new Error("no orphan-snapshot.json; run takeSnapshot first");
  }
  if (snapshot.scan?.pinned !== true || snapshot.scan?.fromBlock !== 0) {
    throw new Error(
      "snapshot is unpinned or from a partial scan; re-run takeSnapshot with SNAPSHOT_BLOCK set and FROM_BLOCK=0"
    );
  }

  const orphan = new ethers.Contract(orphanAddress, ORPHAN_ABI, provider);
  if (await orphan.provisioningComplete()) {
    throw new Error("provisioningComplete is already set; caps can no longer be loaded");
  }

  const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 150;
  const entries = snapshot.accounts.filter((e: any) => e.amount !== "0");
  const batches: { accounts: string[]; caps: string[] }[] = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    batches.push({ accounts: slice.map((e: any) => e.account), caps: slice.map((e: any) => e.amount) });
  }
  console.log(
    `${entries.length} caps in ${batches.length} batches from snapshot block ${snapshot.block}, total ${snapshot.total}`
  );

  if (process.env.PROVISION_EXECUTE !== "1") {
    const actions: GovAction[] = batches.map((b, i) =>
      makeAction(
        `setProvisionCaps batch ${i + 1}/${batches.length} (${b.accounts.length} accounts)`,
        "INCENTIVE_ADMIN",
        orphanAddress,
        "setProvisionCaps(address[],uint256[])",
        [b.accounts, b.caps]
      )
    );
    const outFile = writeOutFile("provision-caps-actions.json", {
      generatedAt: new Date().toISOString(),
      snapshotBlock: snapshot.block,
      total: snapshot.total,
      actions,
    });
    console.log(`dry run: calldata bundle written to ${outFile}`);
    return;
  }

  const signer = await getExecutionSigner(provider, "PROVISION_PK");
  const signerAddress = await signer.getAddress();
  const roleStore = getDeployment(networkName, "RoleStore")?.address;
  if (roleStore) {
    const roleHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["INCENTIVE_ADMIN"]));
    const [hasRole] = await multiRead(provider, [
      [roleStore, "hasRole(address,bytes32) view returns (bool)", [signerAddress, roleHash]],
    ]);
    if (hasRole !== true) {
      throw new Error(
        `signer ${signerAddress} does not hold INCENTIVE_ADMIN; use the dry-run calldata bundle for the multisig instead`
      );
    }
  }
  const writable = orphan.connect(signer);
  for (let i = 0; i < batches.length; i++) {
    const tx = await writable.setProvisionCaps(batches[i].accounts, batches[i].caps);
    console.log(`batch ${i + 1}/${batches.length}: ${tx.hash}`);
    await tx.wait();
  }

  const stride = Math.max(1, Math.floor(entries.length / 50));
  const sample = entries.filter((_: any, i: number) => i % stride === 0).slice(0, 50);
  const loaded = await multiRead(
    provider,
    sample.map(
      (e: any) =>
        [orphanAddress, "provisionCaps(address) view returns (uint256)", [e.account]] as [string, string, unknown[]]
    )
  );
  const mismatches = sample.filter((e: any, i: number) => loaded[i]?.toString() !== e.amount).length;
  console.log(`verified stride sample of ${sample.length}: ${mismatches} mismatches`);
  if (mismatches > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
