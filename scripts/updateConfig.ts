import hre from "hardhat";

import * as keys from "../utils/keys";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");
  const keyLabel = "MIN_HANDLE_EXECUTION_ERROR_GAS";
  const newValue = 1_000_001;
  const key = keys[keyLabel];

  const originalValue = await dataStore.getUint(key);
  console.log(`${keyLabel}:`, originalValue.toString());

  await config.setUint(key, "0x", newValue);

  console.log(`${keyLabel}:`, (await dataStore.getUint(key)).toString());

  await config.setUint(key, "0x", originalValue);

  console.log(`${keyLabel}:`, (await dataStore.getUint(key)).toString());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
