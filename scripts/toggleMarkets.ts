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

  const write = process.env.WRITE === "true";

  const toggleMarket = async ({ marketToken, marketNameFull, isDisabled }) => {
    if (isDisabled) {
      console.log(`    disabling ${marketNameFull}`);
    } else {
      console.log(`    enabling ${marketNameFull}`);
    }

    if (write) {
      await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [marketToken]), isDisabled);
    }
  };

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    const marketToken = onchainMarket.marketToken;

    const marketName = marketConfig.tokens.indexToken ? `${marketConfig.tokens.indexToken}/USD` : "SWAP-ONLY";
    const marketNameFull = `${marketName} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}], ${marketToken}`;
    console.log(`checking ${marketNameFull}`);

    if (process.env.ENABLE_ALL) {
      if (marketConfig.isDisabled) {
        console.warn(`    WARNING: ${marketNameFull} has isDisabled set to true, skipping market`);
        continue;
      }

      await toggleMarket({ marketToken, marketNameFull, isDisabled: false });
      continue;
    }

    if (process.env.DISABLE_ALL) {
      console.log(`disabling ${marketNameFull}`);
      await toggleMarket({ marketToken, marketNameFull, isDisabled: true });
      continue;
    }

    if (marketConfig.isDisabled === undefined) {
      continue;
    }

    await toggleMarket({ marketToken, marketNameFull, isDisabled: marketConfig.isDisabled });
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
