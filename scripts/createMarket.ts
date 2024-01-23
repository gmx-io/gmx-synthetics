import hre from "hardhat";
import { DEFAULT_MARKET_TYPE } from "../utils/market";

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

  const indexTokenAddress = tokens[tokenSymbols[0]];
  const longTokenAddress = tokens[tokenSymbols[1]];
  const shortTokenAddress = tokens[tokenSymbols[2]];

  console.info(
    `creating market... indexToken: ${indexTokenAddress}, longToken: ${longTokenAddress}, shortToken: ${shortTokenAddress}`
  );

  await marketFactory.createMarket(indexTokenAddress, longTokenAddress, shortTokenAddress, DEFAULT_MARKET_TYPE);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
