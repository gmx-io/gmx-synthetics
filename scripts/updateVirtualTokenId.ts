import hre from "hardhat";
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";
import prompts from "prompts";
const { ethers } = hre;

let write = process.env.WRITE === "true";

async function main() {
  const config = await hre.ethers.getContract("Config");
  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");

  // market to update virtualId and virtualIndexTokenId for market index token
  const marketToken = process.env.MARKET_TOKEN;
  // NEW_VIRTUAL_TOKEN_ID is the new bytes32 virtualTokenId value
  const newVirtualTokenId = process.env.NEW_VIRTUAL_TOKEN_ID;

  if (!marketToken) {
    throw new Error("marketToken is required");
  }
  if (!newVirtualTokenId) {
    throw new Error("NEW_VIRTUAL_TOKEN_ID is required (bytes32 value)");
  }

  const market = await reader.getMarket(dataStore.address, marketToken);

  const existingVirtualTokenId = await dataStore.getBytes32(keys.virtualTokenIdKey(market.indexToken));
  const existingVirtualMarketId = await dataStore.getBytes32(keys.virtualMarketIdKey(marketToken));

  console.log("=".repeat(60));
  console.log("Update Virtual Token ID");
  console.log("=".repeat(60));
  console.log(`Market:                    ${market.marketToken}`);
  console.log(`Index Token:               ${market.indexToken}`);
  console.log(`Current Market Virtual ID: ${existingVirtualMarketId}`);
  console.log(`Current Virtual Token ID:  ${existingVirtualTokenId}`);
  console.log(`New Virtual ID:            ${newVirtualTokenId}`);
  console.log("=".repeat(60));

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transaction?",
    }));
  }

  if (write) {
    const multicallWriteParams = [];

    console.log("\nSending transaction to update virtual token ID...");

    if (existingVirtualTokenId.toLowerCase() === newVirtualTokenId.toLowerCase()) {
      console.log("Virtual Token ID is already set to the desired value. Nothing to do.");
    } else {
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setBytes32", [
          keys.VIRTUAL_TOKEN_ID,
          encodeData(["address"], [market.indexToken]),
          newVirtualTokenId,
        ])
      );
    }

    if (existingVirtualMarketId.toLowerCase() === newVirtualTokenId.toLowerCase()) {
      console.log("Virtual Market ID is already set to the desired value. Nothing to do.");
    } else {
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setBytes32", [
          keys.VIRTUAL_MARKET_ID,
          encodeData(["address"], [marketToken]),
          newVirtualTokenId,
        ])
      );
    }

    const tx = await config.multicall(multicallWriteParams);
    await tx.wait(2);
    console.info(`tx sent: ${tx.hash}`);
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
