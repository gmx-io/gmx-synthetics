import hre from "hardhat";
import { DEFAULT_MARKET_TYPE, createMarketConfigByKey, getMarketKey, getMarketTokenAddresses } from "../utils/market";

async function main() {
  const marketFactory = await hre.ethers.getContract("MarketFactory");
  const tokens = await hre.gmx.getTokens();

  // marketKey should be of the form indexToken:longToken:shortToken
  // or if SWAP_ONLY=true, then marketKey should be in the form longToken:shortToken
  const marketKey = process.env.MARKET_KEY;

  if (!marketKey) {
    throw new Error("MARKET_KEY is empty");
  }

  const swapOnly = process.env.SWAP_ONLY === "true";

  const tokenSymbols = marketKey.split(":");

  if (swapOnly) {
    if (tokenSymbols.length !== 2) {
      throw new Error("Invalid MARKET_KEY");
    }
  } else {
    if (tokenSymbols.length !== 3) {
      throw new Error("Invalid MARKET_KEY");
    }
  }

  const indexTokenSymbol = swapOnly ? undefined : tokenSymbols[0];
  const longTokenSymbol = swapOnly ? tokenSymbols[0] : tokenSymbols[1];
  const shortTokenSymbol = swapOnly ? tokenSymbols[1] : tokenSymbols[2];

  const [indexTokenAddress, longTokenAddress, shortTokenAddress] = getMarketTokenAddresses(
    {
      tokens: {
        indexToken: indexTokenSymbol,
        longToken: longTokenSymbol,
        shortToken: shortTokenSymbol,
      },
      swapOnly: swapOnly,
    },
    tokens
  );

  const marketConfigs = await hre.gmx.getMarkets();
  const marketConfigKey = getMarketKey(indexTokenAddress, longTokenAddress, shortTokenAddress);
  const marketConfigByKey = createMarketConfigByKey({ marketConfigs, tokens });
  const marketConfig = marketConfigByKey[marketConfigKey];

  if (!marketConfig) {
    throw new Error("Empty market config");
  }

  console.info(
    `creating market: indexToken: ${indexTokenAddress}, longToken: ${longTokenAddress}, shortToken: ${shortTokenAddress}`
  );

  if (process.env.WRITE === "true") {
    const tx = await marketFactory.createMarket(
      indexTokenAddress,
      longTokenAddress,
      shortTokenAddress,
      DEFAULT_MARKET_TYPE
    );
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
