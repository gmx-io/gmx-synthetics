import hre from "hardhat";
import { hashData } from "../utils/hash";
import * as keys from "../utils/keys";

// Simple script to compare OLD vs NEW POSITION_IMPACT_FACTOR key formats
// OLD: keccak256(abi.encode(POSITION_IMPACT_FACTOR, market))
// NEW: keccak256(abi.encode(POSITION_IMPACT_FACTOR, market, isPositive))

const MARKETS_COUNT = 5; // change to 200 to cover all markets

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");

  const markets = await reader.getMarkets(dataStore.address, 0, MARKETS_COUNT);

  console.log("POSITION_IMPACT_FACTOR: Comparing OLD vs NEW key format values\n");

  for (const market of markets) {
    console.log(`\nMarket: ${market.marketToken}`);

    // OLD format: keccak256(abi.encode(POSITION_IMPACT_FACTOR, market))
    const oldKey = hashData(["bytes32", "address"], [keys.POSITION_IMPACT_FACTOR, market.marketToken]);

    // NEW format: keccak256(abi.encode(POSITION_IMPACT_FACTOR, market, isPositive))
    const newKeyPositive = hashData(
      ["bytes32", "address", "bool"],
      [keys.POSITION_IMPACT_FACTOR, market.marketToken, true]
    );
    const newKeyNegative = hashData(
      ["bytes32", "address", "bool"],
      [keys.POSITION_IMPACT_FACTOR, market.marketToken, false]
    );

    // Read values from DataStore
    const oldValue = await dataStore.getUint(oldKey);
    const newValuePositive = await dataStore.getUint(newKeyPositive);
    const newValueNegative = await dataStore.getUint(newKeyNegative);

    console.log(`  OLD (market only):              ${oldValue.toString()}`);
    console.log(`  NEW (market, isPositive=true):  ${newValuePositive.toString()}`);
    console.log(`  NEW (market, isPositive=false): ${newValueNegative.toString()}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
