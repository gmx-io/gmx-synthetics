/**
 * This script simulates the price impact changes that would occur after the virtualTokenId is correctly set for all markets.
 *
 * Output columns:
 * - market: INDEX [LONG-SHORT] market identifier
 * - virtualIdSet: whether virtualTokenId is set on-chain
 * - marketsInGroup: number of markets sharing the same virtualTokenId
 * - marketTotalOi: this market's total OI (longs + shorts)
 * - marketOiImbalance: this market's OI imbalance (shorts - longs)
 * - virtualImbalance: combined OI imbalance across all markets in the group
 * - imbalanceDiff: |virtualImbalance| - |marketImbalance|, additional imbalance after linking
 * - imbalanceDiffPct: imbalanceDiff / marketTotalOi * 100
 */

import hre from "hardhat";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { formatAmount, bigNumberify } from "../utils/math";
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";
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
  console.log("VIRTUAL INVENTORY FIX SIMULATION");
  console.log("=".repeat(100));
  console.log("\nThis script shows how price impact would change after fixing virtualTokenId for all markets.");
  console.log("OI values are calculated as OPEN_INTEREST_IN_TOKENS × current.\n");

  // Group markets by virtualTokenIdForIndexToken from config
  const marketsByVirtualTokenId: Record<string, any[]> = {};
  const marketsWithoutConfig: string[] = [];
  for (const market of markets) {
    const key = market.virtualTokenIdForIndexToken;
    if (key === undefined) {
      const name = market.tokens.indexToken
        ? `${market.tokens.indexToken} [${market.tokens.longToken}-${market.tokens.shortToken}]`
        : `SWAP-ONLY [${market.tokens.longToken}-${market.tokens.shortToken}]`;
      marketsWithoutConfig.push(name);
      continue;
    }
    if (!marketsByVirtualTokenId[key]) marketsByVirtualTokenId[key] = [];
    marketsByVirtualTokenId[key].push(market);
  }

  const results: any[] = [];

  for (const [, groupMarkets] of Object.entries(marketsByVirtualTokenId)) {
    const firstMarket = groupMarkets[0];
    const indexTokenSymbol = firstMarket.tokens.indexToken;
    const indexTokenAddress = tokens[indexTokenSymbol]?.address;

    if (!indexTokenAddress) {
      console.log(`[WARN] No address for token: ${indexTokenSymbol}`);
      continue;
    }

    // Get index token price from ticker API
    const indexTicker = tickersByTokenAddress[indexTokenAddress.toLowerCase()];
    if (!indexTicker) {
      console.log(`[WARN] No price for token: ${indexTokenSymbol} (${indexTokenAddress})`);
      continue;
    }
    const indexPrice = indexTicker.price.min; // Use min price for conservative estimate

    // Check if virtualTokenId is set on-chain for this index token
    const onchainVirtualTokenId = await dataStore.getBytes32(keys.virtualTokenIdKey(indexTokenAddress));
    const isVirtualIdSet = onchainVirtualTokenId !== ethers.constants.HashZero;

    // Calculate what the virtual inventory would be after sync
    // (sum of shorts - longs across all markets in the group)
    // Using OPEN_INTEREST_IN_TOKENS × indexPrice to match dashboard calculation
    let totalLongOiUsd = bigNumberify(0);
    let totalShortOiUsd = bigNumberify(0);

    for (const marketConfig of groupMarkets) {
      const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
      const marketKey = getMarketKey(indexToken, longToken, shortToken);
      const onchainMarket = onchainMarketsByTokens[marketKey];

      if (!onchainMarket) continue;

      // Check for homogeneous markets (longToken === shortToken) to avoid double-counting
      const isHomogeneous = longToken.toLowerCase() === shortToken.toLowerCase();

      // Get open interest in TOKENS for this market
      if (isHomogeneous) {
        // Homogeneous market: only query with one collateral token
        const [longOiTokens, shortOiTokens] = await Promise.all([
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, true])
            )
          ),
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, false])
            )
          ),
        ]);
        // Convert tokens to USD: tokens × price
        totalLongOiUsd = totalLongOiUsd.add(longOiTokens.mul(indexPrice));
        totalShortOiUsd = totalShortOiUsd.add(shortOiTokens.mul(indexPrice));
      } else {
        // Heterogeneous market: query both collateral tokens
        const [longOi1Tokens, longOi2Tokens, shortOi1Tokens, shortOi2Tokens] = await Promise.all([
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, true])
            )
          ),
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.shortToken, true])
            )
          ),
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, false])
            )
          ),
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.shortToken, false])
            )
          ),
        ]);
        // Convert tokens to USD: tokens × price
        totalLongOiUsd = totalLongOiUsd.add(longOi1Tokens.add(longOi2Tokens).mul(indexPrice));
        totalShortOiUsd = totalShortOiUsd.add(shortOi1Tokens.add(shortOi2Tokens).mul(indexPrice));
      }
    }

    // Virtual inventory = shorts - longs (in USD)
    const projectedVirtualInventory = totalShortOiUsd.sub(totalLongOiUsd);

    for (const marketConfig of groupMarkets) {
      const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
      const marketKey = getMarketKey(indexToken, longToken, shortToken);
      const onchainMarket = onchainMarketsByTokens[marketKey];

      if (!onchainMarket) continue;

      // Check for homogeneous markets
      const isHomogeneous = longToken.toLowerCase() === shortToken.toLowerCase();

      // Get this specific market's OI in TOKENS
      let marketLongOiTokens: BigNumber;
      let marketShortOiTokens: BigNumber;

      if (isHomogeneous) {
        const [longOiTokens, shortOiTokens] = await Promise.all([
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, true])
            )
          ),
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, false])
            )
          ),
        ]);
        marketLongOiTokens = longOiTokens;
        marketShortOiTokens = shortOiTokens;
      } else {
        const [longOi1Tokens, longOi2Tokens, shortOi1Tokens, shortOi2Tokens] = await Promise.all([
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, true])
            )
          ),
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.shortToken, true])
            )
          ),
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, false])
            )
          ),
          dataStore.getUint(
            getFullKey(
              keys.OPEN_INTEREST_IN_TOKENS,
              encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.shortToken, false])
            )
          ),
        ]);
        marketLongOiTokens = longOi1Tokens.add(longOi2Tokens);
        marketShortOiTokens = shortOi1Tokens.add(shortOi2Tokens);
      }

      // Convert tokens to USD using current index price
      const marketLongOi = marketLongOiTokens.mul(indexPrice);
      const marketShortOi = marketShortOiTokens.mul(indexPrice);

      const marketImbalance = marketShortOi.sub(marketLongOi);
      const marketImbalanceDir = marketImbalance.lt(0) ? "longs" : marketImbalance.gt(0) ? "shorts" : "balanced";
      const virtualImbalanceDir = projectedVirtualInventory.lt(0)
        ? "longs"
        : projectedVirtualInventory.gt(0)
        ? "shorts"
        : "balanced";

      const marketTotalOi = marketLongOi.add(marketShortOi);

      // Calculate imbalance diff: |virtualImbalance| - |marketImbalance|
      // For single-market tokens (marketsInGroup=1), this should be ~0
      // For multi-market tokens, this shows how much additional imbalance this market will see
      const imbalanceDiff = projectedVirtualInventory.abs().sub(marketImbalance.abs());

      // Calculate imbalance diff as % of market's total OI
      let imbalanceDiffPct = "N/A";
      if (marketTotalOi.gt(0) && !isVirtualIdSet) {
        const pctValue = imbalanceDiff.mul(10000).div(marketTotalOi).toNumber() / 100;
        imbalanceDiffPct = `${pctValue >= 0 ? "+" : ""}${pctValue.toFixed(1)}%`;
      }

      results.push({
        market: `${marketConfig.tokens.indexToken} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}]`,
        virtualIdSet: isVirtualIdSet ? "YES" : "NO",
        marketsInGroup: groupMarkets.length,
        marketTotalOi: `$${formatAmount(marketTotalOi, 30, 0)}`,
        marketOiImbalance: `$${formatAmount(marketImbalance.abs(), 30, 0)} ${marketImbalanceDir}`,
        virtualImbalance: `$${formatAmount(projectedVirtualInventory.abs(), 30, 0)} ${virtualImbalanceDir}`,
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

  // Sort results: already linked first, single-market groups last, then by market name
  results.sort((a, b) => {
    if (a.virtualIdSet !== b.virtualIdSet) {
      return a.virtualIdSet === "YES" ? -1 : 1;
    }
    if (a.marketsInGroup !== b.marketsInGroup) {
      // marketsInGroup === 1 goes to the end
      if (a.marketsInGroup === 1) return 1;
      if (b.marketsInGroup === 1) return -1;
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

  const csvPath = path.join(outDir, `simulate-virtual-token-id-fix-${hre.network.name}.csv`);
  fs.writeFileSync(csvPath, csvContent);
  console.log(`\nCSV saved to: ${csvPath}`);

  // Summary
  const missingCount = results.filter((r) => r.virtualIdSet === "NO").length;
  const setCount = results.filter((r) => r.virtualIdSet === "YES").length;

  console.log("\n=== Summary ===");
  console.log(`Total markets in config: ${markets.length}`);
  console.log(`Markets with virtualTokenId in config: ${markets.length - marketsWithoutConfig.length}`);
  console.log(`Markets without virtualTokenId in config: ${marketsWithoutConfig.length}`);
  console.log(`  - On-chain virtualTokenId set: ${setCount}`);
  console.log(`  - On-chain virtualTokenId missing: ${missingCount}`);

  if (marketsWithoutConfig.length > 0) {
    console.log(`\n=== Markets without virtualTokenId in config (${marketsWithoutConfig.length}) ===`);
    for (const name of marketsWithoutConfig) {
      console.log(`  ${name}`);
    }
  }

  if (missingCount > 0) {
    console.log("\n=== Impact Explanation ===");
    console.log("After the fix:");
    console.log("- Markets missing virtualTokenId will be linked to their index token's virtual inventory");
    console.log("- Price impact will be calculated against the combined OI of all linked markets");
    console.log("- The WORSE of (real market impact, virtual pool impact) will be used");
    console.log("- Markets with larger virtual imbalance may see higher price impact for new positions");
    console.log("\nRun setVirtualTokenIds.ts followed by syncVirtualPriceImpact.ts to apply the fix.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
