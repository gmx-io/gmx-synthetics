import hre from "hardhat";
import { DEFAULT_MARKET_TYPE, createMarketConfigByKey, getMarketKey, getMarketTokenAddresses } from "../utils/market";

// prints not yet deployed market token address
// example usage MARKET_KEY=CC:WBTC.e:USDC npx hardhat run --network arbitrum scripts/printNotDeployedMarketTokenAddress.ts

// marketKey should be of the form indexToken:longToken:shortToken
// or if SWAP_ONLY=true, then marketKey should be in the form longToken:shortToken
const marketKey = process.env.MARKET_KEY;
const swapOnly = process.env.SWAP_ONLY === "true";

if (!marketKey) {
  throw new Error("MARKET_KEY is empty");
}

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

async function main() {
  const marketFactory = await hre.ethers.getContract("MarketFactory");
  const tokens = await hre.gmx.getTokens();

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
  const marketConfigByKey = createMarketConfigByKey({ marketConfigs, tokens });
  const marketConfigKey = getMarketKey(indexTokenAddress, longTokenAddress, shortTokenAddress);
  const marketConfig = marketConfigByKey[marketConfigKey];

  if (!marketConfig) {
    throw new Error("Empty market config");
  }

  const marketType = DEFAULT_MARKET_TYPE;

  console.info(
    `fetching market token address for: indexToken: ${indexTokenAddress}, longToken: ${longTokenAddress}, shortToken: ${shortTokenAddress}, marketType: ${marketType}`
  );

  const { marketToken } = await marketFactory.callStatic.createMarket(
    indexTokenAddress,
    longTokenAddress,
    shortTokenAddress,
    DEFAULT_MARKET_TYPE,
    {
      from: "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460",
    }
  );

  console.log(`marketToken address: ${marketToken}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
