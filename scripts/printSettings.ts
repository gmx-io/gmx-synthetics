import hre from "hardhat";
import * as keys from "../utils/keys";

const { ethers } = hre;

async function main() {
  const dataStore = await ethers.getContract("DataStore");
  const maxUiFeeFactor = await dataStore.getUint(keys.MAX_UI_FEE_FACTOR);
  const estimatedGasFeeBaseAmount = await dataStore.getUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT);
  const executionGasFeeBaseAmount = await dataStore.getUint(keys.EXECUTION_GAS_FEE_BASE_AMOUNT_V2_1);

  console.log("maxUiFeeFactor %s", maxUiFeeFactor);
  console.log("estimatedGasFeeBaseAmount %s", estimatedGasFeeBaseAmount);
  console.log("executionGasFeeBaseAmount %s", executionGasFeeBaseAmount);
}
main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
