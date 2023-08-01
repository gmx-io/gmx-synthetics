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
    console.log(`updating ${marketName} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}]`);

    if (process.env.ENABLE_ALL) {
      if (marketConfig.isDisabled) {
        console.warn(
          `WARNING: ${marketName} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}] has isDisabled set to true, skipping market`
        );
        continue;
      }

      await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), false);
      continue;
    }

    if (process.env.DISABLE_ALL) {
      await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), true);
      continue;
    }

    if (marketConfig.isDisabled === false) {
      await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), false);
      continue;
    }

    if (marketConfig.isDisabled === true) {
      await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), true);
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
