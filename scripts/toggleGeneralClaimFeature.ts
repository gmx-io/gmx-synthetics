import hre from "hardhat";
import prompts from "prompts";
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";

let write = process.env.WRITE === "true";

async function main() {
  const config = await hre.ethers.getContract("Config");
  const dataStore = await hre.ethers.getContract("DataStore");
  const distributionId = process.env.DISTRIBUTION_ID;
  const newValue = process.env.NEW_VALUE;

  if (!distributionId) {
    throw new Error("DISTRIBUTION_ID is empty");
  }

  if (newValue === undefined) {
    throw new Error("NEW_VALUE is empty");
  }

  const isDisabled = newValue === "true";

  const key = keys.generalClaimFeatureDisabled(distributionId);
  const currentValue = await dataStore.getBool(key);

  console.info(
    `toggling generalClaimFeatureDisabled for distributionId: ${distributionId}, new value: ${isDisabled}, current value: ${currentValue}`
  );

  if (currentValue === newValue) {
    console.warn("WARN: No change needed");
  }

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transaction?",
    }));
  }

  if (write) {
    const tx = await config.setBool(
      keys.GENERAL_CLAIM_FEATURE_DISABLED,
      encodeData(["uint256"], [distributionId]),
      isDisabled
    );
    console.log(`tx sent: ${tx.hash}`);
    await tx.wait();
    console.log(`generalClaimFeatureDisabled updated for distributionId ${distributionId}`);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
