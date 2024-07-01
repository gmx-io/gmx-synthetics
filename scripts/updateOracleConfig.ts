import hre from "hardhat";

import * as keys from "../utils/keys";

async function main() {
  const oracleConfig = await hre.gmx.getOracle();

  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");

  for (const [key, value] of Object.entries(oracleConfig)) {
    console.log("%s: %j", key, value.toString());
  }

  for (const [key, configKey] of [
    [keys.MAX_ORACLE_PRICE_AGE, "maxOraclePriceAge"],
    [keys.MAX_ORACLE_TIMESTAMP_RANGE, "maxOracleTimestampRange"],
  ]) {
    const newValue = oracleConfig[configKey];
    const oldValue = await dataStore.getUint(key);

    if (newValue.toString() !== oldValue.toString()) {
      console.log("updated value for %s: %s -> %s", configKey, oldValue, newValue);

      if (process.env.WRITE === "true") {
        console.log("sending transaction...");
        const tx = await config.setUint(key, "0x", newValue);
        console.log("tx sent: %s", tx.hash);
      }
    }
  }

  if (process.env.WRITE !== "true") {
    console.log("skip sending transaction");
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
