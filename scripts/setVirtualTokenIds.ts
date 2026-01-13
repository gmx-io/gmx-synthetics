/**
 * Sets virtualTokenId values on-chain for index tokens that are missing them.
 *
 * virtualTokenId links markets by index token for virtual position inventory calculations.
 * Markets sharing the same virtualTokenId will have their position price impact calculated
 * against a combined virtual pool (the WORSE of real vs virtual impact is used).
 *
 * Usage:
 *   npx hardhat run scripts/setVirtualTokenIds.ts --network arbitrum
 *   WRITE=true npx hardhat run scripts/setVirtualTokenIds.ts --network arbitrum
 *
 * Output:
 * - Lists tokens that need virtualTokenId to be set (missing on-chain)
 * - Lists tokens with mismatched values (skipped, requires manual review)
 * - In WRITE mode, executes transactions via Config contract
 */

import hre from "hardhat";
import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";

const { ethers } = hre;
const write = process.env.WRITE === "true";

async function main() {
  const dataStore = await ethers.getContract("DataStore");
  const config = await ethers.getContract("Config");
  const markets = await hre.gmx.getMarkets();
  const tokens = await hre.gmx.getTokens();

  // Group by virtualTokenIdForIndexToken
  const marketsByVirtualTokenId: Record<string, any[]> = {};
  for (const market of markets) {
    const key = market.virtualTokenIdForIndexToken;
    if (key === undefined) continue;
    if (!marketsByVirtualTokenId[key]) marketsByVirtualTokenId[key] = [];
    marketsByVirtualTokenId[key].push(market);
  }

  console.log("=== Setting virtualTokenId on-chain ===\n");
  console.log(`Mode: ${write ? "WRITE (will execute transactions)" : "DRY-RUN (preview only)"}\n`);

  const toSet: { symbol: string; address: string; virtualTokenId: string }[] = [];
  const matched: string[] = [];
  const mismatched: { symbol: string; address: string; config: string; onchain: string }[] = [];

  for (const [configVirtualTokenId, groupMarkets] of Object.entries(marketsByVirtualTokenId)) {
    const firstMarket = groupMarkets[0];
    const indexTokenSymbol = firstMarket.tokens.indexToken;
    const indexTokenAddress = tokens[indexTokenSymbol]?.address;

    if (!indexTokenAddress) {
      console.log(`[WARN] No address for token: ${indexTokenSymbol}`);
      continue;
    }

    // Get on-chain virtualTokenId for this token
    const onchainVirtualTokenId = await dataStore.getBytes32(keys.virtualTokenIdKey(indexTokenAddress));

    if (onchainVirtualTokenId === ethers.constants.HashZero) {
      // Missing - needs to be set
      toSet.push({
        symbol: indexTokenSymbol,
        address: indexTokenAddress,
        virtualTokenId: configVirtualTokenId,
      });
      console.log(`\n[WILL SET] ${indexTokenSymbol} (${indexTokenAddress})`);
      console.log(`           Value: ${configVirtualTokenId}`);
      console.log(`           Markets: ${groupMarkets.length}`);
    } else if (onchainVirtualTokenId.toLowerCase() !== configVirtualTokenId.toLowerCase()) {
      // Mismatched - log warning but don't overwrite by default
      mismatched.push({
        symbol: indexTokenSymbol,
        address: indexTokenAddress,
        config: configVirtualTokenId,
        onchain: onchainVirtualTokenId,
      });
      console.log(`[MISMATCH] ${indexTokenSymbol} (${indexTokenAddress})`);
      console.log(`           Config: ${configVirtualTokenId}`);
      console.log(`           On-chain: ${onchainVirtualTokenId}`);
      console.log(`           (skipping - would need manual review)\n`);
    } else {
      matched.push(indexTokenSymbol);
      console.log(`\n[ALREADY SET] ${indexTokenSymbol} (${indexTokenAddress})`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Already matched: ${matched.length}`);
  console.log(`To set: ${toSet.length}`);
  console.log(`Mismatched (skipped): ${mismatched.length}`);

  if (toSet.length === 0) {
    console.log("\nNo tokens need virtualTokenId set. All done!");
    return;
  }

  if (!write) {
    console.log("\n=== Dry-run complete ===");
    console.log(`Run with WRITE=true to set ${toSet.length} virtualTokenIds:`);
    console.log(`  WRITE=true npx hardhat run scripts/setVirtualTokenIds.ts --network ${hre.network.name}`);
    return;
  }

  // Execute transactions
  console.log(`\n=== Executing ${toSet.length} transactions ===\n`);

  for (const item of toSet) {
    console.log(`Setting virtualTokenId for ${item.symbol}...`);
    try {
      const tx = await config.setBytes32(
        keys.VIRTUAL_TOKEN_ID,
        encodeData(["address"], [item.address]),
        item.virtualTokenId
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
  .then(() => process.exit(0))
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
