import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// npx hardhat run --network arbitrum scripts/distributions/archi/calculateDistributionsFarmers.ts

/**
 * FARMER DISTRIBUTIONS: Complete End-to-End Calculation
 *
 * Contract Discovery:
 *   Dune query (archi-contracts-fsGLP-balances.sql) identified all Archi contracts
 *   holding fsGLP at the time of GMX V1 shutdown incident.
 *   Query: https://dune.com/queries/5781806
 *
 *   Three contracts held fsGLP balances:
 *   - GMXExecutor: Farmer positions (collateral + borrowed)
 *   - CreditUser #2: Reserved liquidator fees (5% of collateral)
 *   - CreditAggregator: Small unaccounted amount (~100 fsGLP, source unknown)
 *
 * Step 1: Verify Total fsGLP Holdings
 *   - Queries GMXExecutor, CreditUser #2, and CreditAggregator balances
 *   - Verifies total matches expected (1,615,172.99 fsGLP)
 *   - Note: Only GMXExecutor + CreditUser #2 will be distributed
 *
 * Step 2: Extract Active Position Data
 *   - Queries CreateUserLendCredit and CreateUserBorrowed events
 *   - Filters for active positions (non-terminated)
 *   - Outputs: farmer-positions.csv
 *
 * Step 3: Calculate Farmer Distributions
 *   - Aggregates positions by farmer
 *   - Calculates liquidator fee shares
 *   - Outputs: farmer-distributions.csv
 *
 * Step 4: Calculate Vault Borrowing
 *   - Aggregates borrowed fsGLP by vault (WBTC/WETH/USDT/USDC)
 *   - Uses credit_managers field to map positions to vaults
 *   - Outputs: vault-borrowing-summary.csv, vault-borrowing-breakdown.csv
 *
 * Outputs:
 *   - farmer-positions.csv: All 47 active positions with fsGLP breakdown
 *   - farmer-distributions.csv: Final farmer distributions (4 farmers)
 *   - vault-borrowing-summary.csv: Total borrowed fsGLP by vault
 *   - vault-borrowing-breakdown.csv: Vault borrowing by position
 */

const CONTRACTS = {
  GMXExecutor: "0x49ee14e37cb47bff8c512b3a0d672302a3446eb1",
  CreditUser2: "0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E",
  CreditAggregator: "0x437a182b571390c7e5d14cc7103d3b9d7628faca", // Small unaccounted amount (~100 fsGLP)
  fsGLP: "0x1aDDD80E6039594eE970E5872D247bf0414C8903",
};

const CREDIT_USER_ABI = [
  "event CreateUserLendCredit(address indexed _recipient, uint256 _borrowedIndex, address _depositor, address _token, uint256 _amountIn, address[] _borrowedTokens, uint256[] _ratios)",
  "event CreateUserBorrowed(address indexed _recipient, uint256 _borrowedIndex, address[] _creditManagers, uint256[] _borrowedAmountOuts, uint256 _collateralMintedAmount, uint256[] _borrowedMintedAmount, uint256 _borrowedAt)",
  "function isTerminated(address _recipient, uint256 _borrowedIndex) view returns (bool)",
];

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

interface PositionData {
  farmer: string;
  positionIndex: number;
  collateralToken: string;
  collateralAmount: string; // Original collateral before liquidator fee
  liquidatorFee: string; // 5% reserved fee
  netCollateral: string; // Collateral after fee deduction
  borrowedTokens: string[];
  borrowedAmounts: string[];
  creditManagers: string[]; // Maps to vaults (WETH/WBTC/USDT/USDC)
  collateralFsGLP: string;
  borrowedFsGLP: string[];
  totalFsGLP: string;
  leverage: string; // Effective leverage ratio
}

interface FarmerDistribution {
  farmer: string;
  collateralFsGLP: string;
  liquidatorFeesShare: string;
  totalFsGLP: string;
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
  console.log(`  CreditAggregator: ${creditAggregatorFormatted.toFixed(2)} fsGLP (unaccounted - not distributed)`);
  console.log(`  TOTAL: ${total.toFixed(2)} fsGLP\n`);

  console.log("Distribution:");
  console.log(`  Will distribute: ${(gmxExecutorFormatted + creditUser2Formatted).toFixed(2)} fsGLP`);
  console.log(`  Not distributed: ${creditAggregatorFormatted.toFixed(2)} fsGLP (source unknown)\n`);

  const expectedDistributable = 1615172.99;
  const distributable = gmxExecutorFormatted + creditUser2Formatted;

  if (Math.abs(distributable - expectedDistributable) < 1) {
    console.log("✅ VERIFIED: Distributable fsGLP matches expected amount\n");
  } else {
    console.log("⚠️  WARNING: Distributable fsGLP does not match expected (1,615,172.99)\n");
  }

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

  const startBlock = 73828000; // Contract deployment
  const endBlock = await provider.getBlockNumber();

  console.log(`Querying events from block ${startBlock} to ${endBlock}...\n`);

  // Query position opening events
  console.log("Fetching CreateUserLendCredit events...");
  const openingEvents = await creditUser.queryFilter(creditUser.filters.CreateUserLendCredit(), startBlock, endBlock);
  console.log(`  Found ${openingEvents.length} position openings\n`);

  // Query position execution events
  console.log("Fetching CreateUserBorrowed events...");
  const borrowedEvents = await creditUser.queryFilter(creditUser.filters.CreateUserBorrowed(), startBlock, endBlock);
  console.log(`  Found ${borrowedEvents.length} position executions\n`);

  // Map executions by (farmer, index)
  const executionMap = new Map<string, any>();
  for (const event of borrowedEvents) {
    if (event.args) {
      const key = `${event.args._recipient.toLowerCase()}-${event.args._borrowedIndex.toString()}`;
      executionMap.set(key, event.args);
    }
  }

  // Filter for active positions
  console.log("Checking position termination status...");
  const positions: PositionData[] = [];
  let activeCount = 0;
  let closedCount = 0;

  for (const event of openingEvents) {
    if (!event.args) continue;

    const farmer = event.args._recipient;
    const positionIndex = event.args._borrowedIndex.toNumber();

    const isTerminated = await creditUser.isTerminated(farmer, positionIndex);
    if (isTerminated) {
      closedCount++;
      continue;
    }

    activeCount++;
    const farmerLower = farmer.toLowerCase();
    const key = `${farmerLower}-${positionIndex}`;

    const execution = executionMap.get(key);
    if (!execution) {
      console.log(`⚠️  Warning: No execution data for ${farmer} position ${positionIndex}`);
      continue;
    }

    // Calculate amounts
    const originalAmount = event.args._amountIn;
    const liquidatorFee = originalAmount.mul(50).div(1000); // 5%
    const netCollateral = originalAmount.sub(liquidatorFee);

    let totalBorrowedFsGLP = ethers.BigNumber.from(0);
    for (const amount of execution._borrowedMintedAmount) {
      totalBorrowedFsGLP = totalBorrowedFsGLP.add(amount);
    }
    const totalFsGLP = execution._collateralMintedAmount.add(totalBorrowedFsGLP);

    // Calculate leverage ratio
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

  console.log("\n" + "=".repeat(80));
  console.log(`Summary:`);
  console.log(`  Total positions opened: ${openingEvents.length}`);
  console.log(`  Closed positions: ${closedCount}`);
  console.log(`  Active positions: ${activeCount}`);
  console.log("=".repeat(80) + "\n");

  if (activeCount !== 47) {
    console.log(`⚠️  WARNING: Expected 47 active positions, found ${activeCount}\n`);
  } else {
    console.log(`✅ VERIFIED: Found exactly 47 active positions\n`);
  }

  // Verify total matches Step 1
  let totalFsGLP = ethers.BigNumber.from(0);
  for (const pos of positions) {
    totalFsGLP = totalFsGLP.add(ethers.utils.parseEther(pos.totalFsGLP));
  }
  const totalFormatted = parseFloat(ethers.utils.formatEther(totalFsGLP));
  console.log(`Total fsGLP from positions: ${totalFormatted.toFixed(2)}`);
  console.log(`Expected from Step 1: 1,606,694.32 fsGLP\n`);

  const diff = Math.abs(totalFormatted - 1606694.32);
  if (diff < 1) {
    console.log(`✅ VERIFIED: Position fsGLP matches GMXExecutor balance\n`);
  } else {
    console.log(`⚠️  WARNING: Position fsGLP doesn't match (diff: ${diff.toFixed(2)})\n`);
  }

  return positions;
}

// ============================================================================
// STEP 3: CALCULATE FARMER DISTRIBUTIONS
// ============================================================================

async function step3_calculateDistributions(
  positions: PositionData[],
  liquidatorFeesTotal: number
): Promise<FarmerDistribution[]> {
  console.log("=".repeat(80));
  console.log("STEP 3: Calculate Farmer Distributions");
  console.log("=".repeat(80) + "\n");

  // Aggregate by farmer
  const farmerData = new Map<string, { collateralFsGLP: number; totalFsGLP: number; borrowedFsGLP: number }>();
  let totalPositionFsGLP = 0;
  let totalCollateralFsGLP = 0;
  let totalBorrowedFsGLP = 0;

  for (const pos of positions) {
    const collateralFsGLP = parseFloat(pos.collateralFsGLP);
    const borrowedFsGLP = pos.borrowedFsGLP.reduce((sum, val) => sum + parseFloat(val), 0);
    const totalFsGLP = parseFloat(pos.totalFsGLP);

    if (!farmerData.has(pos.farmer)) {
      farmerData.set(pos.farmer, { collateralFsGLP: 0, totalFsGLP: 0, borrowedFsGLP: 0 });
    }

    const data = farmerData.get(pos.farmer)!;
    data.collateralFsGLP += collateralFsGLP;
    data.totalFsGLP += totalFsGLP;
    data.borrowedFsGLP += borrowedFsGLP;

    totalPositionFsGLP += totalFsGLP;
    totalCollateralFsGLP += collateralFsGLP;
    totalBorrowedFsGLP += borrowedFsGLP;
  }

  console.log("Position Summary:");
  console.log(`  Total fsGLP in positions: ${totalPositionFsGLP.toFixed(2)}`);
  console.log(`  Total collateral fsGLP: ${totalCollateralFsGLP.toFixed(2)}`);
  console.log(`  Total borrowed fsGLP: ${totalBorrowedFsGLP.toFixed(2)}`);
  console.log(`  Liquidator fees: ${liquidatorFeesTotal.toFixed(2)}\n`);

  // Calculate distributions
  const distributions: FarmerDistribution[] = [];

  console.log("Farmer Distributions:\n");

  for (const [farmer, data] of farmerData) {
    const liquidatorFeesShare = (data.totalFsGLP / totalPositionFsGLP) * liquidatorFeesTotal;
    const totalFarmerFsGLP = data.collateralFsGLP + liquidatorFeesShare;

    distributions.push({
      farmer,
      collateralFsGLP: data.collateralFsGLP.toFixed(18),
      liquidatorFeesShare: liquidatorFeesShare.toFixed(18),
      totalFsGLP: totalFarmerFsGLP.toFixed(18),
    });

    console.log(`${farmer}:`);
    console.log(`  Collateral fsGLP: ${data.collateralFsGLP.toFixed(6)}`);
    console.log(`  Liquidator fees share: ${liquidatorFeesShare.toFixed(6)}`);
    console.log(`  Total: ${totalFarmerFsGLP.toFixed(6)} fsGLP\n`);
  }

  const totalFarmerDistribution = distributions.reduce((sum, f) => sum + parseFloat(f.totalFsGLP), 0);

  console.log("=".repeat(80));
  console.log(`Total Farmer Distribution: ${totalFarmerDistribution.toFixed(2)} fsGLP`);
  console.log(`Expected: ${(totalCollateralFsGLP + liquidatorFeesTotal).toFixed(2)} fsGLP`);
  console.log("=".repeat(80) + "\n");

  console.log("Distribution Summary:");
  console.log(`  Total fsGLP: 1,615,172.99`);
  console.log(
    `    - Farmers: ${totalFarmerDistribution.toFixed(2)} fsGLP (${(
      (totalFarmerDistribution / 1615172.99) *
      100
    ).toFixed(2)}%)`
  );
  console.log(
    `    - LPs: ${totalBorrowedFsGLP.toFixed(2)} fsGLP (${((totalBorrowedFsGLP / 1615172.99) * 100).toFixed(2)}%)\n`
  );

  const totalDistributed = totalFarmerDistribution + totalBorrowedFsGLP;
  const expectedTotal = 1615172.99;
  const diff = Math.abs(totalDistributed - expectedTotal);

  if (diff < 1) {
    console.log(`✅ VERIFIED: Total distributions match expected (diff: ${diff.toFixed(6)})\n`);
  } else {
    console.log(`⚠️  WARNING: Total doesn't match (diff: ${diff.toFixed(2)})\n`);
  }

  return distributions;
}

// ============================================================================
// STEP 4: CALCULATE VAULT BORROWING TOTALS
// ============================================================================

interface VaultBorrowing {
  vault: string;
  totalBorrowed: ethers.BigNumber;
  positionCount: number;
}

// Map credit manager addresses to vault tokens
const CREDIT_MANAGER_TO_VAULT: Record<string, string> = {
  // WETH vault managers
  "0xb99d8d7fc3f59b38fde1b79aedf07c52ca05d63a": "WETH",
  "0xf5eb3768b9b50e6e019e50e62da8ac0444c6af98": "WETH",
  // WBTC vault managers
  "0x21aae858bf9a3668e95576e45df785f1f6bb9ee7": "WBTC",
  "0xc2a4aae7f7534f9e6b84827e44d7dc0b23fa79f3": "WBTC",
  // USDT vault managers
  "0x8de15602ac68427a5d16da9ef956408852c2c29c": "USDT",
  "0x14192d4c06e223e54cf72a03da6ff21689802794": "USDT",
  // USDC vault managers
  "0x08dcf2fc5ea34e1615689095646520d18d324f0a": "USDC",
  "0x0ea8c08c3b682a3cd964c416a2966b089b4497ba": "USDC",
  "0xaf32b65b4e7a833040b24d41aec2962c047c4440": "USDC",
};

function step4_calculateVaultBorrowing(positions: PositionData[]): Record<string, VaultBorrowing> {
  console.log("=".repeat(80));
  console.log("STEP 4: Calculate Vault Borrowing Totals");
  console.log("=".repeat(80) + "\n");

  // Initialize vault tracking
  const vaultBorrowing: Record<string, VaultBorrowing> = {
    WETH: { vault: "WETH", totalBorrowed: ethers.BigNumber.from(0), positionCount: 0 },
    WBTC: { vault: "WBTC", totalBorrowed: ethers.BigNumber.from(0), positionCount: 0 },
    USDT: { vault: "USDT", totalBorrowed: ethers.BigNumber.from(0), positionCount: 0 },
    USDC: { vault: "USDC", totalBorrowed: ethers.BigNumber.from(0), positionCount: 0 },
  };

  let totalBorrowedAcrossAllVaults = ethers.BigNumber.from(0);

  // Process each position
  for (const position of positions) {
    const creditManagers = position.creditManagers;
    const borrowedFsGLP = position.borrowedFsGLP;

    // Process each borrowed amount
    for (let i = 0; i < creditManagers.length; i++) {
      const manager = creditManagers[i].toLowerCase();
      const amount = ethers.utils.parseEther(borrowedFsGLP[i]);
      const vault = CREDIT_MANAGER_TO_VAULT[manager];

      if (!vault) {
        console.warn(`⚠️  Unknown credit manager: ${manager}`);
        continue;
      }

      // Update vault totals
      vaultBorrowing[vault].totalBorrowed = vaultBorrowing[vault].totalBorrowed.add(amount);
      totalBorrowedAcrossAllVaults = totalBorrowedAcrossAllVaults.add(amount);
    }

    // Count unique positions per vault
    const vaultsUsed = new Set(creditManagers.map((m) => CREDIT_MANAGER_TO_VAULT[m.toLowerCase()]).filter(Boolean));
    for (const vault of vaultsUsed) {
      vaultBorrowing[vault].positionCount++;
    }
  }

  // Display results
  console.log("Vault Borrowing Breakdown:\n");
  const vaultOrder = ["WBTC", "WETH", "USDT", "USDC"];
  for (const vault of vaultOrder) {
    const data = vaultBorrowing[vault];
    const formatted = parseFloat(ethers.utils.formatEther(data.totalBorrowed));
    const percentage = totalBorrowedAcrossAllVaults.gt(0)
      ? (Number(data.totalBorrowed.mul(10000).div(totalBorrowedAcrossAllVaults)) / 100).toFixed(2)
      : "0.00";

    console.log(
      `  ${vault}: ${formatted.toFixed(2).padStart(12)} fsGLP (${percentage.padStart(6)}%) - ${
        data.positionCount
      } positions`
    );
  }

  const totalFormatted = parseFloat(ethers.utils.formatEther(totalBorrowedAcrossAllVaults));
  console.log(`  ${"TOTAL".padEnd(4)}: ${totalFormatted.toFixed(2).padStart(12)} fsGLP (100.00%)\n`);

  console.log(`✅ Vault borrowing calculated for ${positions.length} positions\n`);

  return vaultBorrowing;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("FARMER DISTRIBUTIONS: Complete Calculation");
  console.log("=".repeat(80));

  const [signer] = await ethers.getSigners();
  const provider = signer.provider!;

  // Step 1: Verify totals
  const totals = await step1_verifyTotal(provider);

  // Step 2: Extract positions
  const positions = await step2_extractPositions(provider);

  // Step 3: Calculate distributions
  const distributions = await step3_calculateDistributions(positions, totals.creditUser2);

  // Step 4: Calculate vault borrowing
  const vaultBorrowing = step4_calculateVaultBorrowing(positions);

  // ========================================================================
  // WRITE OUTPUT FILES
  // ========================================================================

  console.log("=".repeat(80));
  console.log("Writing Output Files");
  console.log("=".repeat(80) + "\n");

  // Output 1: Positions CSV
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
  console.log(`✅ Positions written to: farmer-positions.csv`);
  console.log(`   (${positions.length} positions)\n`);

  // Output 2: Distributions CSV
  const distributionsPath = path.join(__dirname, "farmer-distributions.csv");
  const distributionRows = [
    "farmer,collateral_fsGLP,liquidator_fees_share,total_fsGLP",
    ...distributions.map((d) => `${d.farmer},${d.collateralFsGLP},${d.liquidatorFeesShare},${d.totalFsGLP}`),
  ];
  fs.writeFileSync(distributionsPath, distributionRows.join("\n"));
  console.log(`✅ Distributions written to: farmer-distributions.csv`);
  console.log(`   (${distributions.length} farmers)\n`);

  // Output 3: Vault Borrowing Summary CSV
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
  console.log(`✅ Vault borrowing summary written to: vault-borrowing-summary.csv`);
  console.log(`   (4 vaults)\n`);

  // Output 4: Vault Borrowing Breakdown CSV (by position)
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
  console.log(`✅ Vault borrowing breakdown written to: vault-borrowing-breakdown.csv`);
  console.log(`   (${breakdownRows.length - 1} vault borrowings across ${positions.length} positions)\n`);

  console.log("=".repeat(80));
  console.log("COMPLETE: All calculations finished successfully!");
  console.log("=".repeat(80) + "\n");

  console.log("Output Files:");
  console.log("  1. farmer-positions.csv - All active position details");
  console.log("  2. farmer-distributions.csv - Final farmer distributions");
  console.log("  3. vault-borrowing-summary.csv - Vault borrowing totals");
  console.log("  4. vault-borrowing-breakdown.csv - Vault borrowing by position\n");

  console.log("Next Step:");
  console.log("  Run LP distribution calculation (Step 5) to distribute vault borrowing to LPs\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
