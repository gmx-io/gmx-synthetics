import hre from "hardhat";
import { DEFAULT_MARKET_TYPE, createMarketConfigByKey, getMarketKey } from "../utils/market";

async function main() {
  const marketFactory = await hre.ethers.getContract("MarketFactory");
  const tokens = await hre.gmx.getTokens();

  // marketKey should be of the form indexToken:longToken:shortToken
  const marketKey = process.env.MARKET_KEY;

  if (!marketKey) {
    throw new Error("MARKET_KEY is empty");
  }

  const tokenSymbols = marketKey.split(":");
  if (tokenSymbols.length !== 3) {
    throw new Error("Invalid MARKET_KEY");
  }

  const indexTokenAddress = tokens[tokenSymbols[0]].address;
  const longTokenAddress = tokens[tokenSymbols[1]].address;
  const shortTokenAddress = tokens[tokenSymbols[2]].address;

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
