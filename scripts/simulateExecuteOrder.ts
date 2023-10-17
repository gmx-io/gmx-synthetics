import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { expandDecimals } from "../utils/math";

// to run the script:
// 1. add the "forking" info to the hardhat network in hardhat.config.ts
// 2. for the "forking" config it may be necessary to use a block number that is one less than the failing transaction
// 3. KEEPER=<keeper address> FOR_NETWORK=<blockchain name> EXCHANGE_ROUTER=<exchange router address> ORDER_KEY=<key> npx hardhat run scripts/simulateExecuteOrder.ts
//
// note that the RPC URL must be working otherwise the script may fail
// with unrelated errors, e.g. OnlyHardhatNetworkError

async function simulateExecuteOrderForArbitrum() {
  const address = process.env.KEEPER;
  await impersonateAccount(address);
  const impersonatedSigner = await ethers.getSigner(address);
  const exchangeRouter = await ethers.getContractAt("ExchangeRouter", process.env.EXCHANGE_ROUTER, impersonatedSigner);
  await exchangeRouter.simulateExecuteOrder(process.env.ORDER_KEY, {
    primaryTokens: ["0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"],
    primaryPrices: [
      {
        min: expandDecimals(1637, 12),
        max: expandDecimals(1637, 12),
      },
      {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    ],
  });
}

async function main() {
  if (process.env.FOR_NETWORK === "arbitrum") {
    await simulateExecuteOrderForArbitrum();
    return;
  }

  throw new Error("Unsupported network");
}

main();
