import hre from "hardhat";
const { ethers } = hre;
import * as keys from "../utils/keys";

async function main() {
  if (hre.network.name !== "avalancheFuji") {
    throw new Error("unsupported network");
  }

  const dataStore = await ethers.getContract("DataStore");
  const glvsToRemove = ["0xDD06Cd6694FeB4222FD1a4146d118078D672d7EB", "0x25649B9e6CdB0E73B7549BACA798b9dEB1eC51A2"];

  for (const glv of glvsToRemove) {
    const tx = await dataStore["removeAddress(bytes32,address)"](keys.GLV_LIST, glv);
    console.log("removed %s in tx %s", glv, tx.hash);
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
