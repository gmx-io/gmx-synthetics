import hre from "hardhat";

import * as keys from "../utils/keys";
import { toLoggableObject } from "./utils";

function getArbValues() {
  return {
    marketToken: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
    indexToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    indexTokenPrice: "1800000000000000",
    longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    longTokenPrice: "1800000000000000",
    shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    shortTokenPrice: "1000000000000000000000000",
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

  const { marketToken, indexToken, indexTokenPrice, longToken, longTokenPrice, shortToken, shortTokenPrice } =
    getValues();

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
      min: indexTokenPrice,
      max: indexTokenPrice,
    },
    {
      min: longTokenPrice,
      max: longTokenPrice,
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
