import hre from "hardhat";
import { hashData, encodeData } from "../utils/hash";
import * as keys from "../utils/keys";
import { bigNumberify } from "../utils/math";

const write = process.env.WRITE === "true";

// This script migrates position impact exponent factor values from v2.2 to v2.2b format
// v2.2: positionImpactExponentFactorKey(market) - single parameter
// v2.2b: positionImpactExponentFactorKey(market, isPositive) - two parameters
//
// The script reads on-chain values from old keys and writes them to new keys
// with both isPositive=true and isPositive=false set to the same value

// Keys to migrate from old format (market only) to new format (market, isPositive)
const KEYS_TO_MIGRATE: { baseKey: string; name: string }[] = [
  { baseKey: keys.POSITION_IMPACT_EXPONENT_FACTOR, name: "POSITION_IMPACT_EXPONENT_FACTOR" },
];

interface MarketData {
  marketToken: string;
  indexToken: string;
  longToken: string;
  shortToken: string;
}

interface OldKeyValue {
  market: string;
  keyName: string;
  baseKey: string;
  value: string;
}

// Generate old key format: keccak256(abi.encode(baseKey, market))
function generateOldKey(baseKey: string, market: string): string {
  return hashData(["bytes32", "address"], [baseKey, market]);
}

async function main() {
  console.log("Starting position impact exponent factor migration...\n");

  // Get contracts
  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");
  const multicall = await hre.ethers.getContract("Multicall3");
  const reader = await hre.ethers.getContract("Reader");

  console.log(`Network: ${hre.network.name}`);
  console.log(`DataStore: ${dataStore.address}`);
  console.log(`Config: ${config.address}`);
  console.log(`Mode: ${write ? "WRITE" : "READ-ONLY"}\n`);

  // Step 1: Discover all markets
  console.log("Step 1: Discovering markets...");
  const markets: MarketData[] = await reader.getMarkets(dataStore.address, 0, 1000);
  console.log(`Found ${markets.length} markets\n`);

  if (markets.length === 0) {
    console.log("No markets found. Exiting.");
    return;
  }

  // Step 2: Read both old and new values from DataStore using Multicall3
  console.log("Step 2: Reading old and new key values...");
  const multicallReadParams = [];

  for (const market of markets) {
    for (const keyConfig of KEYS_TO_MIGRATE) {
      // Read OLD format (market only)
      const oldKey = generateOldKey(keyConfig.baseKey, market.marketToken);
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [oldKey]),
      });

      // Read NEW format (market, isPositive=true)
      const newKeyPositive = hashData(["bytes32", "address", "bool"], [keyConfig.baseKey, market.marketToken, true]);
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [newKeyPositive]),
      });

      // Read NEW format (market, isPositive=false)
      const newKeyNegative = hashData(["bytes32", "address", "bool"], [keyConfig.baseKey, market.marketToken, false]);
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [newKeyNegative]),
      });
    }
  }

  const readResults = await multicall.callStatic.aggregate3(multicallReadParams);

  // Parse results
  const oldKeyValues: OldKeyValue[] = [];
  let resultIndex = 0;

  for (const market of markets) {
    console.log(`\nMarket: ${market.marketToken}`);
    console.log(`  Index: ${market.indexToken}`);
    console.log(`  Long: ${market.longToken}`);
    console.log(`  Short: ${market.shortToken}`);

    for (const keyConfig of KEYS_TO_MIGRATE) {
      const oldValue = bigNumberify(readResults[resultIndex].returnData).toString();
      resultIndex++;

      const newValuePositive = bigNumberify(readResults[resultIndex].returnData).toString();
      resultIndex++;

      const newValueNegative = bigNumberify(readResults[resultIndex].returnData).toString();
      resultIndex++;

      console.log(`  ${keyConfig.name} (OLD): ${oldValue}`);
      console.log(`  ${keyConfig.name} (NEW positive): ${newValuePositive}`);
      console.log(`  ${keyConfig.name} (NEW negative): ${newValueNegative}`);

      // Only track non-zero OLD values for migration
      if (oldValue !== "0") {
        oldKeyValues.push({
          market: market.marketToken,
          keyName: keyConfig.name,
          baseKey: keyConfig.baseKey,
          value: oldValue,
        });
      }
    }
  }

  console.log(`\nFound ${oldKeyValues.length} non-zero values to migrate`);

  if (oldKeyValues.length === 0) {
    console.log("No values to migrate. Exiting.");
    return;
  }

  // Step 3: Prepare Config.setUint calls for new keys
  console.log("\nStep 3: Preparing migration transactions...");
  const configMulticallParams = [];

  for (const oldValue of oldKeyValues) {
    // Write to both isPositive=true and isPositive=false
    for (const isPositive of [true, false]) {
      const keyData = encodeData(["address", "bool"], [oldValue.market, isPositive]);

      configMulticallParams.push(
        config.interface.encodeFunctionData("setUint", [oldValue.baseKey, keyData, oldValue.value])
      );

      console.log(`  ${oldValue.keyName}(${oldValue.market.slice(0, 8)}..., ${isPositive}) = ${oldValue.value}`);
    }
  }

  console.log(`\nPrepared ${configMulticallParams.length} Config.setUint calls`);

  // Step 4: Execute via Config.multicall if WRITE=true
  if (write) {
    console.log("\nStep 4: Executing migration...");

    // Execute in batches of 100 to avoid gas limits
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < configMulticallParams.length; i += batchSize) {
      batches.push(configMulticallParams.slice(i, i + batchSize));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\nExecuting batch ${i + 1}/${batches.length} (${batch.length} calls)...`);

      const tx = await config.multicall(batch);
      console.log(`  Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`  Transaction confirmed in block ${receipt.blockNumber}`);
      console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
    }

    console.log("\n✅ Migration completed successfully!");
  } else {
    console.log("\n⚠️  Script ran in READ-ONLY mode. No transactions were sent.");
    console.log("To execute the migration, run with: WRITE=true");
  }

  // Step 5: Verification (optional - show what new keys would contain)
  console.log("\nStep 5: Verification summary");
  console.log("After migration, the following keys will be set:");

  for (const oldValue of oldKeyValues) {
    const positiveKey = hashData(["bytes32", "address", "bool"], [oldValue.baseKey, oldValue.market, true]);
    const negativeKey = hashData(["bytes32", "address", "bool"], [oldValue.baseKey, oldValue.market, false]);

    console.log(`\n${oldValue.keyName} for market ${oldValue.market}:`);
    console.log(`  Positive key (${positiveKey.slice(0, 10)}...): ${oldValue.value}`);
    console.log(`  Negative key (${negativeKey.slice(0, 10)}...): ${oldValue.value}`);
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
