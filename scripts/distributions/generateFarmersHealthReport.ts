import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Generate Health Report for Archi Finance Positions
 * Creates a markdown report showing health analysis for farmer positions
 *
 * Usage:
 *   FARMER=0x... POSITION=1 ETH_PRICE=2650 BTC_PRICE=110000 GLP_PRICE=1.45 npx hardhat run scripts/distributions/generateFarmersHealthReport.ts --network arbitrum
 */

// default to approx prices as of Jul-09-2025
const ETH_PRICE = parseFloat(process.env.ETH_PRICE || "2650");
const BTC_PRICE = parseFloat(process.env.BTC_PRICE || "110000");
const GLP_PRICE = parseFloat(process.env.GLP_PRICE || "1.45");

const LIQUIDATE_THRESHOLD = 400;

const CONTRACTS = {
  CreditUser2: "0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E",
};

const CREDIT_USER_ABI = [
  "function isTerminated(address _recipient, uint256 _borrowedIndex) view returns (bool)",
  "function getUserLendCredit(address _recipient, uint256 _borrowedIndex) view returns (address depositor, address token, uint256 amountIn, uint256 reservedLiquidatorFee, address[] memory borrowedTokens, uint256[] memory ratios)",
  "function getUserBorrowed(address _recipient, uint256 _borrowedIndex) view returns (address[] memory creditManagers, uint256[] memory borrowedAmountOuts, uint256 collateralMintedAmount, uint256[] memory borrowedMintedAmount, uint256 mintedAmount)",
  "function getUserCounts(address _recipient) view returns (uint256)",
  "event CreateUserBorrowed(address indexed _recipient, uint256 _borrowedIndex, address[] _creditManagers, uint256[] _borrowedAmountOuts, uint256 _collateralMintedAmount, uint256[] _borrowedMintedAmount, uint256 _borrowedAt)",
];

const TOKEN_NAMES: Record<string, string> = {
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "WBTC",
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": "USDC",
  "0x5402b5f40310bded796c7d0f3ff6683f5c0cffdf": "fsGLP",
  "0x1addd80e6039594ee970e5872d247bf0414c8903": "fsGLP",
};

interface PositionHealth {
  farmer: string;
  position: number;
  collateralToken: string;
  collateralAmount: number;
  collateralGLP: number;
  totalGLP: number;
  borrowedTokens: string[];
  borrowedAmounts: number[];
  borrowedDecimals: number[];
  debtValueUSD: number;
  debtValueGLP: number;
  equity: number;
  health: number;
  status: string;
  leverage: number;
  terminated: boolean;
  openedAt: Date | null;
  daysOpen: number;
}

function getTokenDecimals(tokenName: string): number {
  if (tokenName === "WBTC") return 8;
  if (tokenName === "USDT" || tokenName === "USDC") return 6;
  return 18;
}

function getTokenPrice(tokenName: string, ethPrice: number, btcPrice: number): number {
  if (tokenName === "WETH") return ethPrice;
  if (tokenName === "WBTC") return btcPrice;
  return 1; // Stablecoins
}

function getHealthStatus(health: number, equity: number): string {
  if (health === 0 || equity <= 0) return "🔴 INSOLVENT";
  if (health <= LIQUIDATE_THRESHOLD) return "🔴 LIQUIDATABLE";
  if (health <= LIQUIDATE_THRESHOLD * 1.15) return "🟠 HIGH RISK";
  if (health <= LIQUIDATE_THRESHOLD * 1.5) return "🟡 MEDIUM RISK";
  return "🟢 HEALTHY";
}

async function analyzePosition(
  creditUser: any,
  farmer: string,
  positionIndex: number,
  ethPrice: number,
  btcPrice: number
): Promise<PositionHealth | null> {
  try {
    const isTerminated = await creditUser.isTerminated(farmer, positionIndex);

    const [, token, amountIn, , borrowedTokens] = await creditUser.getUserLendCredit(farmer, positionIndex);

    const [, borrowedAmountOuts, collateralMintedAmount, borrowedMintedAmount, totalMintedAmount] =
      await creditUser.getUserBorrowed(farmer, positionIndex);

    const collateralToken = TOKEN_NAMES[token.toLowerCase()] || token;
    const collateralDecimals = getTokenDecimals(collateralToken);
    const collateralAmount = parseFloat(ethers.utils.formatUnits(amountIn, collateralDecimals));
    const collateralGLP = parseFloat(ethers.utils.formatUnits(collateralMintedAmount, 18));
    const totalGLP = parseFloat(ethers.utils.formatUnits(totalMintedAmount, 18));

    const borrowedTokenNames: string[] = [];
    const borrowedAmounts: number[] = [];
    const borrowedDecimals: number[] = [];
    let totalDebtUSD = 0;
    let totalDebtGLP = 0;

    for (let i = 0; i < borrowedTokens.length; i++) {
      const tokenName = TOKEN_NAMES[borrowedTokens[i].toLowerCase()] || borrowedTokens[i];
      const decimals = getTokenDecimals(tokenName);
      const amount = parseFloat(ethers.utils.formatUnits(borrowedAmountOuts[i], decimals));
      const tokenPrice = getTokenPrice(tokenName, ethPrice, btcPrice);
      const debtValueUSD = amount * tokenPrice;
      const debtValueGLP = debtValueUSD / GLP_PRICE;

      borrowedTokenNames.push(tokenName);
      borrowedAmounts.push(amount);
      borrowedDecimals.push(decimals);
      totalDebtUSD += debtValueUSD;
      totalDebtGLP += debtValueGLP;
    }

    const equity = totalGLP - totalDebtGLP;
    let health = 0;
    if (equity > 0 && collateralGLP > 0) {
      health = (equity / collateralGLP) * 1000;
    }

    const status = getHealthStatus(health, equity);
    const leverage = collateralGLP > 0 ? totalGLP / collateralGLP : 0;

    // Get position opening timestamp from event
    // Note: _borrowedIndex is not indexed, so we filter by farmer only and search manually
    const filter = creditUser.filters.CreateUserBorrowed(farmer, null);
    const events = await creditUser.queryFilter(filter, 42029909); // Archi start block

    let openedAt: Date | null = null;
    let daysOpen = 0;

    // Find the event for this specific position
    const positionEvent = events.find((e: any) => e.args?._borrowedIndex?.toNumber() === positionIndex);

    if (positionEvent) {
      const timestamp = positionEvent.args?._borrowedAt?.toNumber();
      if (timestamp) {
        openedAt = new Date(timestamp * 1000);
        daysOpen = Math.floor((Date.now() - openedAt.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      farmer,
      position: positionIndex,
      collateralToken,
      collateralAmount,
      collateralGLP,
      totalGLP,
      borrowedTokens: borrowedTokenNames,
      borrowedAmounts,
      borrowedDecimals,
      debtValueUSD: totalDebtUSD,
      debtValueGLP: totalDebtGLP,
      equity,
      health,
      status,
      leverage,
      terminated: isTerminated,
      openedAt,
      daysOpen,
    };
  } catch (error) {
    console.error(`Error analyzing ${farmer} position ${positionIndex}:`, error);
    return null;
  }
}

async function main() {
  const provider = ethers.provider;
  const creditUser = new ethers.Contract(CONTRACTS.CreditUser2, CREDIT_USER_ABI, provider);

  const farmerFilter = process.env.FARMER;
  const positionFilter = process.env.POSITION ? parseInt(process.env.POSITION) : undefined;

  console.log("Generating Archi Finance Position Health Report...");
  console.log(`ETH Price: $${ETH_PRICE.toLocaleString()}`);
  console.log(`BTC Price: $${BTC_PRICE.toLocaleString()}`);
  console.log(`GLP Price: $${GLP_PRICE.toFixed(2)}`);

  // Read farmers from CSV
  const csvPath = path.join(__dirname, "out", "archi-farmer-positions.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: CSV file not found at ${csvPath}`);
    console.error(`Please run archiDistributions.ts first to generate the farmer positions CSV.`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").slice(1); // Skip header

  console.log(`CSV file has ${lines.length} lines (including empty)`);

  const uniqueFarmers = new Set<string>();
  const farmerPositions = new Map<string, number[]>();

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 2) continue;

    const farmer = parts[0].trim().toLowerCase();
    const position = parseInt(parts[1].trim());

    if (!farmer || isNaN(position)) continue;

    uniqueFarmers.add(farmer);

    if (!farmerPositions.has(farmer)) {
      farmerPositions.set(farmer, []);
    }
    farmerPositions.get(farmer)!.push(position);
  }

  console.log(
    `Found ${uniqueFarmers.size} unique farmers with ${lines.filter((l: string) => l.trim()).length} positions\n`
  );

  // Filter farmers and positions
  let farmersToAnalyze: string[] = [];
  if (farmerFilter) {
    farmersToAnalyze = [farmerFilter.toLowerCase()];
  } else {
    farmersToAnalyze = Array.from(uniqueFarmers);
  }

  // Analyze positions
  const results: PositionHealth[] = [];

  for (const farmer of farmersToAnalyze) {
    const positions = farmerPositions.get(farmer) || [];

    for (const position of positions) {
      if (positionFilter !== undefined && position !== positionFilter) {
        continue;
      }

      console.log(`Analyzing ${farmer} position ${position}...`);
      const result = await analyzePosition(creditUser, farmer, position, ETH_PRICE, BTC_PRICE);

      if (result) {
        results.push(result);
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Generate markdown report
  const reportLines: string[] = [];

  reportLines.push("# Archi Finance Position Health Report\n");
  reportLines.push(`**Generated**: ${new Date().toDateString()}\n`);
  reportLines.push(`**Price Assumptions**:`);
  reportLines.push(`- ETH: $${ETH_PRICE.toLocaleString()}`);
  reportLines.push(`- BTC: $${BTC_PRICE.toLocaleString()}`);
  reportLines.push(`- GLP: $${GLP_PRICE.toFixed(2)}\n`);
  reportLines.push(`**Liquidation Threshold**: ${LIQUIDATE_THRESHOLD} (${LIQUIDATE_THRESHOLD / 10}%)\n`);

  // Summary stats
  const activePositions = results.filter((r) => !r.terminated);
  const liquidatablePositions = activePositions.filter(
    (r) => r.status.includes("INSOLVENT") || r.status.includes("LIQUIDATABLE")
  );
  const healthyPositions = activePositions.filter((r) => r.status.includes("HEALTHY"));

  reportLines.push("## Summary\n");
  reportLines.push(`- **Total Positions Analyzed**: ${results.length}`);
  reportLines.push(`- **Active Positions**: ${activePositions.length}`);
  reportLines.push(`- **Terminated Positions**: ${results.filter((r) => r.terminated).length}`);
  reportLines.push(`- **🔴 Liquidatable**: ${liquidatablePositions.length}`);
  reportLines.push(`- **🟠🟡 At Risk**: ${activePositions.filter((r) => r.status.includes("RISK")).length}`);
  reportLines.push(`- **🟢 Healthy**: ${healthyPositions.length}\n`);

  // Detailed table
  reportLines.push("## Position Details\n");
  reportLines.push(
    "| Farmer | Pos | Opened | Status | Collateral | Total GLP | Debt (USD) | Equity | Health | Leverage | Borrowed |"
  );
  reportLines.push(
    "|--------|-----|--------|--------|------------|-----------|------------|--------|--------|----------|----------|"
  );

  for (const result of results) {
    if (result.terminated) continue; // Skip terminated

    const openedDate = result.openedAt ? result.openedAt.toISOString().split("T")[0] : "Unknown";
    const collateral = `${result.collateralAmount.toFixed(2)} ${result.collateralToken}`;
    const totalGLP = result.totalGLP.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const debtUSD = `$${result.debtValueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const equity = result.equity.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const health = result.health.toFixed(0);
    const leverage = `${result.leverage.toFixed(2)}x`;

    const borrowed = result.borrowedTokens
      .map((token, i) => `${result.borrowedAmounts[i].toFixed(4)} ${token}`)
      .join(", ");

    reportLines.push(
      `| ${result.farmer} | ${result.position} | ${openedDate} | ${result.status} | ${collateral} | ${totalGLP} | ${debtUSD} | ${equity} | ${health} | ${leverage} | ${borrowed} |`
    );
  }

  // Save report
  const outputPath = path.join(__dirname, "out", "position-health-report.md");
  fs.writeFileSync(outputPath, reportLines.join("\n"));

  console.log(`\n✅ Report generated: ${outputPath}`);
  console.log(`📊 Analyzed ${results.length} positions`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
