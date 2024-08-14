import hre from "hardhat";

import * as keys from "../utils/keys";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");

  const account = process.env.ACCOUNT;

  const positionKeys = await dataStore.getBytes32ValuesAt(keys.accountPositionListKey(account), 0, 10);

  for (const positionKey of positionKeys) {
    const listKey = keys.autoCancelOrderListKey(positionKey);

    const orderKeys = await dataStore.getBytes32ValuesAt(listKey, 0, 10);

    console.log(`orderKeys ${positionKey}:`, orderKeys);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
