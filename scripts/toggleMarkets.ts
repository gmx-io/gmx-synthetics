import hre from "hardhat";

import { encodeData } from "../utils/hash";
import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import * as keys from "../utils/keys";

export async function main() {
  const { read } = hre.deployments;

  const tokens = await hre.gmx.getTokens();
  const markets = await hre.gmx.getMarkets();

  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    const marketToken = onchainMarket.marketToken;

    const marketName = marketConfig.tokens.indexToken ? `${marketConfig.tokens.indexToken}/USD` : "SWAP-ONLY";
    const marketNameFull = `${marketName} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}]`;
    console.log(`updating ${marketNameFull}`);

    const write = process.env.WRITE === "true";

    if (process.env.ENABLE_ALL) {
      if (marketConfig.isDisabled) {
        console.warn(`WARNING: ${marketNameFull} has isDisabled set to true, skipping market`);
        continue;
      }

      console.log(`enabling ${marketNameFull}`);
      if (write) {
        await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), false);
      }
      continue;
    }

    if (process.env.DISABLE_ALL) {
      console.log(`disabling ${marketNameFull}`);
      if (write) {
        await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), true);
      }
      continue;
    }

    if (marketConfig.isDisabled === undefined) {
      continue;
    }

    if (marketConfig.isDisabled === false) {
      console.log(`enabling ${marketNameFull}`);
      if (write) {
        await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), false);
      }
      continue;
    }

    if (marketConfig.isDisabled === true) {
      console.log(`disabling ${marketNameFull}`);
      if (write) {
        await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), true);
      }
      continue;
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
