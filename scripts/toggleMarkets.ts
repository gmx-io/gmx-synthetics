import hre from "hardhat";

import { encodeData } from "../utils/hash";
import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import * as keys from "../utils/keys";

async function toggleMarket({ config, multicallWriteParams, marketToken, marketNameFull, isDisabled }) {
  if (isDisabled) {
    console.log(`    disabling ${marketNameFull}`);
  } else {
    console.log(`    enabling ${marketNameFull}`);
  }

  multicallWriteParams.push(
    config.interface.encodeFunctionData("setBool", [
      keys.IS_MARKET_DISABLED,
      encodeData(["address"], [marketToken]),
      isDisabled,
    ])
  );
}

export async function main() {
  const { read } = hre.deployments;

  const tokens = await hre.gmx.getTokens();
  const markets = await hre.gmx.getMarkets();

  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  const multicallWriteParams = [];

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);

    const shouldSkip =
      (process.env.ENABLE_MARKET_KEY && process.env.ENABLE_MARKET_KEY !== marketKey) ||
      (process.env.DISABLE_MARKET_KEY && process.env.DISABLE_MARKET_KEY !== marketKey);

    if (shouldSkip) {
      console.log(`skipping ${marketKey}`);
      continue;
    }

    const shouldEnable = process.env.ENABLE_ALL || process.env.ENABLE_MARKET_KEY === marketKey;
    const shouldDisable = process.env.DISABLE_ALL || process.env.DISABLE_MARKET_KEY === marketKey;

    const onchainMarket = onchainMarketsByTokens[marketKey];
    const marketToken = onchainMarket.marketToken;

    const marketName = marketConfig.tokens.indexToken ? `${marketConfig.tokens.indexToken}/USD` : "SWAP-ONLY";
    const marketNameFull = `${marketName} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}], ${marketToken}`;
    console.log(`checking ${marketNameFull}`);

    const toggleMarketParams = { config, multicallWriteParams, marketToken, marketNameFull };

    if (shouldEnable) {
      if (marketConfig.isDisabled) {
        console.warn(`    WARNING: ${marketNameFull} has isDisabled set to true, skipping market`);
        continue;
      }

      await toggleMarket({ ...toggleMarketParams, isDisabled: false });
      continue;
    }

    if (shouldDisable) {
      console.log(`disabling ${marketNameFull}`);
      await toggleMarket({ ...toggleMarketParams, isDisabled: true });
      continue;
    }

    if (marketConfig.isDisabled === undefined) {
      continue;
    }

    await toggleMarket({ ...toggleMarketParams, isDisabled: marketConfig.isDisabled });
  }

  console.log(`updating ${multicallWriteParams.length} params`);
  console.log("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE === "true") {
    const tx = await config.multicall(multicallWriteParams);
    console.log(`tx sent: ${tx.hash}`);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
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
