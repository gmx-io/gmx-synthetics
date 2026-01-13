/**
 * This script simulates the swap price impact changes that would occur after virtualMarketId is correctly set for all markets.
 *
 * virtualMarketId links markets for virtual swap inventory calculations.
 * Markets sharing the same virtualMarketId will have their swap price impact calculated against a combined virtual pool.
 *
 * Output columns:
 * - market: INDEX [LONG-SHORT] market identifier
 * - virtualIdSet: whether virtualMarketId is set on-chain
 * - marketsInGroup: number of markets sharing the same virtualMarketId
 * - poolLongUsd: this market's long token pool in USD
 * - poolShortUsd: this market's short token pool in USD
 * - poolImbalance: this market's pool imbalance (long - short) in USD
 * - virtualImbalance: combined pool imbalance across all markets in the group
 * - imbalanceDiff: |virtualImbalance| - |poolImbalance|, additional imbalance after linking
 *
 * Usage:
 *   npx hardhat run scripts/simulateVirtualMarketIdFix.ts --network arbitrum
 */

import hre from "hardhat";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { formatAmount, bigNumberify } from "../utils/math";
import * as keys from "../utils/keys";
import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import { BigNumber } from "ethers";

const { ethers } = hre;

interface TokenPrice {
  min: BigNumber;
  max: BigNumber;
}

interface TickerData {
  price: TokenPrice;
  symbol: string;
}

async function fetchTickerPrices(network: string): Promise<Record<string, TickerData>> {
  console.log("Fetching token prices from GMX API...");
  const tickersUrl = `https://${network}-api.gmxinfra2.io/prices/tickers`;

  const tokenPricesResponse = await fetch(tickersUrl);
  const tokenPrices = (await tokenPricesResponse.json()) as any[];
  const tickersByTokenAddress: Record<string, TickerData> = {};

  for (const tokenPrice of tokenPrices) {
    tickersByTokenAddress[tokenPrice.tokenAddress.toLowerCase()] = {
      price: {
        min: bigNumberify(tokenPrice.minPrice),
        max: bigNumberify(tokenPrice.maxPrice),
      },
      symbol: tokenPrice.tokenSymbol || "unknown",
    };
  }

  return tickersByTokenAddress;
}

async function main() {
  const dataStore = await ethers.getContract("DataStore");
  const markets = await hre.gmx.getMarkets();
  const tokens = await hre.gmx.getTokens();
  const { read } = hre.deployments;
  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  // Fetch current prices from GMX API
  const tickersByTokenAddress = await fetchTickerPrices(hre.network.name);

  console.log("=".repeat(100));
  console.log("VIRTUAL MARKET ID FIX SIMULATION (SWAP PRICE IMPACT)");
  console.log("=".repeat(100));
  console.log("\nThis script shows how swap price impact would change after fixing virtualMarketId for all markets.");
  console.log("Pool values are calculated as POOL_AMOUNT x token price.\n");

  // Group markets by virtualMarketId from config
  const marketsByVirtualMarketId: Record<string, any[]> = {};
  const marketsWithoutConfig: string[] = [];
  for (const market of markets) {
    const key = market.virtualMarketId;
    if (key === undefined) {
      const name = market.tokens.indexToken
        ? `${market.tokens.indexToken} [${market.tokens.longToken}-${market.tokens.shortToken}]`
        : `SWAP-ONLY [${market.tokens.longToken}-${market.tokens.shortToken}]`;
      marketsWithoutConfig.push(name);
      continue;
    }
    if (!marketsByVirtualMarketId[key]) marketsByVirtualMarketId[key] = [];
    marketsByVirtualMarketId[key].push(market);
  }

  const results: any[] = [];

  for (const [configVirtualMarketId, groupMarkets] of Object.entries(marketsByVirtualMarketId)) {
    // Calculate combined pool balances across all markets in the group
    let totalPoolLongUsd = bigNumberify(0);
    let totalPoolShortUsd = bigNumberify(0);

    // Track which markets are missing virtualMarketId on-chain
    const marketData: {
      config: any;
      onchainMarket: any;
      isVirtualIdSet: boolean;
      poolLongUsd: BigNumber;
      poolShortUsd: BigNumber;
    }[] = [];

    for (const marketConfig of groupMarkets) {
      const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
      const marketKey = getMarketKey(indexToken, longToken, shortToken);
      const onchainMarket = onchainMarketsByTokens[marketKey];

      if (!onchainMarket) continue;

      // Check if virtualMarketId is set on-chain for this market
      const onchainVirtualMarketId = await dataStore.getBytes32(keys.virtualMarketIdKey(onchainMarket.marketToken));
      const isVirtualIdSet = onchainVirtualMarketId !== ethers.constants.HashZero;

      // Get pool amounts
      const poolLong = await dataStore.getUint(keys.poolAmountKey(onchainMarket.marketToken, onchainMarket.longToken));
      const poolShort = await dataStore.getUint(
        keys.poolAmountKey(onchainMarket.marketToken, onchainMarket.shortToken)
      );

      // Get token prices (30 decimals per 1 token)
      const longTokenPrice =
        tickersByTokenAddress[onchainMarket.longToken.toLowerCase()]?.price?.min || bigNumberify(0);
      const shortTokenPrice =
        tickersByTokenAddress[onchainMarket.shortToken.toLowerCase()]?.price?.min || bigNumberify(0);

      // Calculate pool values in USD (normalized to 30 decimals)
      // GMX prices are scaled so that: poolAmount * price = USD value in 30 decimals
      const poolLongUsd = poolLong.mul(longTokenPrice);
      const poolShortUsd = poolShort.mul(shortTokenPrice);

      totalPoolLongUsd = totalPoolLongUsd.add(poolLongUsd);
      totalPoolShortUsd = totalPoolShortUsd.add(poolShortUsd);

      marketData.push({
        config: marketConfig,
        onchainMarket,
        isVirtualIdSet,
        poolLongUsd,
        poolShortUsd,
      });
    }

    // Virtual pool imbalance (what it would be if all markets were linked)
    const projectedVirtualImbalance = totalPoolLongUsd.sub(totalPoolShortUsd);

    // Now create result entries for each market
    for (const { config: marketConfig, onchainMarket, isVirtualIdSet, poolLongUsd, poolShortUsd } of marketData) {
      const poolImbalance = poolLongUsd.sub(poolShortUsd);
      const poolImbalanceDir = poolImbalance.lt(0) ? "short-heavy" : poolImbalance.gt(0) ? "long-heavy" : "balanced";
      const virtualImbalanceDir = projectedVirtualImbalance.lt(0)
        ? "short-heavy"
        : projectedVirtualImbalance.gt(0)
        ? "long-heavy"
        : "balanced";

      const totalPool = poolLongUsd.add(poolShortUsd);

      // Calculate imbalance diff: |virtualImbalance| - |poolImbalance|
      const imbalanceDiff = projectedVirtualImbalance.abs().sub(poolImbalance.abs());

      // Calculate imbalance diff as % of market's total pool
      let imbalanceDiffPct = "N/A";
      if (totalPool.gt(0) && !isVirtualIdSet) {
        // Divide by 10^30 for price adjustment, then calculate percentage
        const pctValue = imbalanceDiff.mul(10000).div(totalPool).toNumber() / 100;
        imbalanceDiffPct = `${pctValue >= 0 ? "+" : ""}${pctValue.toFixed(1)}%`;
      }

      const marketName = marketConfig.tokens.indexToken
        ? `${marketConfig.tokens.indexToken} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}]`
        : `SWAP-ONLY [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}]`;

      // All values are now normalized to 30 decimals (USD)
      results.push({
        market: marketName,
        virtualIdSet: isVirtualIdSet ? "YES" : "NO",
        marketsInGroup: groupMarkets.length,
        poolLongUsd: `$${formatAmount(poolLongUsd, 30, 0)}`,
        poolShortUsd: `$${formatAmount(poolShortUsd, 30, 0)}`,
        poolImbalance: `$${formatAmount(poolImbalance.abs(), 30, 0)} ${poolImbalanceDir}`,
        virtualImbalance: `$${formatAmount(projectedVirtualImbalance.abs(), 30, 0)} ${virtualImbalanceDir}`,
        imbalanceDiff: isVirtualIdSet
          ? "Already linked"
          : imbalanceDiff.gt(0)
          ? `+$${formatAmount(imbalanceDiff, 30, 0)}`
          : imbalanceDiff.lt(0)
          ? `-$${formatAmount(imbalanceDiff.abs(), 30, 0)}`
          : "$0",
        imbalanceDiffPct: isVirtualIdSet ? "-" : imbalanceDiffPct,
      });
    }
  }

  // Sort results: missing virtualMarketId first (NO), then by markets in group descending, then by market name
  results.sort((a, b) => {
    if (a.virtualIdSet !== b.virtualIdSet) {
      return a.virtualIdSet === "NO" ? -1 : 1;
    }
    if (a.marketsInGroup !== b.marketsInGroup) {
      return b.marketsInGroup - a.marketsInGroup; // Larger groups first
    }
    return a.market.localeCompare(b.market);
  });

  // Output merged table
  console.log("\n=== ALL MARKETS ===\n");
  console.table(results);

  // Write CSV file
  const csvHeader = Object.keys(results[0] || {}).join(",");
  const csvRows = results.map((row) =>
    Object.values(row)
      .map((val) => `"${String(val).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csvContent = [csvHeader, ...csvRows].join("\n");

  const outDir = path.join(__dirname, "..", "out");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const csvPath = path.join(outDir, `simulate-virtual-market-id-fix-${hre.network.name}.csv`);
  fs.writeFileSync(csvPath, csvContent);
  console.log(`\nCSV saved to: ${csvPath}`);

  // Summary
  const missingCount = results.filter((r) => r.virtualIdSet === "NO").length;
  const setCount = results.filter((r) => r.virtualIdSet === "YES").length;

  console.log("\n=== Summary ===");
  console.log(`Total markets in config: ${markets.length}`);
  console.log(`Markets with virtualMarketId in config: ${markets.length - marketsWithoutConfig.length}`);
  console.log(`Markets without virtualMarketId in config: ${marketsWithoutConfig.length}`);
  console.log(`  - On-chain virtualMarketId set: ${setCount}`);
  console.log(`  - On-chain virtualMarketId missing: ${missingCount}`);

  if (marketsWithoutConfig.length > 0) {
    console.log(`\n=== Markets without virtualMarketId in config (${marketsWithoutConfig.length}) ===`);
    for (const name of marketsWithoutConfig) {
      console.log(`  ${name}`);
    }
  }

  // Show high-impact markets (those in large groups that are missing)
  const highImpactMarkets = results.filter((r) => r.virtualIdSet === "NO" && r.marketsInGroup > 5);
  if (highImpactMarkets.length > 0) {
    console.log("\n=== HIGH IMPACT MARKETS (missing, in groups > 5) ===");
    for (const m of highImpactMarkets) {
      console.log(`  ${m.market} - part of ${m.marketsInGroup}-market virtual pool`);
    }
  }

  if (missingCount > 0) {
    console.log("\n=== Impact Explanation ===");
    console.log("After the fix:");
    console.log("- Markets missing virtualMarketId will be linked to their virtual swap pool");
    console.log("- Swap price impact will be calculated against the combined pool of all linked markets");
    console.log("- The WORSE of (real pool impact, virtual pool impact) will be used");
    console.log("- Markets in larger groups (like SPOT:ETH/USD with 51 markets) will see the biggest change");
    console.log("\nRun setVirtualMarketIds.ts to apply the fix.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
