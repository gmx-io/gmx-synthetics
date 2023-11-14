import hre from "hardhat";
import { getWithdrawalCount, getWithdrawalKeys } from "../utils/withdrawal";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const withdrawalCount = await getWithdrawalCount(dataStore);
  const withdrawalKeys = await getWithdrawalKeys(dataStore, 0, withdrawalCount);
  for (const key of withdrawalKeys) {
    const withdrawal = await reader.getWithdrawal(dataStore.address, key);
    console.log("%s", key);
    for (const prop of Object.keys(withdrawal)) {
      if (!isNaN(Number(prop))) {
        continue;
      }
      console.log(" . %s: %s", prop, withdrawal[prop].toString());
    }
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
