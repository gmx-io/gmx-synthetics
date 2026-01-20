import hre from "hardhat";
import { ethers } from "ethers";
import got from "got";
import { formatAmount, bigNumberify } from "../utils/math";
import { getPositionCount, getPositionKeys } from "../utils/position";

/**
 * Find current positions for which (InsufficientFundingFeePayment would be emitted if closed now):
 *   1. pendingFundingFees > 0 (position owes funding fees)
 *   2. basePnlUsd > 0 (position is in profit → not liquidatable)
 *   3. pnlToken != collateralToken (token mismatch)
 *   4. collateralAmount < pendingFundingFees (insufficient collateral)
 *
 * Background:
 * - In GMX, users can choose their collateral token independently of position direction
 * - For long positions: PnL is realized in longToken
 * - For short positions: PnL is realized in shortToken
 * - Funding fees are always deducted from the collateral token
 *
 * Problem:
 * A position can become "underwater" on its collateral token while still being healthy overall.
 *
 * Example (OP/USD market):
 *   - User opens SHORT position with OP as collateral (not USDC)
 *   - OP price drops → position is in profit (profit realized in USDC)
 *   - Funding fees accrue (shorts paying longs) → deducted from OP collateral
 *   - If funding fees (in OP) > collateral (in OP), there's an OP shortfall
 *   - BUT position isn't liquidatable because USDC profit covers the overall value
 *
 * Usage:
 *   GM: OP/USD [OP-USDC] --> 3 positions found
 *   MARKET=0x4fDd333FF9cA409df583f306B6F5a7fFdE790739 npx hardhat run --network arbitrum scripts/checkInsufficientFundingFeeForActivePositions.ts
 *
 * Environment variables:
 *   MARKET - Target market address (default: OP/USD [OP-USDC])
 */

// Configuration
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 100;

// Default market (OP/USD on Arbitrum)
const DEFAULT_MARKET = "0x4fDd333FF9cA409df583f306B6F5a7fFdE790739";

// Deployed addresses on Arbitrum mainnet
const REFERRAL_STORAGE_ADDRESS = "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d";

interface RiskyPosition {
  positionKey: string;
  account: string;
  isLong: boolean;
  collateralToken: string;
  pnlToken: string;
  sizeInUsd: ethers.BigNumber;
  collateralAmount: ethers.BigNumber;
  pendingFundingFee: ethers.BigNumber;
  basePnlUsd: ethers.BigNumber;
  shortfall: ethers.BigNumber;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMarketPrices(market: any): Promise<any> {
  const tickersUrl = "https://arbitrum-api.gmxinfra2.io/prices/tickers";
  const tickers = (await got(tickersUrl).json()) as any[];

  const indexTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.indexToken.toLowerCase());
  const longTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.longToken.toLowerCase());
  const shortTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.shortToken.toLowerCase());

  const missingPrices: string[] = [];
  if (!indexTicker && market.indexToken !== hre.ethers.constants.AddressZero) {
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
): Promise<{ risky: RiskyPosition[]; totalChecked: number; marketPositionCount: number }> {
  const riskyPositions: RiskyPosition[] = [];
  let marketPositionCount = 0;

  console.log("Scanning positions...");

  // Get all position keys
  const positionCount = await getPositionCount(dataStore);
  console.log(`  Total positions in system: ${positionCount.toString()}`);

  const positionKeys = await getPositionKeys(dataStore, 0, positionCount);

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

  // Process positions in batches
  for (let i = 0; i < positionKeys.length; i += BATCH_SIZE) {
    const batch = positionKeys.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (positionKey: string) => {
      try {
        const position = await reader.getPosition(dataStore.address, positionKey);

        // Filter to target market
        if (position.addresses.market.toLowerCase() !== marketAddress.toLowerCase()) {
          return { matched: false, risky: null };
        }

        // Get position info with fees and PnL
        const positionInfo = await reader.getPositionInfo(
          dataStore.address,
          referralStorage.address,
          positionKey,
          marketPrices,
          0, // sizeDeltaUsd
          hre.ethers.constants.AddressZero, // uiFeeReceiver
          true // usePositionSizeAsSizeDeltaUsd
        );

        // Determine pnlToken based on position direction
        // For long positions: profit is in longToken
        // For short positions: profit is in shortToken
        const pnlToken = position.flags.isLong ? market.longToken : market.shortToken;
        const collateralToken = position.addresses.collateralToken;

        // Extract values
        const pendingFundingFee = positionInfo.fees.funding.fundingFeeAmount;
        const basePnlUsd = positionInfo.basePnlUsd;
        const collateralAmount = position.numbers.collateralAmount;

        // Case 2 check:
        // 1. Position owes funding fees (pendingFundingFee > 0)
        // 2. Position is in profit (basePnlUsd > 0) - makes it non-liquidatable
        // 3. pnlToken != collateralToken (token mismatch)
        // 4. collateralAmount < pendingFundingFee (insufficient to cover fees)
        const isRisky =
          pendingFundingFee.gt(0) &&
          basePnlUsd.gt(0) &&
          pnlToken.toLowerCase() !== collateralToken.toLowerCase() &&
          collateralAmount.lt(pendingFundingFee);

        if (isRisky) {
          return {
            matched: true,
            risky: {
              positionKey,
              account: position.addresses.account,
              isLong: position.flags.isLong,
              collateralToken,
              pnlToken,
              sizeInUsd: position.numbers.sizeInUsd,
              collateralAmount,
              pendingFundingFee,
              basePnlUsd,
              shortfall: pendingFundingFee.sub(collateralAmount),
            },
          };
        }

        return { matched: true, risky: null };
      } catch (error: any) {
        console.error(`  Error processing position ${positionKey}: ${error.message}`);
        return { matched: false, risky: null };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result.matched) {
        marketPositionCount++;
        if (result.risky) {
          riskyPositions.push(result.risky);
        }
      }
    }

    // Progress indicator
    process.stdout.write(`\r  Processed ${Math.min(i + BATCH_SIZE, positionKeys.length)}/${positionKeys.length}`);

    // Delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < positionKeys.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  process.stdout.write("\n");

  return {
    risky: riskyPositions,
    totalChecked: positionKeys.length,
    marketPositionCount,
  };
}

async function main() {
  const marketAddress = (process.env.MARKET || DEFAULT_MARKET).toLowerCase();

  console.log(`\n${"=".repeat(70)}`);
  console.log(`CHECKING POSITIONS FOR FUNDING FEE SHORTFALL RISK (Case 2)`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Market: ${marketAddress}`);

  // Initialize contracts
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const referralStorage = await hre.ethers.getContractAt("ReferralStorage", REFERRAL_STORAGE_ADDRESS);

  // Get market info
  const market = await reader.getMarket(dataStore.address, marketAddress);

  // Get token symbols for display
  const tokens = await hre.gmx.getTokens();
  const findTokenSymbol = (address: string): string => {
    if (address === hre.ethers.constants.AddressZero) return "ZERO";
    const entry = Object.entries(tokens).find(
      ([_, token]: [string, any]) => token.address.toLowerCase() === address.toLowerCase()
    );
    return entry ? entry[0] : address.slice(0, 10);
  };
  const findTokenDecimals = (address: string): number => {
    const entry = Object.entries(tokens).find(
      ([_, token]: [string, any]) => token.address.toLowerCase() === address.toLowerCase()
    );
    return entry ? (entry[1] as any).decimals : 18;
  };

  const longTokenSymbol = findTokenSymbol(market.longToken);
  const shortTokenSymbol = findTokenSymbol(market.shortToken);
  const indexTokenSymbol = findTokenSymbol(market.indexToken);
  const longTokenDecimals = findTokenDecimals(market.longToken);
  const shortTokenDecimals = findTokenDecimals(market.shortToken);
  const indexTokenDecimals = findTokenDecimals(market.indexToken);

  console.log(`\nMarket Info:`);
  console.log(`  Index Token: ${indexTokenSymbol} (${market.indexToken})`);
  console.log(`  Long Token (PnL for longs): ${longTokenSymbol} (${market.longToken})`);
  console.log(`  Short Token (PnL for shorts): ${shortTokenSymbol} (${market.shortToken})`);

  // Fetch prices
  console.log(`\nFetching prices from API...`);
  const prices = await getMarketPrices(market);
  console.log(
    `  Index Token Price: $${formatAmount(bigNumberify(prices.indexTokenPrice.maxPrice), 30 - indexTokenDecimals, 4)}`
  );
  console.log(
    `  Long Token Price: $${formatAmount(bigNumberify(prices.longTokenPrice.maxPrice), 30 - longTokenDecimals, 4)}`
  );
  console.log(
    `  Short Token Price: $${formatAmount(bigNumberify(prices.shortTokenPrice.maxPrice), 30 - shortTokenDecimals, 4)}`
  );

  // Analyze positions
  console.log("");
  const { risky, totalChecked, marketPositionCount } = await analyzePositions(
    marketAddress,
    dataStore,
    reader,
    referralStorage,
    market,
    prices
  );

  console.log(`  Positions in target market: ${marketPositionCount}`);

  // Display risky positions
  console.log(`\n${"=".repeat(70)}`);
  console.log(`RISKY POSITIONS (Case 2)`);
  console.log(`${"=".repeat(70)}`);

  if (risky.length === 0) {
    console.log(`\nNo risky positions found.`);
    console.log(`\nThis means no positions currently have:`);
    console.log(`  - Pending funding fees > 0`);
    console.log(`  - Positive PnL (in profit)`);
    console.log(`  - pnlToken != collateralToken`);
    console.log(`  - collateralAmount < pendingFundingFee`);
  } else {
    // Aggregate shortfall by token
    const shortfallByToken: Record<string, ethers.BigNumber> = {};

    for (let i = 0; i < risky.length; i++) {
      const pos = risky[i];
      const collateralSymbol = findTokenSymbol(pos.collateralToken);
      const collateralDecimals = findTokenDecimals(pos.collateralToken);
      const pnlSymbol = findTokenSymbol(pos.pnlToken);

      console.log(`\n${"-".repeat(70)}`);
      console.log(`Position ${i + 1}:`);
      console.log(`  Key: ${pos.positionKey}`);
      console.log(`  Account: ${pos.account}`);
      console.log(`  Type: ${pos.isLong ? "Long" : "Short"}`);
      console.log(`  Size: $${formatAmount(pos.sizeInUsd, 30, 2)} USD`);
      console.log(`  Collateral Token: ${collateralSymbol} (${pos.collateralToken})`);
      console.log(`  PnL Token: ${pnlSymbol} (${pos.pnlToken})`);
      console.log(
        `  Collateral Amount: ${formatAmount(pos.collateralAmount, collateralDecimals, 6)} ${collateralSymbol}`
      );
      console.log(
        `  Pending Funding Fee: ${formatAmount(pos.pendingFundingFee, collateralDecimals, 6)} ${collateralSymbol}`
      );
      console.log(`  Current PnL: $${formatAmount(pos.basePnlUsd, 30, 2)} USD (in ${pnlSymbol})`);
      console.log(`  SHORTFALL: ${formatAmount(pos.shortfall, collateralDecimals, 6)} ${collateralSymbol}`);

      // Aggregate
      const tokenKey = pos.collateralToken.toLowerCase();
      if (!shortfallByToken[tokenKey]) {
        shortfallByToken[tokenKey] = bigNumberify(0);
      }
      shortfallByToken[tokenKey] = shortfallByToken[tokenKey].add(pos.shortfall);
    }

    // Summary
    console.log(`\n${"=".repeat(70)}`);
    console.log(`SUMMARY`);
    console.log(`${"=".repeat(70)}`);
    console.log(`\nRisky positions found: ${risky.length}`);
    console.log(`\nPotential shortfall by token:`);

    for (const [tokenAddress, shortfall] of Object.entries(shortfallByToken)) {
      const symbol = findTokenSymbol(tokenAddress);
      const decimals = findTokenDecimals(tokenAddress);
      console.log(`  ${symbol}: ${formatAmount(shortfall, decimals, 6)}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Positions checked: ${marketPositionCount} (from ${totalChecked} total)`);
}

main()
  .then(() => {
    console.log("\nDone");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
