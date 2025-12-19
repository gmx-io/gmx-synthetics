/**
 * Script to simulate the impact of USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE flag on all markets
 *
 * This script compares the following metrics before/after the flag is turned on:
 * - Open Interest Balance (USD vs tokens × price calculation)
 * - Borrowing Rate (borrowingFactorPerSecond for longs/shorts)
 * - Funding Rate (fundingFactorPerSecond + 1-hour projected change)
 *
 * IMPORTANT: This script REQUIRES Anvil to be running because it:
 * - Impersonates a CONTROLLER account
 * - Modifies contract state (sets USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE)
 * - Compares values before/after the change
 *
 * Usage:
 *   For Arbitrum:
 *     Terminal 1: source .env && anvil --fork-url $ARBITRUM_RPC_URL --host 127.0.0.1 --port 8545
 *     Terminal 2: npx hardhat run scripts/simulateUseOpenInterestInTokensImpact.ts --network anvil
 *
 *   For Avalanche:
 *     Terminal 1: source .env && anvil --fork-url $AVALANCHE_RPC_URL --host 127.0.0.1 --port 8545
 *     Terminal 2: FORK=avalanche FORK_ID=43114 npx hardhat run scripts/simulateUseOpenInterestInTokensImpact.ts --network anvil
 *
 * Environment Variables:
 *   SHOW_ALL=true  - Show all markets (by default only markets with changes are displayed) --> e.g. on arbiturm 6 markets have no changes
 *   CSV=true       - Export results to CSV file (outputs to simulateUseOpenInterestInTokensImpact.csv)
 */

import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import * as path from "path";
import * as fs from "fs";
import { bigNumberify, formatAmount } from "../utils/math";
import { hashString } from "../utils/hash";
import fetch from "node-fetch";

// Keys
const USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE = hashString("USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE");
const CONTROLLER = hashString("CONTROLLER");
const OPEN_INTEREST = hashString("OPEN_INTEREST");
const OPEN_INTEREST_IN_TOKENS = hashString("OPEN_INTEREST_IN_TOKENS");
const IS_MARKET_DISABLED = hashString("IS_MARKET_DISABLED");

// Precision constants
const FLOAT_PRECISION = bigNumberify(10).pow(30);
const DURATION_IN_SECONDS = 3600; // 1h

// Helper to generate OI key hash
function generateOiKey(baseKey: string, marketToken: string, collateralToken: string, isLong: boolean): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "address", "bool"],
      [baseKey, marketToken, collateralToken, isLong]
    )
  );
}

interface TokenPrice {
  min: BigNumber;
  max: BigNumber;
}

interface MarketPrices {
  indexTokenPrice: TokenPrice;
  longTokenPrice: TokenPrice;
  shortTokenPrice: TokenPrice;
}

interface MarketData {
  marketToken: string;
  indexToken: string;
  marketLabel: string;
  longOpenInterestUsd: BigNumber;
  shortOpenInterestUsd: BigNumber;
  longOpenInterestInTokens: BigNumber;
  shortOpenInterestInTokens: BigNumber;
  indexTokenDecimals: number;
  indexTokenPrice: BigNumber; // min price used for calculations
  borrowingFactorPerSecondForLongs: BigNumber;
  borrowingFactorPerSecondForShorts: BigNumber;
  fundingFactorPerSecond: BigNumber;
  longsPayShorts: boolean;
  priceImpactLong100k: BigNumber | null; // Price impact for $100k long position (null if fetch failed)
  priceImpactShort100k: BigNumber | null; // Price impact for $100k short position (null if fetch failed)
  error?: string;
}

interface TickerData {
  price: TokenPrice;
  symbol: string;
}

async function fetchTickerPrices(network: string) {
  console.log("Fetching token prices...");

  const apiNetwork = network === "anvil" ? process.env.FORK || "arbitrum" : network;
  const tickersUrl = `https://${apiNetwork}-api.gmxinfra2.io/prices/tickers`;

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

async function getTokenSymbol(address: string, tickersByTokenAddress: Record<string, TickerData>): Promise<string> {
  if (address === ethers.constants.AddressZero) {
    return "swapOnly";
  }

  // Try on-chain symbol() first
  try {
    const token = await ethers.getContractAt(["function symbol() view returns (string)"], address);
    return await token.symbol();
  } catch {
    // Fall back to ticker API symbol
    const ticker = tickersByTokenAddress[address.toLowerCase()];
    if (ticker?.symbol) {
      return ticker.symbol;
    }
    return "unknown";
  }
}

function getTokenPrice(token: string, tickersByTokenAddress: Record<string, TickerData>): TokenPrice {
  if (token === ethers.constants.AddressZero) {
    throw new Error("Price for zero address");
  }
  const ticker = tickersByTokenAddress[token.toLowerCase()];
  if (!ticker) {
    throw new Error(`Price not found for token ${token}`);
  }
  return ticker.price;
}

async function getContracts(network: string) {
  const deploymentNetwork = network === "anvil" ? process.env.FORK || "arbitrum" : network;
  const deploymentsPath = path.join(__dirname, `../deployments/${deploymentNetwork}`);

  function getDeployedAddress(contractName: string): string {
    const deploymentPath = path.join(deploymentsPath, `${contractName}.json`);
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    return deployment.address;
  }

  const dataStore = await ethers.getContractAt("DataStore", getDeployedAddress("DataStore"));
  const reader = await ethers.getContractAt("Reader", getDeployedAddress("Reader"));
  const roleStore = await ethers.getContractAt("RoleStore", getDeployedAddress("RoleStore"));

  return { dataStore, reader, roleStore };
}

async function getController(roleStore: any) {
  const controllers = await roleStore.getRoleMembers(CONTROLLER, 0, 10);
  const controller = controllers[0];
  console.log(`Impersonating CONTROLLER: ${controller}`);

  const anvilProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
  await anvilProvider.send("anvil_impersonateAccount", [controller]);
  await anvilProvider.send("anvil_setBalance", [controller, "0x1000000000000000000"]);

  return anvilProvider.getUncheckedSigner(controller);
}

async function getMarketData(
  market: any,
  reader: any,
  dataStore: any,
  tickersByTokenAddress: Record<string, TickerData>
): Promise<MarketData> {
  const [indexTokenSymbol, longTokenSymbol, shortTokenSymbol] = await Promise.all([
    getTokenSymbol(market.indexToken, tickersByTokenAddress),
    getTokenSymbol(market.longToken, tickersByTokenAddress),
    getTokenSymbol(market.shortToken, tickersByTokenAddress),
  ]);

  const marketLabel = `${indexTokenSymbol} ${longTokenSymbol}-${shortTokenSymbol}`;

  // Get index token decimals (default to 18 for swapOnly markets)
  let indexTokenDecimals = 18;
  if (market.indexToken !== ethers.constants.AddressZero) {
    try {
      const indexToken = await ethers.getContractAt(["function decimals() view returns (uint8)"], market.indexToken);
      indexTokenDecimals = await indexToken.decimals();
    } catch {
      indexTokenDecimals = 18; // fallback
    }
  }

  try {
    const marketPrices: MarketPrices = {
      indexTokenPrice:
        market.indexToken === ethers.constants.AddressZero
          ? { min: bigNumberify(1), max: bigNumberify(1) }
          : getTokenPrice(market.indexToken, tickersByTokenAddress),
      longTokenPrice: getTokenPrice(market.longToken, tickersByTokenAddress),
      shortTokenPrice: getTokenPrice(market.shortToken, tickersByTokenAddress),
    };

    // Fetch MarketInfo (includes borrowing and funding data)
    const marketInfo = await reader.getMarketInfo(
      dataStore.address,
      {
        indexTokenPrice: marketPrices.indexTokenPrice,
        longTokenPrice: marketPrices.longTokenPrice,
        shortTokenPrice: marketPrices.shortTokenPrice,
      },
      market.marketToken
    );

    // Fetch open interest values directly
    const [longOiUsdLong, longOiUsdShort, shortOiUsdLong, shortOiUsdShort] = await Promise.all([
      dataStore.getUint(generateOiKey(OPEN_INTEREST, market.marketToken, market.longToken, true)),
      dataStore.getUint(generateOiKey(OPEN_INTEREST, market.marketToken, market.shortToken, true)),
      dataStore.getUint(generateOiKey(OPEN_INTEREST, market.marketToken, market.longToken, false)),
      dataStore.getUint(generateOiKey(OPEN_INTEREST, market.marketToken, market.shortToken, false)),
    ]);

    const [longOiTokensLong, longOiTokensShort, shortOiTokensLong, shortOiTokensShort] = await Promise.all([
      dataStore.getUint(generateOiKey(OPEN_INTEREST_IN_TOKENS, market.marketToken, market.longToken, true)),
      dataStore.getUint(generateOiKey(OPEN_INTEREST_IN_TOKENS, market.marketToken, market.shortToken, true)),
      dataStore.getUint(generateOiKey(OPEN_INTEREST_IN_TOKENS, market.marketToken, market.longToken, false)),
      dataStore.getUint(generateOiKey(OPEN_INTEREST_IN_TOKENS, market.marketToken, market.shortToken, false)),
    ]);

    // Total open interest (combined from both collateral tokens)
    const longOpenInterestUsd = longOiUsdLong.add(longOiUsdShort);
    const shortOpenInterestUsd = shortOiUsdLong.add(shortOiUsdShort);
    const longOpenInterestInTokens = longOiTokensLong.add(longOiTokensShort);
    const shortOpenInterestInTokens = shortOiTokensLong.add(shortOiTokensShort);

    // Fetch price impact for $100k positions (skip for swapOnly markets)
    let priceImpactLong100k: BigNumber | null = null;
    let priceImpactShort100k: BigNumber | null = null;
    const SIZE_100K = bigNumberify(100000).mul(FLOAT_PRECISION);

    if (market.indexToken !== ethers.constants.AddressZero) {
      try {
        const [longImpact, shortImpact] = await Promise.all([
          reader.getExecutionPrice(
            dataStore.address,
            market.marketToken,
            {
              indexTokenPrice: marketPrices.indexTokenPrice,
              longTokenPrice: marketPrices.longTokenPrice,
              shortTokenPrice: marketPrices.shortTokenPrice,
            },
            0, // positionSizeInUsd
            0, // positionSizeInTokens
            SIZE_100K, // sizeDeltaUsd (int256, positive for increase)
            0, // pendingImpactAmount
            true // isLong
          ),
          reader.getExecutionPrice(
            dataStore.address,
            market.marketToken,
            {
              indexTokenPrice: marketPrices.indexTokenPrice,
              longTokenPrice: marketPrices.longTokenPrice,
              shortTokenPrice: marketPrices.shortTokenPrice,
            },
            0,
            0,
            SIZE_100K,
            0,
            false // isShort
          ),
        ]);

        priceImpactLong100k = longImpact.priceImpactUsd;
        priceImpactShort100k = shortImpact.priceImpactUsd;
      } catch (e: any) {
        // getExecutionPrice can fail for some markets (e.g., missing config)
        console.error(`  Price impact fetch failed for ${marketLabel}: ${e.message?.substring(0, 80)}`);
      }
    }

    return {
      marketToken: market.marketToken,
      indexToken: market.indexToken,
      marketLabel,
      longOpenInterestUsd,
      shortOpenInterestUsd,
      longOpenInterestInTokens,
      shortOpenInterestInTokens,
      indexTokenDecimals,
      indexTokenPrice: marketPrices.indexTokenPrice.min,
      borrowingFactorPerSecondForLongs: marketInfo.borrowingFactorPerSecondForLongs,
      borrowingFactorPerSecondForShorts: marketInfo.borrowingFactorPerSecondForShorts,
      fundingFactorPerSecond: marketInfo.nextFunding.fundingFactorPerSecond,
      longsPayShorts: marketInfo.nextFunding.longsPayShorts,
      priceImpactLong100k,
      priceImpactShort100k,
    };
  } catch (error: any) {
    console.error(`  Market data fetch failed for ${marketLabel}: ${error.message?.substring(0, 80)}`);
    return {
      marketToken: market.marketToken,
      indexToken: market.indexToken,
      marketLabel,
      longOpenInterestUsd: bigNumberify(0),
      shortOpenInterestUsd: bigNumberify(0),
      longOpenInterestInTokens: bigNumberify(0),
      shortOpenInterestInTokens: bigNumberify(0),
      indexTokenDecimals,
      indexTokenPrice: bigNumberify(0),
      borrowingFactorPerSecondForLongs: bigNumberify(0),
      borrowingFactorPerSecondForShorts: bigNumberify(0),
      fundingFactorPerSecond: bigNumberify(0),
      longsPayShorts: true,
      priceImpactLong100k: null,
      priceImpactShort100k: null,
      error: error.message?.substring(0, 100),
    };
  }
}

async function getAllMarketData(
  markets: any[],
  reader: any,
  dataStore: any,
  tickersByTokenAddress: Record<string, TickerData>
): Promise<MarketData[]> {
  const BATCH_SIZE = 10;
  const results: MarketData[] = [];

  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    const batch = markets.slice(i, i + BATCH_SIZE);
    console.log(`Processed ${i} of ${markets.length}...`);

    const batchResults = await Promise.all(
      batch.map((market) => getMarketData(market, reader, dataStore, tickersByTokenAddress))
    );

    results.push(...batchResults);
  }

  return results;
}

function formatPercentDiff(before: BigNumber, after: BigNumber): string {
  if (before.isZero()) {
    return after.isZero() ? "0.00%" : "∞";
  }
  const diff = after.sub(before);
  const percentBps = diff.mul(10000).div(before);
  const percent = percentBps.toNumber() / 100;
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

function formatUsdDiff(before: BigNumber, after: BigNumber): string {
  const diff = after.sub(before);
  const sign = diff.gte(0) ? "+" : "-";
  const usdPart = `${sign}$${formatAmount(diff.abs(), 30, 2)}`;

  // Calculate percentage
  if (before.isZero()) {
    return after.isZero() ? "$0.00 (0.00%)" : `${usdPart} (∞)`;
  }
  const percentBps = diff.mul(10000).div(before);
  const percent = percentBps.toNumber() / 100;
  const percentSign = percent >= 0 ? "+" : "";
  return `${usdPart} (${percentSign}${percent.toFixed(2)}%)`;
}

function formatFactorPerSecond(factor: BigNumber): string {
  // Factor is in 30 decimals, show in scientific notation
  const factorFloat = parseFloat(formatAmount(factor, 30, 18));
  return factorFloat.toExponential(6);
}

function formatImpact(cur: BigNumber | null, sim: BigNumber | null): string {
  // Price impact: negative = cost to trader, positive = rebate
  if (cur === null || sim === null) {
    return "err";
  }
  const curSign = cur.lt(0) ? "-" : "+";
  const simSign = sim.lt(0) ? "-" : "+";
  return `${curSign}$${formatAmount(cur.abs(), 30, 2)} / ${simSign}$${formatAmount(sim.abs(), 30, 2)}`;
}

function calculate1HourFunding(
  fundingFactorPerSecond: BigNumber,
  payingSideOi: BigNumber,
  longsPayShorts: boolean
): { amount: BigNumber; payer: string } {
  // fundingUsd = sizeOfPayingSide * durationInSeconds * fundingFactorPerSecond / 1e30
  const fundingAmount = payingSideOi.mul(DURATION_IN_SECONDS).mul(fundingFactorPerSecond).div(FLOAT_PRECISION);
  return {
    amount: fundingAmount,
    payer: longsPayShorts ? "Longs" : "Shorts",
  };
}

function compareMarketData(currentData: MarketData[], simulatedData: MarketData[]) {
  const results: any[] = [];

  for (let i = 0; i < currentData.length; i++) {
    const current = currentData[i];
    const simulated = simulatedData[i];

    if (current.error) {
      results.push({
        market: current.marketLabel,
        address: current.marketToken.slice(0, 10) + "...",
        error: current.error,
      });
      continue;
    }

    // Calculate 1-hour funding projections
    const currentPayingOi = current.longsPayShorts ? current.longOpenInterestUsd : current.shortOpenInterestUsd;
    const simulatedPayingOi = simulated.longsPayShorts ? simulated.longOpenInterestUsd : simulated.shortOpenInterestUsd;

    const current1HrFunding = calculate1HourFunding(
      current.fundingFactorPerSecond,
      currentPayingOi,
      current.longsPayShorts
    );
    const simulated1HrFunding = calculate1HourFunding(
      simulated.fundingFactorPerSecond,
      simulatedPayingOi,
      simulated.longsPayShorts
    );

    // Determine which side is larger based on OI
    // USD: stored values (used when flag=FALSE)
    const largerByUsd = current.longOpenInterestUsd.gt(current.shortOpenInterestUsd) ? "Longs" : "Shorts";
    // Tokens: we can't directly compare tokens across long/short since they might be different tokens
    // But for single-token markets or same-index markets, tokens comparison shows the flag=TRUE behavior
    const largerByTokens = current.longOpenInterestInTokens.gt(current.shortOpenInterestInTokens) ? "Longs" : "Shorts";

    // Calculate notional OI (tokens × current price) - this is the "new" balance calculation
    // GMX price format: price = actualPriceUsd * 10^30 / 10^tokenDecimals
    // So notionalUsd = tokens * price (no additional division needed)
    let longOiNotional = "N/A";
    let shortOiNotional = "N/A";
    if (!current.indexTokenPrice.isZero()) {
      const longNotional = current.longOpenInterestInTokens.mul(current.indexTokenPrice);
      const shortNotional = current.shortOpenInterestInTokens.mul(current.indexTokenPrice);
      longOiNotional = `$${formatAmount(longNotional, 30, 0)}`;
      shortOiNotional = `$${formatAmount(shortNotional, 30, 0)}`;
    }

    // Check if larger side flipped
    const flipped = largerByUsd !== largerByTokens;

    results.push({
      market: current.marketLabel,
      address: current.marketToken.slice(0, 10) + "...",
      // Raw token counts
      "long tokens": current.longOpenInterestInTokens.toString(),
      "short tokens": current.shortOpenInterestInTokens.toString(),
      // Open Interest - current (stored USD) / simulated (tokens × current price)
      "long OI (cur / sim)": `$${formatAmount(current.longOpenInterestUsd, 30, 0)} / ${longOiNotional}`,
      "short OI (cur / sim)": `$${formatAmount(current.shortOpenInterestUsd, 30, 0)} / ${shortOiNotional}`,
      "larger (cur / sim)": `${largerByUsd} / ${largerByTokens}${flipped ? " FLIP" : ""}`,
      // Borrowing rates
      "borrow long (cur / sim)": `${formatFactorPerSecond(
        current.borrowingFactorPerSecondForLongs
      )} / ${formatFactorPerSecond(simulated.borrowingFactorPerSecondForLongs)}`,
      "borrow long diff": formatPercentDiff(
        current.borrowingFactorPerSecondForLongs,
        simulated.borrowingFactorPerSecondForLongs
      ),
      "borrow short (cur / sim)": `${formatFactorPerSecond(
        current.borrowingFactorPerSecondForShorts
      )} / ${formatFactorPerSecond(simulated.borrowingFactorPerSecondForShorts)}`,
      "borrow short diff": formatPercentDiff(
        current.borrowingFactorPerSecondForShorts,
        simulated.borrowingFactorPerSecondForShorts
      ),
      // Funding rates
      "funding/sec (cur / sim)": `${formatFactorPerSecond(current.fundingFactorPerSecond)} / ${formatFactorPerSecond(
        simulated.fundingFactorPerSecond
      )}`,
      "funding diff": formatPercentDiff(current.fundingFactorPerSecond, simulated.fundingFactorPerSecond),
      "payer (cur / sim)": `${current.longsPayShorts ? "Longs" : "Shorts"} / ${
        simulated.longsPayShorts ? "Longs" : "Shorts"
      }`,
      // 1-hour funding projection
      "1hr fund (cur / sim)": `$${formatAmount(current1HrFunding.amount, 30, 2)} / $${formatAmount(
        simulated1HrFunding.amount,
        30,
        2
      )}`,
      "1hr fund diff": formatUsdDiff(current1HrFunding.amount, simulated1HrFunding.amount),
      // Price impact for $100k positions (skip for swapOnly markets)
      "impact long $100k (cur / sim)":
        current.indexToken === ethers.constants.AddressZero
          ? "N/A"
          : formatImpact(current.priceImpactLong100k, simulated.priceImpactLong100k),
      "impact long diff":
        current.indexToken === ethers.constants.AddressZero
          ? "N/A"
          : current.priceImpactLong100k === null || simulated.priceImpactLong100k === null
          ? "err"
          : formatPercentDiff(current.priceImpactLong100k.abs(), simulated.priceImpactLong100k.abs()),
      "impact short $100k (cur / sim)":
        current.indexToken === ethers.constants.AddressZero
          ? "N/A"
          : formatImpact(current.priceImpactShort100k, simulated.priceImpactShort100k),
      "impact short diff":
        current.indexToken === ethers.constants.AddressZero
          ? "N/A"
          : current.priceImpactShort100k === null || simulated.priceImpactShort100k === null
          ? "err"
          : formatPercentDiff(current.priceImpactShort100k.abs(), simulated.priceImpactShort100k.abs()),
    });
  }

  return results;
}

async function fetchMarketsWithRetry(reader: any, dataStore: any, maxRetries = 3): Promise<any[]> {
  const MARKET_LIMIT = 150;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetching markets (attempt ${attempt}/${maxRetries})...`);
      const markets = await reader.getMarkets(dataStore.address, 0, MARKET_LIMIT);
      console.log(`Found ${markets.length} markets`);
      return markets;
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`Failed to fetch markets after ${maxRetries} attempts`);
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return [];
}

async function main() {
  console.log("=".repeat(80));
  console.log("Simulating USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE Impact");
  console.log("=".repeat(80));
  console.log("");

  const { dataStore, reader, roleStore } = await getContracts(hre.network.name);
  const tickersByTokenAddress = await fetchTickerPrices(hre.network.name);

  const markets = await fetchMarketsWithRetry(reader, dataStore);

  // Filter out disabled markets
  const enabledMarkets = [];
  for (const market of markets) {
    const isDisabled = await dataStore.getBool(
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [IS_MARKET_DISABLED, market.marketToken])
      )
    );
    if (!isDisabled) {
      enabledMarkets.push(market);
    }
  }
  console.log(`Found ${enabledMarkets.length} enabled markets\n`);

  // Step 1: Get current data (with flag=FALSE)
  console.log("Step 1: Getting current market data (flag=FALSE)...");
  const currentData = await getAllMarketData(enabledMarkets, reader, dataStore, tickersByTokenAddress);

  // Step 2: Set USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE to true
  console.log("\nStep 2: Setting USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE to true...");
  const controller = await getController(roleStore);

  // Verify flag before setting
  const flagBefore = await dataStore.getBool(USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE);
  console.log(`  Flag before: ${flagBefore}`);

  await dataStore.connect(controller).setBool(USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE, true);

  // Verify flag after setting
  const flagAfter = await dataStore.getBool(USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE);
  console.log(`  Flag after: ${flagAfter}`);

  if (!flagAfter) {
    throw new Error("Failed to set USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE flag!");
  }

  // Step 3: Get simulated data (with flag=TRUE)
  console.log("\nStep 3: Getting simulated market data (flag=TRUE)...");
  const simulatedData = await getAllMarketData(enabledMarkets, reader, dataStore, tickersByTokenAddress);

  // Restore original setting
  await dataStore.connect(controller).setBool(USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE, false);

  // Step 4: Compare and output results
  console.log("\nStep 4: Comparing data...\n");
  const results = compareMarketData(currentData, simulatedData);

  // Display summary table
  console.log("=".repeat(80));
  console.log("SUMMARY: Impact of USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE = true");
  console.log("=".repeat(80));
  console.log("");
  console.log("Column Legend:");
  console.log("  - long/short tokens: raw token count (index token units)");
  console.log("  - OI (cur / sim): cur=stored USD, sim=tokens × currentPrice");
  console.log("  - larger (cur / sim): Longs|Shorts, append FLIP if side changes");
  console.log("  - borrow/funding (cur / sim): rate per second with flag=false / flag=true");
  console.log(
    "  - diff columns: +X.XX% (increase) | -X.XX% (decrease) | 0.00% (both zero) | ∞ (0→nonzero) | -100.00% (nonzero→0) | err (fetch failed)"
  );
  console.log("  - payer (cur / sim): Longs|Shorts (which side pays funding)");
  console.log("  - 1hr fund (cur / sim): projected hourly funding in USD");
  console.log(
    "  - impact long/short $100k (cur / sim): price impact for opening $100k position (-$X = cost, +$X = rebate)"
  );
  console.log("");

  // Filter markets with changes (unless SHOW_ALL=true)
  const showAll = process.env.SHOW_ALL === "true";

  // "0.00%" = both were zero, "+0.00%" = both non-zero but same, "err" = fetch failed
  const isNoChange = (v: string) => v === "0.00%" || v === "+0.00%" || v === "N/A" || v === "err";
  const marketsWithChanges = results.filter(
    (r) =>
      !r.error &&
      (!isNoChange(r["borrow long diff"]) ||
        !isNoChange(r["borrow short diff"]) ||
        !isNoChange(r["funding diff"]) ||
        !isNoChange(r["impact long diff"]) ||
        !isNoChange(r["impact short diff"]))
  );

  const marketsWithErrors = results.filter((r) => r.error);
  const marketsWithoutChanges = results.filter(
    (r) =>
      !r.error &&
      isNoChange(r["borrow long diff"]) &&
      isNoChange(r["borrow short diff"]) &&
      isNoChange(r["funding diff"]) &&
      isNoChange(r["impact long diff"]) &&
      isNoChange(r["impact short diff"])
  );
  console.log(`Total markets: ${results.length}`);
  console.log(`Markets with errors: ${marketsWithErrors.length}`);
  console.log(`Markets with changes: ${marketsWithChanges.length}`);
  console.log(`Markets without changes: ${marketsWithoutChanges.length}${showAll ? "" : " (not displayed)"}\n`);

  const marketsToDisplay = showAll ? results.filter((r) => !r.error) : marketsWithChanges;

  if (marketsToDisplay.length > 0) {
    console.table(marketsToDisplay);
  } else {
    console.log("No significant changes detected in any market.");
  }

  // Also show markets with errors
  if (marketsWithErrors.length > 0) {
    console.log(`\nMarkets with errors:`);
    console.table(marketsWithErrors);
  }

  // Export to CSV if requested
  if (process.env.CSV === "true") {
    const allResults = [...marketsToDisplay, ...marketsWithErrors];
    if (allResults.length > 0) {
      const headers = Object.keys(allResults[0]);
      const csvRows = [
        headers.join(","),
        ...allResults.map((row) =>
          headers
            .map((header) => {
              const value = row[header] ?? "";
              // Escape values containing commas, quotes, or newlines
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
      const csvPath = path.join(__dirname, "../out/simulateUseOpenInterestInTokensImpact.csv");
      fs.writeFileSync(csvPath, csvContent);
      console.log(`\nCSV exported to: ${csvPath}`);
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
