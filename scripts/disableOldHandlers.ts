import * as hre from "hardhat";
import { hashString } from "../utils/hash";

/**
 * Script to disable old handler contracts by revoking their CONTROLLER role
 * This is needed after redeploying handlers to ensure old contracts cannot be used
 *
 * Old handlers are from the 'updates' branch (https://github.com/gmx-io/gmx-synthetics/tree/updates/deployments/arbitrumSepolia)
 * Current handlers are dynamically loaded from deployments folder
 *
 * npx hardhat run --network arbitrumSepolia scripts/disableOldHandlers.ts
 */

const OLD_HANDLERS = {
  OrderHandler: "0x96332063e9dAACF93A7379CCa13BC2C8Ff5809cb",
  DepositHandler: "0xEe3E687Dc0575E85544ae224AbD4e56938674Bc6",
  WithdrawalHandler: "0x947B1b234DaaCc08fc2160323DEa111eb3c12fF5",
  ShiftHandler: "0xCEc48d761e274805D02FC020294E3682481B4906",
  GlvDepositHandler: "0x687b5dCd2F4fae7D4D12f7b59B8925852176EA1e",
  GlvWithdrawalHandler: "0x78350F7fCB339019daF89fa4c9A35F612FCd90B4",
  GlvShiftHandler: "0xB70454D3D50803f569A8d9C6d17fc3554d12Cc0C",
};

// This prevents accidentally disabling handlers that are still active (not redeployed)
async function checkOldHandlersAreRedeployed(oldHandlers: Record<string, string>): Promise<void> {
  const currentHandlers: Record<string, string> = {};
  console.log("Loading current handler deployments...");
  for (const handlerName of Object.keys(oldHandlers)) {
    try {
      const deployment = await hre.deployments.get(handlerName);
      currentHandlers[handlerName] = deployment.address;
      console.log(`  ${handlerName}: ${deployment.address}`);
    } catch (error) {
      console.log(`  ${handlerName}: Not deployed`);
      currentHandlers[handlerName] = "";
    }
  }
  // Validate that all handlers have been redeployed
  for (const [handlerName, oldAddress] of Object.entries(oldHandlers)) {
    if (!oldAddress || oldAddress === "") {
      throw new Error(`Invalid old address for ${handlerName}: ${oldAddress}`);
    }
    if (oldAddress.toLowerCase() === currentHandlers[handlerName]?.toLowerCase()) {
      throw new Error(
        `${handlerName} has not been redeployed! Old: ${oldAddress}, Current: ${currentHandlers[handlerName]}`
      );
    }
  }
}

async function main() {
  const network = hre.network.name;
  if (network !== "arbitrumSepolia") {
    throw new Error(`This script is using handler arbitrumSepolia addresses. Current network: ${network}`);
  }

  // Safety check: Load current handler addresses and validate they differ from old ones
  await checkOldHandlersAreRedeployed(OLD_HANDLERS);

  // Get RoleStore deployment
  const roleStoreDeployment = await hre.deployments.get("RoleStore");
  const roleStore = await hre.ethers.getContractAt("RoleStore", roleStoreDeployment.address);
  const [signer] = await hre.ethers.getSigners();

  // Check if signer has ROLE_ADMIN
  const ROLE_ADMIN = hashString("ROLE_ADMIN");
  const hasRoleAdmin = await roleStore.hasRole(signer.address, ROLE_ADMIN);

  if (!hasRoleAdmin) {
    throw new Error(`Account ${signer.address} is not allowed to manage deployments (missing ROLE_ADMIN)`);
  }

  const CONTROLLER = hashString("CONTROLLER");
  console.log("\nRevoking CONTROLLER role from old handlers...");

  for (const [handlerName, oldAddress] of Object.entries(OLD_HANDLERS)) {
    // Check if the old handler still has CONTROLLER role
    const hasRole = await roleStore.hasRole(oldAddress, CONTROLLER);
    if (hasRole) {
      console.log(`  Revoking CONTROLLER role for ${handlerName} (${oldAddress})...`);
      const tx = await roleStore.revokeRole(oldAddress, CONTROLLER);
      await tx.wait();
      console.log(`  CONTROLLER role revoked (tx: ${tx.hash})`);
    } else {
      console.log(`  ${handlerName} already disabled (no CONTROLLER role)`);
    }
  }

  console.log("\nVerifying old handlers are disabled...");
  for (const [handlerName, oldAddress] of Object.entries(OLD_HANDLERS)) {
    const hasRole = await roleStore.hasRole(oldAddress, CONTROLLER);
    if (hasRole) {
      console.log(`❌ ${handlerName} at ${oldAddress} still has CONTROLLER role`);
    } else {
      console.log(`✅ ${handlerName} at ${oldAddress} is disabled`);
    }
  }
}

main()
  .then(() => {
    console.log("\nScript completed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });
