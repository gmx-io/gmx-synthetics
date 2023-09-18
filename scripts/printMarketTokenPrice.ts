import hre from "hardhat";

import * as keys from "../utils/keys";
import { toLoggableObject } from "./utils";
import got from "got";
import { expandDecimals } from "../utils/math";

function getArbValues() {
  return {
    marketToken: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
    indexToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    shortTokenPrice: "1000000000000000000000000",
    tickersUrl: "https://arbitrum.gmx-oracle.io/prices/tickers",
  };
}

function getValues() {
  if (hre.network.name === "arbitrum") {
    return getArbValues();
  }
  throw new Error("Unsupported network");
}

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");

  const { tickersUrl, marketToken, indexToken, longToken, shortToken, shortTokenPrice } = getValues();

  const tickers = (await got(tickersUrl).json()) as any[];
  const tickerByToken = Object.fromEntries(tickers.map((t) => [t.tokenAddress, t]));

  const indexTokenTicker = tickerByToken[indexToken];
  const indexTokenPriceMax = expandDecimals(indexTokenTicker.maxPrice, indexTokenTicker.oracleDecimals);
  const indexTokenPriceMin = expandDecimals(indexTokenTicker.minPrice, indexTokenTicker.oracleDecimals);

  const longTokenTicker = tickerByToken[longToken];
  const longTokenPriceMax = expandDecimals(longTokenTicker.maxPrice, longTokenTicker.oracleDecimals);
  const longTokenPriceMin = expandDecimals(longTokenTicker.minPrice, longTokenTicker.oracleDecimals);

  const pnlFactorType = keys.MAX_PNL_FACTOR_FOR_TRADERS;
  const maximize = true;

  console.log("Getting price data for market %s", marketToken);
  console.log("indexToken: %s longToken: %s shortToken: %s", indexToken, longToken, shortToken);
  console.log("pnlFactorType: %s maximize: %s", pnlFactorType, maximize);

  const data = await reader.getMarketTokenPrice(
    dataStore.address,
    {
      marketToken,
      indexToken,
      longToken,
      shortToken,
    },
    {
      min: indexTokenPriceMin,
      max: indexTokenPriceMax,
    },
    {
      min: longTokenPriceMin,
      max: longTokenPriceMax,
    },
    {
      min: shortTokenPrice,
      max: shortTokenPrice,
    },
    pnlFactorType,
    maximize
  );

  console.log("Price for market %s is %s", marketToken, data[0]);
  console.log(toLoggableObject(data[1]));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
