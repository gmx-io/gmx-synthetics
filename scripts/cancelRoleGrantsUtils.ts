import fs from "fs";
import path from "path";
import hre from "hardhat";
import { constants, Contract, providers, utils } from "ethers";
import { PROTOCOL_MULTISIG } from "../utils/constants";
import { createSafeBatchOutputDir, getSafeTxBatchSize, writeSafeBatchJson } from "../utils/safeTx";
import {
  buildRoleGrantCancellationBatches,
  inspectRoleGrantCleanup,
  RoleGrantCleanupParams,
} from "../utils/roleGrantCleanup";

// Cleanup for updateRoles.ts. Intentionally has no signer, prompt, simulation, or submission path.
export async function runRoleGrantCleanup(provider: providers.Provider = hre.ethers.provider) {
  const batchSize = getSafeTxBatchSize();
  const { chainId } = await provider.getNetwork();
  const timelockConfig = process.env.TIMELOCK_CONFIG || (await hre.deployments.get("TimelockConfig")).address;
  if (!utils.isAddress(timelockConfig) || timelockConfig === constants.AddressZero) {
    throw new Error("Invalid TimelockConfig address");
  }
  // The wrapper may have already lost ROLE_ADMIN. Cancellation only needs its controller's CANCELLER_ROLE.
  const timelock = new Contract(
    timelockConfig,
    ["function timelockController() view returns (address)", "function roleStore() view returns (address)"],
    provider
  );
  const snapshot = await provider.getBlock("latest");
  const timelockController: string = await timelock.timelockController({ blockTag: snapshot.number });
  const roleStore: string = await timelock.roleStore({ blockTag: snapshot.number });
  const controllerDeployment = await hre.deployments.getOrNull("ConfigTimelockController");
  const controllerDeploymentTxHash =
    controllerDeployment?.address.toLowerCase() === timelockController.toLowerCase()
      ? controllerDeployment.transactionHash || controllerDeployment.receipt?.transactionHash
      : undefined;
  const params: RoleGrantCleanupParams = {
    chainId,
    timelockConfig,
    timelockController,
    roleStore,
    controllerDeploymentTxHash,
  };
  const report = await inspectRoleGrantCleanup(provider, params, PROTOCOL_MULTISIG, snapshot);
  const outputDir = createSafeBatchOutputDir({ scriptName: "updateRoles", label: "cancelGrantRole" });
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Per-ID report: ${outputDir}/report.json (block ${report.blockNumber})`);
  console.log(`Pending revoke counterparts: ${report.pendingRevokes.length} (informational; no revoke cancellations)`);
  for (const warning of report.warnings) console.warn(warning);
  if (report.errors.length) throw new Error(report.errors.join("\n"));
  const batches = buildRoleGrantCancellationBatches(report, batchSize);
  batches.forEach((transactions, index) => {
    writeSafeBatchJson({
      scriptName: "updateRoles",
      label: `cancelGrantRole-${index + 1}of${batches.length}`,
      outputDir,
      chainId: params.chainId,
      name: `Cancel paired role grants ${index + 1}/${batches.length}`,
      description: `Snapshot block ${report.blockNumber} (${report.blockHash}); review report.json and recheck before execution`,
      createdFromSafeAddress: report.safeAddress,
      transactions,
    });
  });
  console.log(
    report.complete
      ? "No outstanding paired grants; no cancellation batch needed"
      : `Cleanup incomplete: generated ${batches.length} Safe batches in ${outputDir}; execute them and rerun`
  );
  console.log(
    "Read-only: no transactions submitted. WRITE and SKIP_VALIDATION do not enable execution during cleanup."
  );
}
