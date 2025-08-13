import prompts from "prompts";
import hre from "hardhat";
import { hashString } from "../../utils/hash";

const distributionId = process.env.DISTRIBUTION_ID;
let write = process.env.WRITE === "true";
const terms = process.env.TERMS;
const CLAIM_ADMIN = hashString("CLAIM_ADMIN");

async function main() {
  if (!terms) {
    throw new Error("TERMS is not set");
  }
  if (!distributionId) {
    throw new Error("DISTRIBUTION_ID is not set");
  }

  const claimHandler = await hre.ethers.getContract("ClaimHandler");

  const params = [distributionId, terms];

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transaction?",
    }));
  }

  if (write) {
    const [account] = await hre.ethers.getSigners();
    console.log("account", account.address);

    const tx = await claimHandler.setTerms(...params);
    console.log("tx", tx.hash);
    await tx.wait();
  } else {
    const roleStore = await hre.ethers.getContract("RoleStore");
    const claimAdmin = (await roleStore.getRoleMembers(CLAIM_ADMIN, 0, 1))[0];
    const result = await claimHandler.connect(claimAdmin).callStatic.setTerms(...params);
    console.log("result", result);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
