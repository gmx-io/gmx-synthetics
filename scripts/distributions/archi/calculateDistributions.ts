import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// npx hardhat run --network arbitrum scripts/distributions/archi/calculateDistributions.ts

/**
 * ARCHI DISTRIBUTIONS: Complete End-to-End Calculation
 *
 * Calculates both farmer and LP distributions in a single run.
 *
 * Steps:
 *   1. Verify total fsGLP holdings
 *   2. Extract active farmer positions
 *   3. Calculate farmer distributions
 *   4. Calculate vault borrowing totals (for LP distribution)
 *   5. Calculate LP distributions based on vault borrowing
 *
 * Prerequisites:
 *   - archi-unique-LPs.csv: LP addresses with net positions from Dune query
 *
 * Outputs:
 *   - farmer-positions.csv: All 47 active positions
 *   - farmer-distributions.csv: Final farmer distributions (4 farmers)
 *   - vault-borrowing-summary.csv: Vault borrowing totals
 *   - vault-borrowing-breakdown.csv: Vault borrowing by position
 *   - lp-distributions.csv: LP distributions (469 LPs)
 *   - lp-distributions-by-vault.csv: Detailed LP breakdown by vault
 */

const CONTRACTS = {
  GMXExecutor: "0x49ee14e37cb47bff8c512b3a0d672302a3446eb1",
  CreditUser2: "0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E",
  CreditAggregator: "0x437a182b571390c7e5d14cc7103d3b9d7628faca",
  fsGLP: "0x1aDDD80E6039594eE970E5872D247bf0414C8903",
};

const CREDIT_USER_ABI = [
  "event CreateUserLendCredit(address indexed _recipient, uint256 _borrowedIndex, address _depositor, address _token, uint256 _amountIn, address[] _borrowedTokens, uint256[] _ratios)",
  "event CreateUserBorrowed(address indexed _recipient, uint256 _borrowedIndex, address[] _creditManagers, uint256[] _borrowedAmountOuts, uint256 _collateralMintedAmount, uint256[] _borrowedMintedAmount, uint256 _borrowedAt)",
  "function isTerminated(address _recipient, uint256 _borrowedIndex) view returns (bool)",
];

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

// Map credit manager addresses to vault tokens
const CREDIT_MANAGER_TO_VAULT: Record<string, string> = {
  "0xb99d8d7fc3f59b38fde1b79aedf07c52ca05d63a": "WETH",
  "0xf5eb3768b9b50e6e019e50e62da8ac0444c6af98": "WETH",
  "0x21aae858bf9a3668e95576e45df785f1f6bb9ee7": "WBTC",
  "0xc2a4aae7f7534f9e6b84827e44d7dc0b23fa79f3": "WBTC",
  "0x8de15602ac68427a5d16da9ef956408852c2c29c": "USDT",
  "0x14192d4c06e223e54cf72a03da6ff21689802794": "USDT",
  "0x08dcf2fc5ea34e1615689095646520d18d324f0a": "USDC",
  "0x0ea8c08c3b682a3cd964c416a2966b089b4497ba": "USDC",
  "0xaf32b65b4e7a833040b24d41aec2962c047c4440": "USDC",
};

interface PositionData {
  farmer: string;
  positionIndex: number;
  collateralToken: string;
  collateralAmount: string;
  liquidatorFee: string;
  netCollateral: string;
  borrowedTokens: string[];
  borrowedAmounts: string[];
  creditManagers: string[];
  collateralFsGLP: string;
  borrowedFsGLP: string[];
  totalFsGLP: string;
  leverage: string;
}

interface FarmerDistribution {
  farmer: string;
  collateralFsGLP: string;
  liquidatorFeesShare: string;
  totalFsGLP: string;
}

interface VaultBorrowing {
  vault: string;
  totalBorrowed: ethers.BigNumber;
  positionCount: number;
}

interface LPData {
  address: string;
  netWbtc: number;
  netWeth: number;
  netUsdt: number;
  netUsdc: number;
}

interface LPDistribution {
  address: string;
  wbtc_vsTokens: string;
  wbtc_fsGLP: string;
  weth_vsTokens: string;
  weth_fsGLP: string;
  usdt_vsTokens: string;
  usdt_fsGLP: string;
  usdc_vsTokens: string;
  usdc_fsGLP: string;
  total_fsGLP: string;
}

// ============================================================================
// STEP 1: VERIFY TOTAL FSGLP
// ============================================================================

async function step1_verifyTotal(
  provider: any
): Promise<{ total: number; gmxExecutor: number; creditUser2: number; creditAggregator: number }> {
  console.log("\n" + "=".repeat(80));
  console.log("STEP 1: Verify Total fsGLP Holdings");
  console.log("=".repeat(80) + "\n");

  const fsGLP = new ethers.Contract(CONTRACTS.fsGLP, ERC20_ABI, provider);

  const gmxExecutorBalance = await fsGLP.balanceOf(CONTRACTS.GMXExecutor);
  const creditUser2Balance = await fsGLP.balanceOf(CONTRACTS.CreditUser2);
  const creditAggregatorBalance = await fsGLP.balanceOf(CONTRACTS.CreditAggregator);

  const gmxExecutorFormatted = parseFloat(ethers.utils.formatEther(gmxExecutorBalance));
  const creditUser2Formatted = parseFloat(ethers.utils.formatEther(creditUser2Balance));
  const creditAggregatorFormatted = parseFloat(ethers.utils.formatEther(creditAggregatorBalance));
  const total = gmxExecutorFormatted + creditUser2Formatted + creditAggregatorFormatted;

  console.log("fsGLP Balances:");
  console.log(`  GMXExecutor: ${gmxExecutorFormatted.toFixed(2)} fsGLP (farmer positions)`);
  console.log(`  CreditUser #2: ${creditUser2Formatted.toFixed(2)} fsGLP (liquidator fees)`);
  console.log(`  CreditAggregator: ${creditAggregatorFormatted.toFixed(2)} fsGLP (unaccounted)\n`);

  console.log(`  TOTAL: ${total.toFixed(2)} fsGLP\n`);

  return {
    total,
    gmxExecutor: gmxExecutorFormatted,
    creditUser2: creditUser2Formatted,
    creditAggregator: creditAggregatorFormatted,
  };
}

// ============================================================================
// STEP 2: EXTRACT ACTIVE POSITIONS
// ============================================================================

async function step2_extractPositions(provider: any): Promise<PositionData[]> {
  console.log("=".repeat(80));
  console.log("STEP 2: Extract Active Position Data");
  console.log("=".repeat(80) + "\n");

  const creditUser = new ethers.Contract(CONTRACTS.CreditUser2, CREDIT_USER_ABI, provider);

  const startBlock = 73828000;
  const endBlock = await provider.getBlockNumber();

  console.log(`Querying events from block ${startBlock} to ${endBlock}...\n`);

  console.log("Fetching CreateUserLendCredit events...");
  const openingEvents = await creditUser.queryFilter(creditUser.filters.CreateUserLendCredit(), startBlock, endBlock);
  console.log(`  Found ${openingEvents.length} position openings\n`);

  console.log("Fetching CreateUserBorrowed events...");
  const borrowedEvents = await creditUser.queryFilter(creditUser.filters.CreateUserBorrowed(), startBlock, endBlock);
  console.log(`  Found ${borrowedEvents.length} position executions\n`);

  const executionMap = new Map<string, any>();
  for (const event of borrowedEvents) {
    if (event.args) {
      const key = `${event.args._recipient.toLowerCase()}-${event.args._borrowedIndex.toString()}`;
      executionMap.set(key, event.args);
    }
  }

  console.log("Checking position termination status...");
  const positions: PositionData[] = [];
  let activeCount = 0;

  for (const event of openingEvents) {
    if (!event.args) continue;

    const farmer = event.args._recipient;
    const positionIndex = event.args._borrowedIndex.toNumber();

    const isTerminated = await creditUser.isTerminated(farmer, positionIndex);
    if (isTerminated) continue;

    activeCount++;
    const farmerLower = farmer.toLowerCase();
    const key = `${farmerLower}-${positionIndex}`;

    const execution = executionMap.get(key);
    if (!execution) {
      console.log(`⚠️  Warning: No execution data for ${farmer} position ${positionIndex}`);
      continue;
    }

    const originalAmount = event.args._amountIn;
    const liquidatorFee = originalAmount.mul(50).div(1000);
    const netCollateral = originalAmount.sub(liquidatorFee);

    let totalBorrowedFsGLP = ethers.BigNumber.from(0);
    for (const amount of execution._borrowedMintedAmount) {
      totalBorrowedFsGLP = totalBorrowedFsGLP.add(amount);
    }
    const totalFsGLP = execution._collateralMintedAmount.add(totalBorrowedFsGLP);

    const leverage = execution._collateralMintedAmount.gt(0)
      ? parseFloat(ethers.utils.formatEther(totalFsGLP)) /
        parseFloat(ethers.utils.formatEther(execution._collateralMintedAmount))
      : 0;

    positions.push({
      farmer: farmerLower,
      positionIndex,
      collateralToken: event.args._token,
      collateralAmount: ethers.utils.formatEther(originalAmount),
      liquidatorFee: ethers.utils.formatEther(liquidatorFee),
      netCollateral: ethers.utils.formatEther(netCollateral),
      borrowedTokens: event.args._borrowedTokens,
      borrowedAmounts: execution._borrowedAmountOuts.map((a: any) => ethers.utils.formatEther(a)),
      creditManagers: execution._creditManagers,
      collateralFsGLP: ethers.utils.formatEther(execution._collateralMintedAmount),
      borrowedFsGLP: execution._borrowedMintedAmount.map((a: any) => ethers.utils.formatEther(a)),
      totalFsGLP: ethers.utils.formatEther(totalFsGLP),
      leverage: leverage.toFixed(2),
    });
  }

  console.log(`\n✅ Found ${activeCount} active positions\n`);

  return positions;
}

// ============================================================================
// STEP 3: CALCULATE FARMER DISTRIBUTIONS
// ============================================================================

async function step3_calculateFarmerDistributions(
  positions: PositionData[],
  liquidatorFeesTotal: number
): Promise<FarmerDistribution[]> {
  console.log("=".repeat(80));
  console.log("STEP 3: Calculate Farmer Distributions");
  console.log("=".repeat(80) + "\n");

  const farmerData = new Map<string, { collateralFsGLP: number; totalFsGLP: number }>();
  let totalPositionFsGLP = 0;

  for (const pos of positions) {
    const collateralFsGLP = parseFloat(pos.collateralFsGLP);
    const totalFsGLP = parseFloat(pos.totalFsGLP);

    if (!farmerData.has(pos.farmer)) {
      farmerData.set(pos.farmer, { collateralFsGLP: 0, totalFsGLP: 0 });
    }

    const data = farmerData.get(pos.farmer)!;
    data.collateralFsGLP += collateralFsGLP;
    data.totalFsGLP += totalFsGLP;
    totalPositionFsGLP += totalFsGLP;
  }

  const distributions: FarmerDistribution[] = [];

  for (const [farmer, data] of farmerData) {
    const liquidatorFeesShare = (data.totalFsGLP / totalPositionFsGLP) * liquidatorFeesTotal;
    const totalFarmerFsGLP = data.collateralFsGLP + liquidatorFeesShare;

    distributions.push({
      farmer,
      collateralFsGLP: data.collateralFsGLP.toFixed(18),
      liquidatorFeesShare: liquidatorFeesShare.toFixed(18),
      totalFsGLP: totalFarmerFsGLP.toFixed(18),
    });
  }

  console.log(`✅ Calculated distributions for ${distributions.length} farmers\n`);

  return distributions;
}

// ============================================================================
// STEP 4: CALCULATE VAULT BORROWING TOTALS
// ============================================================================

function step4_calculateVaultBorrowing(positions: PositionData[]): Record<string, VaultBorrowing> {
  console.log("=".repeat(80));
  console.log("STEP 4: Calculate Vault Borrowing Totals");
  console.log("=".repeat(80) + "\n");

  const vaultBorrowing: Record<string, VaultBorrowing> = {
    WETH: { vault: "WETH", totalBorrowed: ethers.BigNumber.from(0), positionCount: 0 },
    WBTC: { vault: "WBTC", totalBorrowed: ethers.BigNumber.from(0), positionCount: 0 },
    USDT: { vault: "USDT", totalBorrowed: ethers.BigNumber.from(0), positionCount: 0 },
    USDC: { vault: "USDC", totalBorrowed: ethers.BigNumber.from(0), positionCount: 0 },
  };

  for (const position of positions) {
    const creditManagers = position.creditManagers;
    const borrowedFsGLP = position.borrowedFsGLP;

    for (let i = 0; i < creditManagers.length; i++) {
      const manager = creditManagers[i].toLowerCase();
      const amount = ethers.utils.parseEther(borrowedFsGLP[i]);
      const vault = CREDIT_MANAGER_TO_VAULT[manager];

      if (!vault) {
        console.warn(`⚠️  Unknown credit manager: ${manager}`);
        continue;
      }

      vaultBorrowing[vault].totalBorrowed = vaultBorrowing[vault].totalBorrowed.add(amount);
    }

    const vaultsUsed = new Set(creditManagers.map((m) => CREDIT_MANAGER_TO_VAULT[m.toLowerCase()]).filter(Boolean));
    for (const vault of vaultsUsed) {
      vaultBorrowing[vault].positionCount++;
    }
  }

  const vaultOrder = ["WBTC", "WETH", "USDT", "USDC"];
  for (const vault of vaultOrder) {
    const data = vaultBorrowing[vault];
    const formatted = parseFloat(ethers.utils.formatEther(data.totalBorrowed));
    console.log(`  ${vault}: ${formatted.toFixed(2)} fsGLP (${data.positionCount} positions)`);
  }
  console.log();

  return vaultBorrowing;
}

// ============================================================================
// STEP 5: CALCULATE LP DISTRIBUTIONS
// ============================================================================

async function step5_calculateLPDistributions(
  vaultBorrowing: Record<string, VaultBorrowing>
): Promise<LPDistribution[]> {
  console.log("=".repeat(80));
  console.log("STEP 5: Calculate LP Distributions");
  console.log("=".repeat(80) + "\n");

  // Read LP data from CSV
  const lpCsvPath = path.join(__dirname, "archi-unique-LPs.csv");
  if (!fs.existsSync(lpCsvPath)) {
    throw new Error(`File not found: ${lpCsvPath}`);
  }

  const lpCsv = fs.readFileSync(lpCsvPath, "utf-8");
  const lpLines = lpCsv.split("\n").filter((line) => line.trim());

  const header = lpLines[0].toLowerCase().split(",");
  const addressIdx = header.indexOf("address");
  const netWbtcIdx = header.indexOf("net_wbtc");
  const netWethIdx = header.indexOf("net_weth");
  const netUsdtIdx = header.indexOf("net_usdt");
  const netUsdcIdx = header.indexOf("net_usdc");

  if (addressIdx === -1 || netWbtcIdx === -1 || netWethIdx === -1 || netUsdtIdx === -1 || netUsdcIdx === -1) {
    throw new Error("CSV missing required columns");
  }

  const lpData: LPData[] = [];

  for (let i = 1; i < lpLines.length; i++) {
    const parts = lpLines[i].split(",");
    if (parts.length <= addressIdx) continue;

    const address = parts[addressIdx].trim().toLowerCase();
    if (!address.startsWith("0x")) continue;

    lpData.push({
      address: address,
      netWbtc: parseFloat(parts[netWbtcIdx] || "0"),
      netWeth: parseFloat(parts[netWethIdx] || "0"),
      netUsdt: parseFloat(parts[netUsdtIdx] || "0"),
      netUsdc: parseFloat(parts[netUsdcIdx] || "0"),
    });
  }

  console.log(`Found ${lpData.length} LP addresses\n`);

  const lpDistributions = new Map<string, LPDistribution>();

  for (const lp of lpData) {
    lpDistributions.set(lp.address, {
      address: lp.address,
      wbtc_vsTokens: "0",
      wbtc_fsGLP: "0",
      weth_vsTokens: "0",
      weth_fsGLP: "0",
      usdt_vsTokens: "0",
      usdt_fsGLP: "0",
      usdc_vsTokens: "0",
      usdc_fsGLP: "0",
      total_fsGLP: "0",
    });
  }

  const vaultOrder = ["WBTC", "WETH", "USDT", "USDC"];

  for (const vaultName of vaultOrder) {
    const borrowedFsGLP = vaultBorrowing[vaultName].totalBorrowed;

    const netField =
      vaultName === "WBTC"
        ? "netWbtc"
        : vaultName === "WETH"
        ? "netWeth"
        : vaultName === "USDT"
        ? "netUsdt"
        : "netUsdc";

    const relevantLPs = lpData.filter((lp) => lp[netField] > 0);

    let totalNetDeposits = 0;
    for (const lp of relevantLPs) {
      totalNetDeposits += lp[netField];
    }

    if (totalNetDeposits === 0) continue;

    let totalNetDepositsBN: ethers.BigNumber;
    if (vaultName === "WBTC") {
      totalNetDepositsBN = ethers.utils.parseUnits(totalNetDeposits.toFixed(8), 8);
    } else if (vaultName === "WETH") {
      totalNetDepositsBN = ethers.utils.parseUnits(totalNetDeposits.toFixed(18), 18);
    } else {
      totalNetDepositsBN = ethers.utils.parseUnits(totalNetDeposits.toFixed(6), 6);
    }

    for (const lp of relevantLPs) {
      const netDeposit = lp[netField];

      let netDepositWei: ethers.BigNumber;
      if (vaultName === "WBTC") {
        netDepositWei = ethers.utils.parseUnits(netDeposit.toFixed(8), 8);
      } else if (vaultName === "WETH") {
        netDepositWei = ethers.utils.parseUnits(netDeposit.toFixed(18), 18);
      } else {
        netDepositWei = ethers.utils.parseUnits(netDeposit.toFixed(6), 6);
      }

      const fsGLPEntitlement = borrowedFsGLP.mul(netDepositWei).div(totalNetDepositsBN);

      const dist = lpDistributions.get(lp.address)!;

      if (vaultName === "WBTC") {
        dist.wbtc_vsTokens = netDepositWei.toString();
        dist.wbtc_fsGLP = fsGLPEntitlement.toString();
      } else if (vaultName === "WETH") {
        dist.weth_vsTokens = netDepositWei.toString();
        dist.weth_fsGLP = fsGLPEntitlement.toString();
      } else if (vaultName === "USDT") {
        dist.usdt_vsTokens = netDepositWei.toString();
        dist.usdt_fsGLP = fsGLPEntitlement.toString();
      } else if (vaultName === "USDC") {
        dist.usdc_vsTokens = netDepositWei.toString();
        dist.usdc_fsGLP = fsGLPEntitlement.toString();
      }

      const currentTotal = ethers.BigNumber.from(dist.total_fsGLP);
      dist.total_fsGLP = currentTotal.add(fsGLPEntitlement).toString();
    }

    console.log(`  ${vaultName}: ${relevantLPs.length} LPs`);
  }

  const nonZeroDistributions = Array.from(lpDistributions.values()).filter((dist) =>
    ethers.BigNumber.from(dist.total_fsGLP).gt(0)
  );

  nonZeroDistributions.sort((a, b) => (ethers.BigNumber.from(b.total_fsGLP).sub(a.total_fsGLP).gt(0) ? 1 : -1));

  console.log(`\n✅ Calculated distributions for ${nonZeroDistributions.length} LPs\n`);

  return nonZeroDistributions;
}

// ============================================================================
// WRITE OUTPUT FILES
// ============================================================================

function writeOutputFiles(
  positions: PositionData[],
  farmerDistributions: FarmerDistribution[],
  vaultBorrowing: Record<string, VaultBorrowing>,
  lpDistributions: LPDistribution[]
) {
  console.log("=".repeat(80));
  console.log("Writing Output Files");
  console.log("=".repeat(80) + "\n");

  // 1. Farmer positions
  const positionsPath = path.join(__dirname, "farmer-positions.csv");
  const positionRows = [
    "farmer,position_index,collateral_token,collateral_amount,liquidator_fee,net_collateral,borrowed_tokens,borrowed_amounts,credit_managers,collateral_fsGLP,borrowed_fsGLP,total_fsGLP,leverage",
    ...positions.map((p) =>
      [
        p.farmer,
        p.positionIndex,
        p.collateralToken,
        p.collateralAmount,
        p.liquidatorFee,
        p.netCollateral,
        `"${JSON.stringify(p.borrowedTokens)}"`,
        `"${JSON.stringify(p.borrowedAmounts)}"`,
        `"${JSON.stringify(p.creditManagers)}"`,
        p.collateralFsGLP,
        `"${JSON.stringify(p.borrowedFsGLP)}"`,
        p.totalFsGLP,
        p.leverage,
      ].join(",")
    ),
  ];
  fs.writeFileSync(positionsPath, positionRows.join("\n"));
  console.log(`✅ farmer-positions.csv (${positions.length} positions)`);

  // 2. Farmer distributions
  const farmerDistPath = path.join(__dirname, "farmer-distributions.csv");
  const farmerRows = [
    "farmer,collateral_fsGLP,liquidator_fees_share,total_fsGLP",
    ...farmerDistributions.map((d) => `${d.farmer},${d.collateralFsGLP},${d.liquidatorFeesShare},${d.totalFsGLP}`),
  ];
  fs.writeFileSync(farmerDistPath, farmerRows.join("\n"));
  console.log(`✅ farmer-distributions.csv (${farmerDistributions.length} farmers)`);

  // 3. Vault borrowing summary
  const vaultSummaryPath = path.join(__dirname, "vault-borrowing-summary.csv");
  const vaultOrder = ["WBTC", "WETH", "USDT", "USDC"];
  const totalBorrowed = Object.values(vaultBorrowing).reduce(
    (sum, v) => sum.add(v.totalBorrowed),
    ethers.BigNumber.from(0)
  );
  const vaultSummaryRows = [
    "vault,borrowed_fsGLP,percentage,position_count",
    ...vaultOrder.map((vault) => {
      const data = vaultBorrowing[vault];
      const formatted = parseFloat(ethers.utils.formatEther(data.totalBorrowed));
      const pct = totalBorrowed.gt(0)
        ? (Number(data.totalBorrowed.mul(10000).div(totalBorrowed)) / 100).toFixed(2)
        : "0.00";
      return `${vault},${formatted.toFixed(2)},${pct},${data.positionCount}`;
    }),
  ];
  fs.writeFileSync(vaultSummaryPath, vaultSummaryRows.join("\n"));
  console.log(`✅ vault-borrowing-summary.csv (4 vaults)`);

  // 4. Vault borrowing breakdown
  const vaultBreakdownPath = path.join(__dirname, "vault-borrowing-breakdown.csv");
  const breakdownRows: string[] = ["farmer,position_index,vault,borrowed_fsGLP"];
  for (const position of positions) {
    for (let i = 0; i < position.creditManagers.length; i++) {
      const manager = position.creditManagers[i].toLowerCase();
      const vault = CREDIT_MANAGER_TO_VAULT[manager];
      if (vault) {
        breakdownRows.push(`${position.farmer},${position.positionIndex},${vault},${position.borrowedFsGLP[i]}`);
      }
    }
  }
  fs.writeFileSync(vaultBreakdownPath, breakdownRows.join("\n"));
  console.log(`✅ vault-borrowing-breakdown.csv (${breakdownRows.length - 1} borrowings)`);

  // 5. LP distributions
  const lpDistPath = path.join(__dirname, "lp-distributions.csv");
  const lpRows = [
    "address,wbtc_fsGLP,weth_fsGLP,usdt_fsGLP,usdc_fsGLP,total_fsGLP",
    ...lpDistributions.map((d) =>
      [
        d.address,
        ethers.utils.formatEther(d.wbtc_fsGLP),
        ethers.utils.formatEther(d.weth_fsGLP),
        ethers.utils.formatEther(d.usdt_fsGLP),
        ethers.utils.formatEther(d.usdc_fsGLP),
        ethers.utils.formatEther(d.total_fsGLP),
      ].join(",")
    ),
  ];
  fs.writeFileSync(lpDistPath, lpRows.join("\n"));
  console.log(`✅ lp-distributions.csv (${lpDistributions.length} LPs)`);

  // 6. LP distributions by vault (detailed)
  const lpDetailPath = path.join(__dirname, "lp-distributions-by-vault.csv");
  const lpDetailRows = [
    "address,wbtc_vsTokens,wbtc_fsGLP,weth_vsTokens,weth_fsGLP,usdt_vsTokens,usdt_fsGLP,usdc_vsTokens,usdc_fsGLP,total_fsGLP",
    ...lpDistributions.map((d) =>
      [
        d.address,
        d.wbtc_vsTokens,
        ethers.utils.formatEther(d.wbtc_fsGLP),
        d.weth_vsTokens,
        ethers.utils.formatEther(d.weth_fsGLP),
        d.usdt_vsTokens,
        ethers.utils.formatEther(d.usdt_fsGLP),
        d.usdc_vsTokens,
        ethers.utils.formatEther(d.usdc_fsGLP),
        ethers.utils.formatEther(d.total_fsGLP),
      ].join(",")
    ),
  ];
  fs.writeFileSync(lpDetailPath, lpDetailRows.join("\n"));
  console.log(`✅ lp-distributions-by-vault.csv (${lpDistributions.length} LPs)\n`);
}

// ============================================================================
// UPDATE MARKDOWN WITH DISTRIBUTION TABLES
// ============================================================================

function updateMarkdownTables(farmerDistributions: FarmerDistribution[], lpDistributions: LPDistribution[]) {
  console.log("=".repeat(80));
  console.log("Updating ARCHI_DISTRIBUTIONS.md with distribution tables");
  console.log("=".repeat(80) + "\n");

  const mdPath = path.join(__dirname, "ARCHI_DISTRIBUTIONS.md");

  if (!fs.existsSync(mdPath)) {
    console.log("⚠️  ARCHI_DISTRIBUTIONS.md not found, skipping markdown update\n");
    return;
  }

  let mdContent = fs.readFileSync(mdPath, "utf-8");

  // Calculate farmer percentages
  const farmerTotal = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.totalFsGLP), 0);

  // Generate farmer table
  const farmerTableRows = farmerDistributions
    .sort((a, b) => parseFloat(b.totalFsGLP) - parseFloat(a.totalFsGLP))
    .map((f) => {
      const collateral = parseFloat(f.collateralFsGLP);
      const fees = parseFloat(f.liquidatorFeesShare);
      const total = parseFloat(f.totalFsGLP);
      const pct = ((total / farmerTotal) * 100).toFixed(2);
      return `| ${f.farmer} | ${collateral.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${fees
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | **${total
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | ${pct}% |`;
    });

  const farmerTotalCollateral = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.collateralFsGLP), 0);
  const farmerTotalFees = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.liquidatorFeesShare), 0);

  const farmerTable = `### Farmer Distributions (${farmerDistributions.length} farmers)

| Farmer Address | Collateral fsGLP | Liquidator Fees Share | Total fsGLP | % of Farmer Total |
|----------------|------------------|----------------------|-------------|-------------------|
${farmerTableRows.join("\n")}
| **TOTAL** | **${farmerTotalCollateral.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${farmerTotalFees
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${farmerTotal
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **100%** |`;

  // Generate LP table (top 25)
  const top25LPs = lpDistributions.slice(0, 25);
  const lpTableRows = top25LPs.map((lp, idx) => {
    const wbtc = parseFloat(ethers.utils.formatEther(lp.wbtc_fsGLP));
    const weth = parseFloat(ethers.utils.formatEther(lp.weth_fsGLP));
    const usdt = parseFloat(ethers.utils.formatEther(lp.usdt_fsGLP));
    const usdc = parseFloat(ethers.utils.formatEther(lp.usdc_fsGLP));
    const total = parseFloat(ethers.utils.formatEther(lp.total_fsGLP));

    return `| ${idx + 1} | ${lp.address} | ${wbtc.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${weth
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${usdt.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${usdc
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | **${total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** |`;
  });

  const lpTotalWbtc = lpDistributions.reduce((sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.wbtc_fsGLP)), 0);
  const lpTotalWeth = lpDistributions.reduce((sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.weth_fsGLP)), 0);
  const lpTotalUsdt = lpDistributions.reduce((sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.usdt_fsGLP)), 0);
  const lpTotalUsdc = lpDistributions.reduce((sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.usdc_fsGLP)), 0);
  const lpGrandTotal = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.total_fsGLP)),
    0
  );

  const lpTable = `### LP Distributions - Top 25 (${lpDistributions.length} LPs total)

| Rank | LP Address | WBTC fsGLP | WETH fsGLP | USDT fsGLP | USDC fsGLP | Total fsGLP |
|------|------------|------------|------------|------------|------------|-------------|
${lpTableRows.join("\n")}
| ... | ... | ... | ... | ... | ... | ... |
| ${lpDistributions.length} | **TOTAL (All LPs)** | **${lpTotalWbtc
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalWeth
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalUsdt
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalUsdc
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpGrandTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** |

**Note:** Full LP distribution list available in \`lp-distributions.csv\` (${lpDistributions.length} LPs total)`;

  // Generate timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";

  const newTablesSection = `---

## Detailed Distribution Tables

*Last updated: ${timestamp}*

${farmerTable}

${lpTable}
`;

  // Find and replace the detailed tables section
  const detailedTablesRegex = /---\s*\n\s*## Detailed Distribution Tables[\s\S]*$/;

  if (detailedTablesRegex.test(mdContent)) {
    // Replace existing section
    mdContent = mdContent.replace(detailedTablesRegex, newTablesSection);
    console.log("✅ Updated existing distribution tables in ARCHI_DISTRIBUTIONS.md\n");
  } else {
    // Append to end of file
    mdContent += "\n" + newTablesSection;
    console.log("✅ Appended distribution tables to ARCHI_DISTRIBUTIONS.md\n");
  }

  fs.writeFileSync(mdPath, mdContent);
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(
  totals: { total: number; gmxExecutor: number; creditUser2: number; creditAggregator: number },
  farmerDistributions: FarmerDistribution[],
  lpDistributions: LPDistribution[]
) {
  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80) + "\n");

  const farmerTotal = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.totalFsGLP), 0);
  const lpTotal = lpDistributions.reduce((sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.total_fsGLP)), 0);
  const distributed = farmerTotal + lpTotal;

  console.log("Distribution Breakdown:");
  console.log(`  Farmers:    ${farmerTotal.toFixed(2)} fsGLP (${farmerDistributions.length} farmers)`);
  console.log(`  LPs:        ${lpTotal.toFixed(2)} fsGLP (${lpDistributions.length} LPs)`);
  console.log(`  Total:      ${distributed.toFixed(2)} fsGLP`);
  console.log(`  Expected:   ${(totals.gmxExecutor + totals.creditUser2).toFixed(2)} fsGLP\n`);

  const totalUnique = new Set([...farmerDistributions.map((f) => f.farmer), ...lpDistributions.map((lp) => lp.address)])
    .size;

  console.log(`Total unique addresses: ${totalUnique}\n`);

  console.log("=".repeat(80));
  console.log("✅ COMPLETE: All distributions calculated successfully!");
  console.log("=".repeat(80) + "\n");
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("ARCHI DISTRIBUTIONS: Complete End-to-End Calculation");
  console.log("=".repeat(80));

  const [signer] = await ethers.getSigners();
  const provider = signer.provider!;

  const totals = await step1_verifyTotal(provider);
  const positions = await step2_extractPositions(provider);
  const farmerDistributions = await step3_calculateFarmerDistributions(positions, totals.creditUser2);
  const vaultBorrowing = step4_calculateVaultBorrowing(positions);
  const lpDistributions = await step5_calculateLPDistributions(vaultBorrowing);

  writeOutputFiles(positions, farmerDistributions, vaultBorrowing, lpDistributions);
  updateMarkdownTables(farmerDistributions, lpDistributions);
  printSummary(totals, farmerDistributions, lpDistributions);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
