/**
 * Sets virtualMarketId values on-chain for markets that are missing them.
 *
 * virtualMarketId links markets for virtual swap inventory calculations.
 * Markets sharing the same virtualMarketId will have their swap price impact calculated against a combined virtual pool.
 *
 * Usage:
 *   npx hardhat run scripts/setVirtualMarketIds.ts --network arbitrum
 *   WRITE=true npx hardhat run scripts/setVirtualMarketIds.ts --network arbitrum
 *
 * Output:
 * - Lists markets that need virtualMarketId to be set (missing on-chain)
 * - Lists markets with mismatched values (skipped, requires manual review)
 * - In WRITE mode, executes transactions via Config contract
 */

import hre from "hardhat";
import { getOnchainMarkets, getMarketKey } from "../utils/market";
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";

const write = process.env.WRITE === "true";

interface MarketUpdate {
  marketName: string;
  marketTokenAddress: string;
  currentValue: string;
  configValue: string;
}

async function main() {
  const markets = await hre.gmx.getMarkets();
  const tokens = await hre.gmx.getTokens();
  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");
  const { read } = hre.deployments;

  // Fetch all on-chain markets once
  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  console.log("=== Setting virtualMarketId on-chain ===\n");
  console.log(`Mode: ${write ? "WRITE (will execute transactions)" : "DRY-RUN (preview only)"}\n`);

  const toSet: MarketUpdate[] = [];
  const matched: string[] = [];
  const mismatched: { marketName: string; marketTokenAddress: string; config: string; onchain: string }[] = [];
  const notDeployed: string[] = [];
  const noConfig: string[] = [];

  for (const market of markets) {
    const indexToken = tokens[market.tokens.indexToken] || { address: hre.ethers.constants.AddressZero };
    const longToken = tokens[market.tokens.longToken];
    const shortToken = tokens[market.tokens.shortToken];

    const marketName = market.tokens.indexToken
      ? `${market.tokens.indexToken} [${market.tokens.longToken}-${market.tokens.shortToken}]`
      : `SWAP-ONLY [${market.tokens.longToken}-${market.tokens.shortToken}]`;

    // Skip markets without virtualMarketId in config
    if (!market.virtualMarketId) {
      noConfig.push(marketName);
      continue;
    }

    // Look up actual on-chain market address
    const marketKey = getMarketKey(indexToken.address, longToken.address, shortToken.address);
    const onchainMarket = onchainMarketsByTokens[marketKey];

    if (!onchainMarket) {
      notDeployed.push(marketName);
      continue;
    }

    const marketTokenAddress = onchainMarket.marketToken;
    const currentValue = await dataStore.getBytes32(keys.virtualMarketIdKey(marketTokenAddress));

    if (currentValue === hre.ethers.constants.HashZero) {
      // Missing - needs to be set
      toSet.push({
        marketName,
        marketTokenAddress,
        currentValue,
        configValue: market.virtualMarketId,
      });
    } else if (currentValue.toLowerCase() !== market.virtualMarketId.toLowerCase()) {
      // Mismatched - skip, requires manual review
      mismatched.push({
        marketName,
        marketTokenAddress,
        config: market.virtualMarketId,
        onchain: currentValue,
      });
    } else {
      matched.push(marketName);
    }
  }

  // Output markets that need to be set (detailed)
  if (toSet.length > 0) {
    console.log("=== Markets to Set ===\n");
    for (const item of toSet) {
      console.log(`${item.marketName}`);
      console.log(`   Market Token: ${item.marketTokenAddress}`);
      console.log(`   Value: ${item.configValue}`);
    }
  }

  // Output skipped categories (compact lists)
  if (matched.length > 0) {
    console.log(`\n=== Already Set (${matched.length}) ===\n`);
    for (const name of matched) {
      console.log(`  ${name}`);
    }
    console.log("");
  }

  if (mismatched.length > 0) {
    console.log(`=== Mismatched - Requires Manual Review (${mismatched.length}) ===`);
    for (const item of mismatched) {
      console.log(`  ${item.marketName}`);
      console.log(`    Config:   ${item.config}`);
      console.log(`    On-chain: ${item.onchain}`);
    }
    console.log("");
  }

  if (notDeployed.length > 0) {
    console.log(`=== Not Deployed (${notDeployed.length}) ===`);
    for (const name of notDeployed) {
      console.log(`  ${name}`);
    }
  }

  if (noConfig.length > 0) {
    console.log(`\n=== No virtualMarketId in config (${noConfig.length}) ===\n`);
    for (const name of noConfig) {
      console.log(`  ${name}`);
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Total markets: ${markets.length}`);
  console.log(`To set: ${toSet.length}`);
  console.log(`Already set: ${matched.length}`);
  console.log(`Mismatched (skipped): ${mismatched.length}`);
  console.log(`Not deployed: ${notDeployed.length}`);
  console.log(`No virtualMarketId in config: ${noConfig.length}`);

  if (toSet.length === 0) {
    console.log("\nNo markets need virtualMarketId set. All done!");
    return;
  }

  if (!write) {
    console.log("\n=== Dry-run complete ===");
    console.log(`Run with WRITE=true to set ${toSet.length} virtualMarketIds:`);
    console.log(`  WRITE=true npx hardhat run scripts/setVirtualMarketIds.ts --network ${hre.network.name}`);
    return;
  }

  // Execute transactions
  console.log(`\n=== Executing ${toSet.length} transactions ===\n`);

  for (const item of toSet) {
    console.log(`Setting virtualMarketId for ${item.marketName}...`);
    try {
      const tx = await config.setBytes32(
        keys.VIRTUAL_MARKET_ID,
        encodeData(["address"], [item.marketTokenAddress]),
        item.configValue
      );
      console.log(`  tx: ${tx.hash}`);
      await tx.wait();
      console.log(`  confirmed\n`);
    } catch (error) {
      console.error(`  ERROR: ${error.message}\n`);
    }
  }

  console.log("=== Done ===");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
