import hre from "hardhat";
import { ethers } from "ethers";
import got from "got";
import fs from "fs";
import path from "path";
import { formatAmount, bigNumberify, expandDecimals } from "../utils/math";
import * as keys from "../utils/keys";
import { getPositionCount, getPositionKeys } from "../utils/position";

// MARKET=<address> DISTRIBUTION_TYPE_ID=<number> START_BLOCK=<number> npx hardhat run scripts/generateMarketClaimsData.ts --network arbitrum
// e.g. MKR
// MARKET=0x2aE5c5Cd4843cf588AA8D1289894318130acc823 DISTRIBUTION_TYPE_ID=3001 START_BLOCK=314831762 npx hardhat run scripts/generateMarketClaimsData.ts --network arbitrum

if (!process.env.MARKET) {
  throw new Error("MARKET environment variable is required");
}
if (!process.env.DISTRIBUTION_TYPE_ID) {
  throw new Error("DISTRIBUTION_TYPE_ID environment variable is required");
}
if (!process.env.START_BLOCK) {
  throw new Error(
    "START_BLOCK environment variable is required (should be market deployment block or earlier to capture all GM token transfers)"
  );
}

const MARKET = process.env.MARKET;
const DISTRIBUTION_TYPE_ID = process.env.DISTRIBUTION_TYPE_ID;
const START_BLOCK = parseInt(process.env.START_BLOCK);
const DISTRIBUTION_TOKEN = process.env.DISTRIBUTION_TOKEN || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
const OUTPUT_DIR = process.env.OUTPUT_DIR || "scripts/distributions/out";

// Use deployed address on arbitrum mainnet
const REFERRAL_STORAGE_ADDRESS = "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d";

// Performance configuration
const BATCH_SIZE = 50; // Number of positions to fetch concurrently (reduce to avoid rate limits)
const BATCH_DELAY_MS = 100; // Delay between batches to avoid rate limiting

interface PositionData {
  account: string;
  isLong: boolean;
  collateralToken: string;
  collateralAmount: ethers.BigNumber;
  sizeInUsd: ethers.BigNumber;
  netValueUsd: ethers.BigNumber;
}

interface GMHolderData {
  account: string;
  gmBalance: ethers.BigNumber;
  gmValueUsd: ethers.BigNumber;
}

interface ClaimsData {
  chainId: number;
  distributionTypeId: string;
  token: string;
  totalAmount: string;
  amounts: Record<string, string>;
}

async function getMarketPrices(market: any): Promise<any> {
  const tickersUrl = "https://arbitrum-api.gmxinfra2.io/prices/tickers";
  const tickers = (await got(tickersUrl).json()) as any[];

  const indexTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.indexToken.toLowerCase());
  const longTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.longToken.toLowerCase());
  const shortTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.shortToken.toLowerCase());

  // Check for missing prices and fail if any are not found
  const missingPrices: string[] = [];
  if (!indexTicker && market.indexToken !== ethers.constants.AddressZero) {
    missingPrices.push(`Index token (${market.indexToken})`);
  }
  if (!longTicker) {
    missingPrices.push(`Long token (${market.longToken})`);
  }
  if (!shortTicker) {
    missingPrices.push(`Short token (${market.shortToken})`);
  }
  if (missingPrices.length > 0) {
    console.error("Missing prices for:");
    missingPrices.forEach((token) => console.error(`  - ${token}`));
    throw new Error("Missing required token prices from API");
  }

  return {
    indexTokenPrice: indexTicker,
    longTokenPrice: longTicker,
    shortTokenPrice: shortTicker,
  };
}

async function analyzePositions(
  marketAddress: string,
  dataStore: any,
  reader: any,
  referralStorage: any,
  market: any,
  prices: any
): Promise<PositionData[]> {
  const positions: PositionData[] = [];

  console.log("Analyzing positions...");

  // Check open interest first for efficiency
  // Format: openInterestKey(market, collateralToken, isLong)
  const longCollateralLongPositions = await dataStore.getUint(
    keys.openInterestKey(marketAddress, market.longToken, true)
  );
  const longCollateralShortPositions = await dataStore.getUint(
    keys.openInterestKey(marketAddress, market.longToken, false)
  );
  const shortCollateralShortPositions = await dataStore.getUint(
    keys.openInterestKey(marketAddress, market.shortToken, false)
  );
  const shortCollateralLongPositions = await dataStore.getUint(
    keys.openInterestKey(marketAddress, market.shortToken, true)
  );

  const totalOpenInterest = longCollateralLongPositions
    .add(longCollateralShortPositions)
    .add(shortCollateralShortPositions)
    .add(shortCollateralLongPositions);

  console.log(`  Long collateral, Long position: ${formatAmount(longCollateralLongPositions, 30, 2)} USD`);
  console.log(`  Long collateral, Short position: ${formatAmount(longCollateralShortPositions, 30, 2)} USD`);
  console.log(`  Short collateral, Short position: ${formatAmount(shortCollateralShortPositions, 30, 2)} USD`);
  console.log(`  Short collateral, Long position: ${formatAmount(shortCollateralLongPositions, 30, 2)} USD`);
  console.log(`  Total Open Interest: ${formatAmount(totalOpenInterest, 30, 2)} USD`);

  if (totalOpenInterest.eq(0)) {
    console.log("  No open positions found");
    return positions;
  }

  // Get all position keys
  const positionCount = await getPositionCount(dataStore);
  console.log(`  Total positions in system: ${positionCount.toString()}`);

  const positionKeys = await getPositionKeys(dataStore, 0, positionCount);
  console.log(`  Scanning ${positionKeys.length} positions to find matches for market: ${marketAddress}`);

  // Process positions in batches
  let processedCount = 0;

  for (let i = 0; i < positionKeys.length; i += BATCH_SIZE) {
    const batch = positionKeys.slice(i, i + BATCH_SIZE);

    // Fetch all positions in this batch concurrently
    const batchPromises = batch.map(async (positionKey: string) => {
      try {
        const position = await reader.getPosition(dataStore.address, positionKey);

        // Only fetch detailed info if it matches our market
        if (position.addresses.market.toLowerCase() === marketAddress.toLowerCase()) {
          // Format prices for getPositionInfo
          const marketPrices = {
            indexTokenPrice: {
              min: prices.indexTokenPrice.minPrice,
              max: prices.indexTokenPrice.maxPrice,
            },
            longTokenPrice: {
              min: prices.longTokenPrice.minPrice,
              max: prices.longTokenPrice.maxPrice,
            },
            shortTokenPrice: {
              min: prices.shortTokenPrice.minPrice,
              max: prices.shortTokenPrice.maxPrice,
            },
          };

          // Get calculated position info with real-time PnL and fees
          const positionInfo = await reader.getPositionInfo(
            dataStore.address,
            referralStorage.address,
            positionKey,
            marketPrices,
            0, // sizeDeltaUsd - use 0 to get current values
            ethers.constants.AddressZero, // uiFeeReceiver
            true // usePositionSizeAsSizeDeltaUsd
          );

          return { positionKey, position, positionInfo };
        }

        return { positionKey, position, positionInfo: null };
      } catch (error: any) {
        console.error(`  Error fetching position ${positionKey}:`, error.message);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);

    // Process batch results
    for (const result of batchResults) {
      if (!result || !result.position || !result.positionInfo) continue;

      const { positionKey, position, positionInfo } = result;

      // Get collateral token price
      const collateralToken = position.addresses.collateralToken.toLowerCase();
      let collateralTokenPrice: number;

      if (collateralToken === market.longToken.toLowerCase()) {
        collateralTokenPrice = prices.longTokenPrice.maxPrice;
      } else if (collateralToken === market.shortToken.toLowerCase()) {
        collateralTokenPrice = prices.shortTokenPrice.maxPrice;
      } else {
        throw new Error(`Unknown collateral token for position ${positionKey}: ${collateralToken}`);
      }

      // Convert collateral amount to USD (30 decimals)
      const collateralAmount = position.numbers.collateralAmount || bigNumberify(0);
      const collateralUsd = collateralAmount.mul(collateralTokenPrice);

      // Use calculated values from positionInfo
      const pnlUsd = positionInfo.pnlAfterPriceImpactUsd || bigNumberify(0); // Real-time PnL including price impact at close

      // Convert total fees from tokens to USD
      // totalCostAmount is in collateral tokens
      const totalFeesInTokens = positionInfo.fees.totalCostAmount || bigNumberify(0);
      const totalFeesUsd = totalFeesInTokens.mul(collateralTokenPrice);

      // Net value = collateral + PnL - fees
      const netValue = collateralUsd.add(pnlUsd).sub(totalFeesUsd);

      // Only include positions with positive net value
      if (netValue.gt(0)) {
        positions.push({
          account: position.addresses.account,
          isLong: position.flags.isLong,
          collateralToken: position.addresses.collateralToken,
          collateralAmount: collateralAmount,
          sizeInUsd: position.numbers.sizeInUsd,
          netValueUsd: netValue,
        });
      }
    }

    processedCount += batch.length;

    // Show progress after each batch (overwrites previous line)
    process.stdout.write(`\r  Processed ${processedCount}/${positionKeys.length}`);

    // Add delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < positionKeys.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Move to next line after progress is complete
  process.stdout.write("\n");

  console.log(`  Found ${positions.length} positions.`);

  return positions;
}

async function analyzeGMHolders(
  marketToken: any,
  reader: any,
  dataStore: any,
  market: any,
  prices: any,
  endBlock: number
): Promise<GMHolderData[]> {
  const holders: GMHolderData[] = [];

  console.log("Analyzing GM token holders...");

  // Query Transfer events to find all holders
  const filter = marketToken.filters.Transfer();
  const events = await marketToken.queryFilter(filter, START_BLOCK, endBlock);

  const addresses = new Set<string>();
  for (const event of events) {
    if (event.args) {
      addresses.add(event.args.from);
      addresses.add(event.args.to);
    }
  }

  addresses.delete(ethers.constants.AddressZero);
  console.log(`  Found ${addresses.size} addresses with transfer history`);

  // Get market token price
  const indexTokenPrice = {
    min: prices.indexTokenPrice.minPrice || prices.indexTokenPrice.min,
    max: prices.indexTokenPrice.maxPrice || prices.indexTokenPrice.max,
  };
  const longTokenPrice = {
    min: prices.longTokenPrice.minPrice || prices.longTokenPrice.min,
    max: prices.longTokenPrice.maxPrice || prices.longTokenPrice.max,
  };
  const shortTokenPrice = {
    min: prices.shortTokenPrice.minPrice || prices.shortTokenPrice.min,
    max: prices.shortTokenPrice.maxPrice || prices.shortTokenPrice.max,
  };

  const marketTokenPrice = await reader.getMarketTokenPrice(
    dataStore.address,
    market,
    indexTokenPrice,
    longTokenPrice,
    shortTokenPrice,
    keys.MAX_PNL_FACTOR_FOR_TRADERS,
    true
  );

  const gmPrice = marketTokenPrice[0];

  // Check balance for each address
  let activeHolders = 0;
  for (const address of addresses) {
    const balance = await marketToken.balanceOf(address);

    if (balance.gt(0)) {
      const valueUsd = balance.mul(gmPrice).div(ethers.utils.parseEther("1"));

      holders.push({
        account: address,
        gmBalance: balance,
        gmValueUsd: valueUsd,
      });
      activeHolders++;
    }
  }

  console.log(`  Active GM holders: ${activeHolders}`);
  console.log(`  GM Token Price: ${formatAmount(gmPrice, 30, 4)} USD`);

  return holders;
}

function generateTraderClaimsData(
  positions: PositionData[],
  distributionToken: string,
  distributionTokenDecimals: number,
  distributionTypeId: string
): ClaimsData {
  // Aggregate positions by account (traders may have multiple positions)
  const accountTotals = new Map<string, ethers.BigNumber>();

  for (const position of positions) {
    const account = position.account.toLowerCase();
    const netValueUsd = position.netValueUsd;

    if (netValueUsd.gt(0)) {
      const existing = accountTotals.get(account) || bigNumberify(0);
      accountTotals.set(account, existing.add(netValueUsd));
    }
  }

  // Convert USD values to distribution token amounts
  const amounts: Record<string, string> = {};
  let totalAmount = bigNumberify(0);

  for (const [account, valueUsd] of accountTotals.entries()) {
    // Convert USD value (30 decimals) to distribution token decimals
    const distributionAmount = valueUsd.div(expandDecimals(1, 30 - distributionTokenDecimals));

    amounts[account] = distributionAmount.toString();
    totalAmount = totalAmount.add(distributionAmount);
  }

  return {
    chainId: 42161, // Arbitrum
    distributionTypeId: distributionTypeId,
    token: distributionToken,
    totalAmount: totalAmount.toString(),
    amounts,
  };
}

async function main() {
  // Get configuration from environment variables
  const marketAddress = MARKET;
  const blockNumberParam = await hre.ethers.provider.getBlockNumber().then((n) => n.toString());
  const blockNumber = parseInt(blockNumberParam);
  const distributionToken = DISTRIBUTION_TOKEN;
  const distributionTypeId = DISTRIBUTION_TYPE_ID;
  const outputDir = OUTPUT_DIR;

  console.log("=".repeat(80));
  console.log("MARKET ANALYSIS & DISTRIBUTION");
  console.log("=".repeat(80));
  console.log(`Market Address: ${marketAddress}`);
  console.log(`Block Number: ${blockNumber}`);
  console.log(`Distribution Token: ${distributionToken}`);
  console.log("");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Initialize contracts
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const marketToken = await hre.ethers.getContractAt("MarketToken", marketAddress);

  // Get market info
  const market = await reader.getMarket(dataStore.address, marketAddress);
  const totalSupply = await marketToken.totalSupply();

  console.log("Market Information:");
  console.log(`  Index Token: ${market.indexToken}`);
  console.log(`  Long Token: ${market.longToken}`);
  console.log(`  Short Token: ${market.shortToken}`);
  console.log(`  GM Total Supply: ${formatAmount(totalSupply, 18, 6)}`);
  console.log("");

  // Get market prices
  const prices = await getMarketPrices(market);

  // Get token info and symbols (needed for display)
  const tokens = await hre.gmx.getTokens();
  const findTokenSymbol = (address: string): string => {
    if (address === ethers.constants.AddressZero) return "ZERO";
    const entry = Object.entries(tokens).find(
      ([_, token]: [string, any]) => token.address.toLowerCase() === address.toLowerCase()
    );
    return entry ? entry[0] : address.slice(0, 8);
  };
  const findTokenDecimals = (address: string): number => {
    const entry = Object.entries(tokens).find(
      ([_, token]: [string, any]) => token.address.toLowerCase() === address.toLowerCase()
    );
    return entry ? (entry[1] as any).decimals : 18;
  };

  console.log("=".repeat(80));
  console.log("SECTION 1: TRADERS (POSITIONS)");
  console.log("=".repeat(80));

  const referralStorage = await hre.ethers.getContractAt("ReferralStorage", REFERRAL_STORAGE_ADDRESS);

  // Analyze positions
  const positions = await analyzePositions(marketAddress, dataStore, reader, referralStorage, market, prices);

  // Display trader summary
  const totalPositionValue = positions.reduce((sum, p) => sum.add(p.netValueUsd), bigNumberify(0));

  console.log(`  Total Net Value: ${formatAmount(totalPositionValue, 30, 2)} USD`);
  console.log("");

  if (positions.length > 0) {
    console.log("Trader Positions:");
    console.log("-".repeat(110));
    console.log(
      "Account                                    | Side  | Collateral      | Size (USD)   | Net Value (USD)"
    );
    console.log("-".repeat(110));

    const sortedPositions = [...positions].sort((a, b) => (b.netValueUsd.gt(a.netValueUsd) ? 1 : -1));
    for (const p of sortedPositions) {
      const collateralSymbol = findTokenSymbol(p.collateralToken);
      const collateralDecimals = findTokenDecimals(p.collateralToken);
      const collateralTokenAmountFormatted = formatAmount(p.collateralAmount, collateralDecimals, 6);
      const side = p.isLong ? "Long " : "Short";

      console.log(
        `${p.account} | ${side} | ${collateralTokenAmountFormatted.padStart(10)} ${collateralSymbol.padEnd(4)} | ` +
          `${formatAmount(p.sizeInUsd, 30, 2).padStart(12)} | ` +
          `${formatAmount(p.netValueUsd, 30, 2).padStart(14)}`
      );
    }

    console.log("-".repeat(110));
    console.log(
      `${"TOTAL".padEnd(42)} | ${" ".repeat(5)} | ${" ".repeat(15)} | ` +
        `${" ".repeat(12)} | ` +
        `${formatAmount(totalPositionValue, 30, 2).padStart(14)}`
    );
  }

  // Get distribution token decimals and market token symbols
  let distributionTokenDecimals = 6; // Default for USDC
  const indexTokenSymbol = findTokenSymbol(market.indexToken);
  const longTokenSymbol = findTokenSymbol(market.longToken);
  const shortTokenSymbol = findTokenSymbol(market.shortToken);

  const tokenConfig = Object.values(tokens).find(
    (token: any) => token.address.toLowerCase() === distributionToken.toLowerCase()
  );
  if (tokenConfig) {
    distributionTokenDecimals = (tokenConfig as any).decimals;
  }

  // Generate claims data for traders
  const claimsData = generateTraderClaimsData(
    positions,
    distributionToken,
    distributionTokenDecimals,
    distributionTypeId
  );

  // Save claims data file
  const claimsFilename = indexTokenSymbol
    ? `GM-${indexTokenSymbol}-${longTokenSymbol}-${shortTokenSymbol}-claims.json`
    : `GM-${marketAddress.slice(2, 8).toLowerCase()}-claims.json`;
  const claimsFilepath = path.join(outputDir, claimsFilename);
  fs.writeFileSync(claimsFilepath, JSON.stringify(claimsData, null, 2));

  console.log(`\nClaims Data File: ${claimsFilepath}\n\n`);

  console.log("=".repeat(80));
  console.log("SECTION 2: LPs (GM TOKEN HOLDERS)");
  console.log("=".repeat(80));

  const gmHolders = await analyzeGMHolders(marketToken, reader, dataStore, market, prices, blockNumber);

  // Display LP summary
  const totalGMBalance = gmHolders.reduce((sum, h) => sum.add(h.gmBalance), bigNumberify(0));

  console.log(
    `  Total GM Balance: ${formatAmount(totalGMBalance, 18, 6)} (${formatAmount(
      totalGMBalance.mul(10000).div(totalSupply),
      2,
      2
    )}% of total supply)`
  );
  console.log("");

  if (gmHolders.length > 0) {
    console.log("GM Token Holders:");
    console.log("-".repeat(80));
    console.log("Account                                    | GM Balance         | % of Supply");
    console.log("-".repeat(80));

    const sortedHolders = [...gmHolders].sort((a, b) => (b.gmValueUsd.gt(a.gmValueUsd) ? 1 : -1));
    for (const h of sortedHolders) {
      const gmBalanceFormatted = formatAmount(h.gmBalance, 18, 6);
      const percentOfSupply = h.gmBalance.mul(10000).div(totalSupply); // basis points
      const percentFormatted = formatAmount(percentOfSupply, 2, 2);

      console.log(`${h.account} | ${gmBalanceFormatted.padStart(18)} | ${percentFormatted.padStart(10)}%`);
    }

    console.log("-".repeat(80));
    console.log(
      `${"TOTAL".padEnd(42)} | ${formatAmount(totalGMBalance, 18, 6).padStart(18)} | ${formatAmount(
        totalGMBalance.mul(10000).div(totalSupply),
        2,
        2
      ).padStart(10)}%`
    );
  }
  console.log("");
}

main()
  .then(() => {
    console.log("Market analysis complete.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
