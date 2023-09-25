import hre from "hardhat";

import * as keys from "../utils/keys";

const { ethers } = hre;

async function main() {
  const dataStore = await ethers.getContract("DataStore");
  const tokens = await hre.gmx.getTokens();

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    const realtimeFeedKey = keys.realtimeFeedIdKey((token as any).address);
    const realtimeFeedMultiplierKey = keys.realtimeFeedMultiplierKey((token as any).address);
    const [realtimeFeed, realtimeFeedMultiplier] = await Promise.all([
      dataStore.getBytes32(realtimeFeedKey),
      dataStore.getUint(realtimeFeedMultiplierKey),
    ]);
    console.log("%s %s %s", tokenSymbol.padEnd(6), realtimeFeed, realtimeFeedMultiplier);
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
