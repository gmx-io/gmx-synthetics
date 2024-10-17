import hre, { ethers } from "hardhat";
import { parseError } from "../utils/error";

const orders = [
  {
    key: "0x475a7581392c035fb97b6e4efdd3a828610b43e16a56ad4010097ddcea02db89",
    tokens: ["0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"],
    prices: [
      {
        min: "2460979000000000",
        max: "2461381700000000",
      },
      {
        min: "999790000000000000000000",
        max: "999930680000000000000000",
      },
    ],
    priceTimestamp: 1728673667,
    blockNumber: 262787741,
  },
];

async function simulateExecuteOrders() {
  const exchangeRouter = await ethers.getContract("ExchangeRouter");

  for (const order of orders) {
    try {
      await exchangeRouter.callStatic.simulateExecuteOrder(
        order.key,
        {
          primaryPrices: order.prices,
          primaryTokens: order.tokens,
          minTimestamp: order.priceTimestamp,
          maxTimestamp: order.priceTimestamp,
        },
        { blockTag: order.blockNumber }
      );
      console.log("order %s successfully executed", order.key);
    } catch (ex) {
      console.log("order %s execution failed: %s", order.key, parseError(ex.data)?.name);
    }
  }
}

async function main() {
  if (hre.network.name === "arbitrum") {
    await simulateExecuteOrders();
    return;
  }

  throw new Error(`Unsupported network ${hre.network.name}`);
}

main();
