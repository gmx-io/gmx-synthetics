import hre from "hardhat";
import * as keys from "../utils/keys";

const { ethers } = hre;

async function main() {
  const dataStore = await ethers.getContract("DataStore");
  const maxUiFeeFactor = await dataStore.getUint(keys.MAX_UI_FEE_FACTOR);

  console.log("maxUiFeeFactor %s", maxUiFeeFactor);
}
main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
