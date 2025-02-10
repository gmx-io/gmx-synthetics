import hre from "hardhat";

import * as keys from "../utils/keys";
import { toLoggableObject } from "../utils/print";
import got from "got";
import { expandDecimals } from "../utils/math";

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

  const { tickersUrl } = getValues();

  const marketToken = process.env.MARKET;
  const market = await reader.getMarket(dataStore.address, marketToken);

  const tickers = (await got(tickersUrl).json()) as any[];
  const tickerByToken = Object.fromEntries(tickers.map((t) => [t.tokenAddress, t]));

  const indexTokenTicker =
    market.indexToken === hre.ethers.constants.AddressZero
      ? { minPrice: 0, maxPrice: 0 }
      : tickerByToken[market.indexToken];
  const longTokenTicker = tickerByToken[market.longToken];
  const shortTokenTicker = tickerByToken[market.shortToken];

  const pnlFactorType = keys[process.env.PNL_FACTOR_TYPE || "MAX_PNL_FACTOR_FOR_TRADERS"];
  const maximize = process.env.MAXIMIZE === "true" ? true : false;

  console.log("Getting price data for market %s", marketToken);
  console.log("indexToken: %s longToken: %s shortToken: %s", market.indexToken, market.longToken, market.shortToken);
  console.log("pnlFactorType: %s maximize: %s", pnlFactorType, maximize);

  const data = await reader.getMarketTokenPrice(
    dataStore.address,
    market,
    {
      min: indexTokenTicker.minPrice,
      max: indexTokenTicker.maxPrice,
    },
    {
      min: longTokenTicker.minPrice,
      max: longTokenTicker.maxPrice,
    },
    {
      min: shortTokenTicker.minPrice,
      max: shortTokenTicker.maxPrice,
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
