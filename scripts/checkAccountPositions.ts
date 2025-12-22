/**
 * Script to check which markets have open positions for a given account.
 *
 * This complements createMarketsOrders.ts - after creating orders, use this script
 * to verify which orders actually got executed (filled) vs just created but not executed.
 *
 * Usage:
 *   ACCOUNT=0x1234... npx hardhat run scripts/checkAccountPositions.ts --network arbitrum
 *   ACCOUNT=0x1234... npx hardhat run scripts/checkAccountPositions.ts --network avalanche
 *
 * Environment Variables:
 *   ACCOUNT - The account address to check (required)
 */

import hre from "hardhat";
import { formatAmount } from "../utils/math";

interface PositionData {
  market: string;
  marketToken: string;
  indexSymbol: string;
  longSymbol: string;
  shortSymbol: string;
  direction: "Long" | "Short";
  sizeInUsd: string;
  collateralSymbol: string;
  collateralAmount: string;
}

async function getTokenSymbol(tokenAddress: string, tokens: Record<string, any>): Promise<string> {
  const entry = Object.entries(tokens).find(
    ([, config]) => (config as any).address?.toLowerCase() === tokenAddress.toLowerCase()
  );
  if (entry) {
    return entry[0];
  }
  // Fallback: return full address
  return tokenAddress;
}

async function main() {
  const account = process.env.ACCOUNT;

  if (!account) {
    console.error("Error: ACCOUNT environment variable is required");
    console.error("Usage: ACCOUNT=0x1234... npx hardhat run scripts/checkAccountPositions.ts --network arbitrum");
    process.exit(1);
  }

  console.log(`\nChecking positions for account: ${account}`);
  console.log(`Network: ${hre.network.name}\n`);

  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const tokens = await (hre as any).gmx.getTokens();

  // Get all positions for the account
  console.log("Fetching account positions...");
  const positions = await reader.getAccountPositions(dataStore.address, account, 0, 1000);
  console.log(`Found ${positions.length} position(s)\n`);

  if (positions.length === 0) {
    console.log("No positions found for this account.");
    return;
  }

  // Build map: marketToken -> positions[]
  const positionsByMarket: Record<string, any[]> = {};
  for (const pos of positions) {
    const marketToken = pos.addresses.market.toLowerCase();
    if (!positionsByMarket[marketToken]) {
      positionsByMarket[marketToken] = [];
    }
    positionsByMarket[marketToken].push(pos);
  }

  // Get all markets
  console.log("Fetching markets...");
  const markets = await reader.getMarkets(dataStore.address, 0, 500);
  console.log(`Found ${markets.length} market(s)\n`);

  // Process positions and build display data
  const positionData: PositionData[] = [];
  const marketsWithPositions = new Set<string>();
  const marketsWithoutPositions: string[] = [];

  for (const market of markets) {
    const marketToken = market.marketToken.toLowerCase();
    const marketPositions = positionsByMarket[marketToken] || [];

    // Get token symbols
    const indexSymbol = await getTokenSymbol(market.indexToken, tokens);
    const longSymbol = await getTokenSymbol(market.longToken, tokens);
    const shortSymbol = await getTokenSymbol(market.shortToken, tokens);
    const marketLabel = `${indexSymbol} [${longSymbol}-${shortSymbol}]`;

    if (marketPositions.length === 0) {
      marketsWithoutPositions.push(marketLabel);
    } else {
      marketsWithPositions.add(marketToken);

      for (const pos of marketPositions) {
        const isLong = pos.flags.isLong;
        const collateralSymbol = await getTokenSymbol(pos.addresses.collateralToken, tokens);
        const collateralToken = Object.entries(tokens).find(
          ([, config]) => (config as any).address?.toLowerCase() === pos.addresses.collateralToken.toLowerCase()
        );
        const collateralDecimals = collateralToken ? (collateralToken[1] as any).decimals : 18;

        positionData.push({
          market: marketLabel,
          marketToken: market.marketToken,
          indexSymbol,
          longSymbol,
          shortSymbol,
          direction: isLong ? "Long" : "Short",
          sizeInUsd: `$${formatAmount(pos.numbers.sizeInUsd, 30, 2, true)}`,
          collateralSymbol,
          collateralAmount: formatAmount(pos.numbers.collateralAmount, collateralDecimals, 4, true),
        });
      }
    }
  }

  // Sort positions by market name
  positionData.sort((a, b) => a.market.localeCompare(b.market));

  // Display table
  console.log("=".repeat(100));
  console.log("POSITIONS");
  console.log("=".repeat(100));
  console.log("");

  // Calculate column widths
  const marketWidth = Math.max(25, ...positionData.map((p) => p.market.length));
  const dirWidth = 6;
  const sizeWidth = 15;
  const collateralWidth = 20;

  // Header
  console.log(
    `${"Market".padEnd(marketWidth)} | ${"Dir".padEnd(dirWidth)} | ${"Size (USD)".padEnd(sizeWidth)} | Collateral`
  );
  console.log(
    `${"-".repeat(marketWidth)}-|-${"-".repeat(dirWidth)}-|-${"-".repeat(sizeWidth)}-|-${"-".repeat(collateralWidth)}`
  );

  // Rows
  for (const pos of positionData) {
    console.log(
      `${pos.market.padEnd(marketWidth)} | ${pos.direction.padEnd(dirWidth)} | ${pos.sizeInUsd.padEnd(sizeWidth)} | ${
        pos.collateralAmount
      } ${pos.collateralSymbol}`
    );
  }

  console.log("");

  // Summary
  console.log("=".repeat(100));
  console.log("SUMMARY");
  console.log("=".repeat(100));
  console.log(`  Total positions: ${positions.length}`);
  console.log(`  Markets with positions: ${marketsWithPositions.size}`);
  console.log(`  Markets without positions: ${marketsWithoutPositions.length}`);
  console.log("");

  // List markets without positions
  if (marketsWithoutPositions.length > 0) {
    console.log("Markets without positions:");
    for (const market of marketsWithoutPositions.sort()) {
      console.log(`  - ${market}`);
    }
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
