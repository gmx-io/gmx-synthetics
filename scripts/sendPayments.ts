import hre from "hardhat";
import { hashString } from "../utils/hash";

async function main() {
  console.log("Running script to call ContributorHandler.sendPayments()");

  try {
    const [signer] = await hre.ethers.getSigners();
    if (!signer) {
      throw new Error("No signer found");
    }
    const signerAddress = await signer.getAddress();
    const contributorHandler = await hre.ethers.getContract("ContributorHandler", signer);
    const roleStore = await hre.ethers.getContract("RoleStore");

    const CONTRIBUTOR_DISTRIBUTOR = "CONTRIBUTOR_DISTRIBUTOR";
    const hasRole = await roleStore.hasRole(signerAddress, hashString(CONTRIBUTOR_DISTRIBUTOR));
    if (!hasRole) {
      throw new Error(
        `Address: ${signerAddress} must be granted the ${CONTRIBUTOR_DISTRIBUTOR} role to execute ContributorHandler.sendPayments()`
      );
    }

    console.log("Executing sendPayments transaction...");

    const tx = await contributorHandler.sendPayments();

    console.log(`Transaction hash: ${tx.hash}`);
    console.log("Waiting for transaction confirmation...");

    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log("sendPayments completed successfully!");
  } catch (error) {
    console.log("Error during sendPayments:", error);
    process.exit(1);
  }
}

main().catch(console.error);
