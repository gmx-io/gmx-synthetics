import hre from "hardhat";

import got from "got";
import { bigNumberify, formatAmount } from "../utils/math";

function getValues() {
  if (hre.network.name === "arbitrum") {
    return {
      tickersUrl: "https://arbitrum-api.gmxinfra2.io/prices/tickers",
    };
  }

  if (hre.network.name === "avalanche") {
    return {
      tickersUrl: "https://avalanche-api.gmxinfra2.io/prices/tickers",
    };
  }

  throw new Error("Unsupported network");
}

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const glvReader = await hre.ethers.getContract("GlvReader");

  const { tickersUrl } = getValues();

  const glvToken = process.env.GLV || "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9"; // ETH;
  const glvInfo = await glvReader.getGlvInfo(dataStore.address, glvToken);

  const tickers = (await got(tickersUrl).json()) as any[];
  const tickerByToken = Object.fromEntries(tickers.map((t) => [t.tokenAddress, t]));

  const longTokenTicker = tickerByToken[glvInfo.glv.longToken];
  const shortTokenTicker = tickerByToken[glvInfo.glv.shortToken];

  const markets = await reader.getMarkets(dataStore.address, 0, 100);
  const marketByAddress = Object.fromEntries(markets.map((m) => [m.marketToken, m]));
  const indexTokenTickers = glvInfo.markets.map(
    (marketToken) => tickerByToken[marketByAddress[marketToken].indexToken]
  );

  const maximize = process.env.MAXIMIZE === "true" ? true : false;

  const longTokenPrice = { min: longTokenTicker.minPrice, max: longTokenTicker.maxPrice };
  const shortTokenPrice = { min: shortTokenTicker.minPrice, max: shortTokenTicker.maxPrice };
  const indexTokenPrices = indexTokenTickers.map((t) => ({ min: t.minPrice, max: t.maxPrice }));

  let totalDiff = bigNumberify(0);

  for (const block of [
    272389273, 272385458, 272373531, 272359030, 272339249, 272331968, 272324537, 272315845, 272301994, 272294575,
    272286437, 272279013, 272271345, 272254639, 272247219, 272239796, 272232371, 272225036, 272217608, 272210256,
    272202808, 272167214, 272145993, 272100327, 272073444, 272064919, 272057271, 272049970, 272042575, 272035213,
    272027808, 272020446, 272013029, 272005710, 271998294, 271990895,
  ]) {
    const [[, glvValueBefore], [, glvValueAfter]] = await Promise.all([
      glvReader.getGlvTokenPrice(
        dataStore.address,
        glvInfo.markets,
        indexTokenPrices,
        longTokenPrice,
        shortTokenPrice,
        glvToken,
        maximize,
        { blockTag: block - 1 }
      ),
      glvReader.getGlvTokenPrice(
        dataStore.address,
        glvInfo.markets,
        indexTokenPrices,
        longTokenPrice,
        shortTokenPrice,
        glvToken,
        maximize,
        { blockTag: block }
      ),
    ]);
    totalDiff = totalDiff.add(glvValueAfter.sub(glvValueBefore));
    console.log(
      "block %s glv value before %s after %s diff %s",
      block,
      formatAmount(glvValueBefore, 30, 10),
      formatAmount(glvValueAfter, 30, 10),
      formatAmount(glvValueAfter.sub(glvValueBefore), 30, 10)
    );
  }

  console.log("total diff %s", formatAmount(totalDiff, 30, 10));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
