import { ethers } from "hardhat";
import * as path from "path";
import * as fs from "fs";
import { hashString } from "../utils/hash";
import { formatAmount } from "../utils/math";

const VIRTUAL_TOKEN_ID = hashString("VIRTUAL_TOKEN_ID");
const VIRTUAL_INVENTORY_FOR_POSITIONS = hashString("VIRTUAL_INVENTORY_FOR_POSITIONS");
const VIRTUAL_INVENTORY_FOR_POSITIONS_IN_TOKENS = hashString("VIRTUAL_INVENTORY_FOR_POSITIONS_IN_TOKENS");
const OPEN_INTEREST_IN_TOKENS = hashString("OPEN_INTEREST_IN_TOKENS");

// Pre-compute virtual token ID hashes for known assets to enable reverse lookup
const KNOWN_ASSETS: Record<string, { symbol: string; decimals: number }> = {};
const assetList = [
  { name: "BTC", decimals: 8 },
  { name: "LTC", decimals: 8 },
  { name: "ETH", decimals: 18 },
  { name: "SOL", decimals: 9 },
  { name: "DOGE", decimals: 8 },
  { name: "XRP", decimals: 6 },
  { name: "SHIB", decimals: 18 },
  { name: "PEPE", decimals: 18 },
  { name: "LINK", decimals: 18 },
  { name: "UNI", decimals: 18 },
  { name: "ARB", decimals: 18 },
  { name: "AVAX", decimals: 18 },
  { name: "AAVE", decimals: 18 },
  { name: "GMX", decimals: 18 },
  { name: "OP", decimals: 18 },
  { name: "ATOM", decimals: 6 },
  { name: "NEAR", decimals: 24 },
  { name: "APE", decimals: 18 },
  { name: "BNB", decimals: 18 },
  { name: "EIGEN", decimals: 18 },
  { name: "STX", decimals: 6 },
  { name: "SATS", decimals: 18 },
  { name: "ORDI", decimals: 18 },
  { name: "WIF", decimals: 6 },
  { name: "POL", decimals: 18 },
  { name: "SUI", decimals: 9 },
  { name: "SEI", decimals: 6 },
  { name: "APT", decimals: 8 },
  { name: "TIA", decimals: 6 },
  { name: "TRX", decimals: 6 },
  { name: "TON", decimals: 9 },
  { name: "TAO", decimals: 9 },
  { name: "BONK", decimals: 5 },
  { name: "WLD", decimals: 18 },
  { name: "BOME", decimals: 6 },
  { name: "MEME", decimals: 18 },
  { name: "FLOKI", decimals: 18 },
  { name: "MEW", decimals: 5 },
  { name: "PENDLE", decimals: 18 },
];
for (const asset of assetList) {
  const vtid = hashString(`PERP:${asset.name}/USD`);
  KNOWN_ASSETS[vtid] = { symbol: asset.name, decimals: asset.decimals };
}

function generateOiInTokensKey(marketToken: string, collateralToken: string, isLong: boolean): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "address", "bool"],
      [OPEN_INTEREST_IN_TOKENS, marketToken, collateralToken, isLong]
    )
  );
}

async function getTokenSymbol(address: string, collateralSymbols?: string[]): Promise<string> {
  try {
    const token = await ethers.getContractAt(["function symbol() view returns (string)"], address);
    return await token.symbol();
  } catch {
    // Infer symbol from collateral tokens for synthetic index tokens
    if (collateralSymbols) {
      for (const sym of collateralSymbols) {
        const upper = sym.toUpperCase();
        if (upper.includes("BTC") || upper.includes("WBTC") || upper.includes("TBTC")) return "BTC";
        if (upper.includes("DOGE")) return "DOGE";
        if (upper.includes("LTC")) return "LTC";
        if (upper.includes("XRP")) return "XRP";
        if (upper.includes("SHIB")) return "SHIB";
      }
    }
    return address.slice(0, 10);
  }
}

async function getTokenDecimals(address: string, symbol?: string, collateralSymbols?: string[]): Promise<number> {
  try {
    const token = await ethers.getContractAt(["function decimals() view returns (uint8)"], address);
    return await token.decimals();
  } catch {
    // Fallback based on known token patterns (check index symbol and collateral symbols)
    const allSymbols = [symbol || "", ...(collateralSymbols || [])].map((s) => s.toUpperCase());
    for (const sym of allSymbols) {
      // BTC and LTC both use 8 decimals
      if (sym.includes("BTC") || sym.includes("WBTC") || sym.includes("TBTC") || sym.includes("LTC")) {
        return 8;
      }
    }
    return 18;
  }
}

interface SyncResult {
  asset: string;
  markets: number;
  decimals: number;
  currentUsd: string;
  currentUsdDir: string;
  currentTokens: string;
  afterSyncTokens: string;
  afterSyncDir: string;
  longOi: string;
  shortOi: string;
}

async function main() {
  const deploymentsPath = path.join(__dirname, "../deployments/arbitrum");
  const dataStoreAddress = JSON.parse(fs.readFileSync(path.join(deploymentsPath, "DataStore.json"), "utf8")).address;
  const readerAddress = JSON.parse(fs.readFileSync(path.join(deploymentsPath, "Reader.json"), "utf8")).address;

  const dataStore = await ethers.getContractAt("DataStore", dataStoreAddress);
  const reader = await ethers.getContractAt("Reader", readerAddress);

  const markets = await reader.getMarkets(dataStore.address, 0, 150);

  // Group markets by virtualTokenId
  const marketsByVirtualId: Record<string, any[]> = {};

  console.log("Scanning markets for virtual token IDs...\n");

  for (const market of markets) {
    if (market.indexToken === ethers.constants.AddressZero) continue;

    const virtualTokenIdKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [VIRTUAL_TOKEN_ID, market.indexToken])
    );
    const virtualTokenId = await dataStore.getBytes32(virtualTokenIdKey);

    if (virtualTokenId !== ethers.constants.HashZero) {
      if (!marketsByVirtualId[virtualTokenId]) {
        marketsByVirtualId[virtualTokenId] = [];
      }
      marketsByVirtualId[virtualTokenId].push(market);
    }
  }

  const results: SyncResult[] = [];

  // For each virtual token ID, calculate what the synced value would be
  for (const [virtualTokenId, marketsWithId] of Object.entries(marketsByVirtualId)) {
    // First try to identify asset from known virtual token ID hashes
    const knownAsset = KNOWN_ASSETS[virtualTokenId];
    let indexSymbol: string;
    let indexDecimals: number;

    if (knownAsset) {
      indexSymbol = knownAsset.symbol;
      indexDecimals = knownAsset.decimals;
    } else {
      // Fallback: try to infer from collateral symbols
      const collateralSymbols = await Promise.all([
        getTokenSymbol(marketsWithId[0].longToken),
        getTokenSymbol(marketsWithId[0].shortToken),
      ]);
      indexSymbol = await getTokenSymbol(marketsWithId[0].indexToken, collateralSymbols);
      indexDecimals = await getTokenDecimals(marketsWithId[0].indexToken, indexSymbol, collateralSymbols);
    }

    // Get current virtual inventory values
    const virtualInventoryUsdKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [VIRTUAL_INVENTORY_FOR_POSITIONS, virtualTokenId])
    );
    const virtualInventoryUsd = await dataStore.getInt(virtualInventoryUsdKey);

    const virtualInventoryTokensKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32"],
        [VIRTUAL_INVENTORY_FOR_POSITIONS_IN_TOKENS, virtualTokenId]
      )
    );
    const virtualInventoryTokens = await dataStore.getInt(virtualInventoryTokensKey);

    // Calculate what syncVirtualPriceImpact would set
    let totalLongOiInTokens = ethers.BigNumber.from(0);
    let totalShortOiInTokens = ethers.BigNumber.from(0);

    for (const m of marketsWithId) {
      // Get OI in tokens for this market
      const [longOiLongCollat, longOiShortCollat, shortOiLongCollat, shortOiShortCollat] = await Promise.all([
        dataStore.getUint(generateOiInTokensKey(m.marketToken, m.longToken, true)),
        dataStore.getUint(generateOiInTokensKey(m.marketToken, m.shortToken, true)),
        dataStore.getUint(generateOiInTokensKey(m.marketToken, m.longToken, false)),
        dataStore.getUint(generateOiInTokensKey(m.marketToken, m.shortToken, false)),
      ]);

      const marketLongOi = longOiLongCollat.add(longOiShortCollat);
      const marketShortOi = shortOiLongCollat.add(shortOiShortCollat);

      totalLongOiInTokens = totalLongOiInTokens.add(marketLongOi);
      totalShortOiInTokens = totalShortOiInTokens.add(marketShortOi);
    }

    // syncVirtualPriceImpact calculates: shorts - longs
    const syncedVirtualInventory = totalShortOiInTokens.sub(totalLongOiInTokens);

    const currentUsdDir = virtualInventoryUsd.lt(0) ? "longs" : virtualInventoryUsd.gt(0) ? "shorts" : "balanced";
    const afterSyncDir = syncedVirtualInventory.lt(0) ? "longs" : syncedVirtualInventory.gt(0) ? "shorts" : "balanced";

    results.push({
      asset: indexSymbol,
      markets: marketsWithId.length,
      decimals: indexDecimals,
      currentUsd: `$${formatAmount(virtualInventoryUsd.abs(), 30, 0)}`,
      currentUsdDir,
      currentTokens: ethers.utils.formatUnits(virtualInventoryTokens.abs(), indexDecimals),
      afterSyncTokens: parseFloat(ethers.utils.formatUnits(syncedVirtualInventory.abs(), indexDecimals)).toFixed(2),
      afterSyncDir,
      longOi: parseFloat(ethers.utils.formatUnits(totalLongOiInTokens, indexDecimals)).toFixed(2),
      shortOi: parseFloat(ethers.utils.formatUnits(totalShortOiInTokens, indexDecimals)).toFixed(2),
    });
  }

  // Display table
  console.log("=".repeat(100));
  console.log("VIRTUAL INVENTORY SYNC PREVIEW");
  console.log("=".repeat(100));
  console.log("");
  console.log("Legend:");
  console.log("  currentUsd:       Current VIRTUAL_INVENTORY_FOR_POSITIONS (USD-based)");
  console.log("  currentTokens:    Current VIRTUAL_INVENTORY_FOR_POSITIONS_IN_TOKENS (all zeros)");
  console.log("  afterSyncTokens:  What syncVirtualPriceImpact would set (shorts - longs)");
  console.log("  longOi/shortOi:   Total OI in tokens across all markets sharing virtualTokenId");
  console.log("");

  console.table(results);

  // Export to CSV if requested
  if (process.env.CSV === "true") {
    const headers = Object.keys(results[0]);
    const csvRows = [
      headers.join(","),
      ...results.map((row) =>
        headers
          .map((header) => {
            const value = row[header as keyof SyncResult] ?? "";
            const strValue = String(value);
            if (strValue.includes(",") || strValue.includes('"') || strValue.includes("\n")) {
              return `"${strValue.replace(/"/g, '""')}"`;
            }
            return strValue;
          })
          .join(",")
      ),
    ];
    const csvContent = csvRows.join("\n");
    const csvPath = path.join(__dirname, "../out/checkVirtualInventorySync.csv");
    fs.writeFileSync(csvPath, csvContent);
    console.log(`\nCSV exported to: ${csvPath}`);
  }
}

main().catch(console.error);
