import hre from "hardhat";

import * as keys from "../utils/keys";

const { ethers } = hre;

async function main() {
  const dataStore = await ethers.getContract("DataStore");
  const tokens = await hre.gmx.getTokens();

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    const dataStreamIdKey = keys.dataStreamIdKey((token as any).address);
    const dataStreamMultiplierKey = keys.dataStreamMultiplierKey((token as any).address);
    const [dataStreamFeed, dataStreamFeedMultiplier] = await Promise.all([
      dataStore.getBytes32(dataStreamIdKey),
      dataStore.getUint(dataStreamMultiplierKey),
    ]);
    console.log("%s %s %s", tokenSymbol.padEnd(6), dataStreamFeed, dataStreamFeedMultiplier);
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
