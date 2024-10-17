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
  {
    key: "0x24acc6b0a714ba4fd5a300ccf55b95888657747266b09c94a59004f9ff375c91",
    tokens: ["0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"],
    prices: [
      {
        min: "144788768892410870000000",
        max: "144810902363310220000000",
      },
      {
        min: "999844445684416100000000",
        max: "1000070500000000000000000",
      },
    ],
    priceTimestamp: 1727892324,
    blockNumber: 259687527,
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
    } catch (ex) {
      const parsedErrorName = parseError(ex.data)?.name;
      if (parsedErrorName === "EndOfOracleSimulation") {
        console.log("order %s was executed", order.key);
        continue;
      }
      console.log("order %s execution failed: %s", order.key, parsedErrorName);
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
