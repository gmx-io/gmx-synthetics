import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// npx hardhat run --network arbitrum scripts/distributions/archi/step3_calculateDistributions.ts

/**
 * STEP 3: Calculate Farmer Distributions
 *
 * This script calculates how much fsGLP each farmer should receive:
 * - Farmers: Get their collateral fsGLP + proportional share of liquidator fees (8,478.67 fsGLP)
 * - Also calculates total borrowed fsGLP that will be distributed to LPs in Step 4
 *
 * Inputs: step2_position-data-raw.csv
 * Outputs: step3_farmer-distributions.csv
 */

const LIQUIDATOR_FEES_TOTAL = "8478.669565"; // From CreditUser #2

interface FarmerDistribution {
  farmer: string;
  collateralFsGLP: string;
  liquidatorFeesShare: string;
  totalFsGLP: string;
}

interface LPDistribution {
  lpAddress: string;
  vsTokenBalance: string;
  borrowedFsGLP: string;
}

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("STEP 3: Calculate Distribution Shares");
  console.log("=".repeat(80) + "\n");

  const [signer] = await ethers.getSigners();
  const provider = signer.provider!;

  // Read position data from Step 2
  const csvPath = path.join(__dirname, "step2_position-data-raw.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error("step2_position-data-raw.csv not found. Run step2 first.");
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").slice(1); // Skip header

  // Parse position data
  const farmerData = new Map<string, { collateralFsGLP: number; totalFsGLP: number; borrowedFsGLP: number }>();
  let totalPositionFsGLP = 0;
  let totalCollateralFsGLP = 0;
  let totalBorrowedFsGLP = 0;

  console.log("Parsing position data from CSV...\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    // Parse CSV line properly (handle quoted fields with commas)
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const parts = line.split(regex);

    const farmer = parts[0].trim().toLowerCase();
    const collateralFsGLP = parseFloat(parts[6].trim());

    // Parse the borrowed fsGLP array - it's wrapped in quotes
    const borrowedFsGLPStr = parts[7].trim().replace(/^"|"$/g, ""); // Remove outer quotes
    const borrowedFsGLPArray = JSON.parse(borrowedFsGLPStr);

    const totalFsGLP = parseFloat(parts[8].trim());

    // Sum borrowed fsGLP
    const borrowedFsGLP = borrowedFsGLPArray.reduce((sum: number, val: string) => sum + parseFloat(val), 0);

    if (!farmerData.has(farmer)) {
      farmerData.set(farmer, { collateralFsGLP: 0, totalFsGLP: 0, borrowedFsGLP: 0 });
    }

    const data = farmerData.get(farmer)!;
    data.collateralFsGLP += collateralFsGLP;
    data.totalFsGLP += totalFsGLP;
    data.borrowedFsGLP += borrowedFsGLP;

    totalPositionFsGLP += totalFsGLP;
    totalCollateralFsGLP += collateralFsGLP;
    totalBorrowedFsGLP += borrowedFsGLP;
  }

  console.log("Position Summary:");
  console.log(`  Total fsGLP in positions: ${totalPositionFsGLP.toFixed(6)}`);
  console.log(`  Total collateral fsGLP: ${totalCollateralFsGLP.toFixed(6)}`);
  console.log(`  Total borrowed fsGLP: ${totalBorrowedFsGLP.toFixed(6)}`);
  console.log(`  Liquidator fees: ${LIQUIDATOR_FEES_TOTAL}\n`);

  // Calculate farmer distributions
  console.log("=".repeat(80));
  console.log("FARMER DISTRIBUTIONS");
  console.log("=".repeat(80) + "\n");

  const farmerDistributions: FarmerDistribution[] = [];
  const liquidatorFeesNum = parseFloat(LIQUIDATOR_FEES_TOTAL);

  for (const [farmer, data] of farmerData) {
    // Each farmer gets:
    // 1. Their collateral fsGLP
    // 2. Proportional share of liquidator fees based on their total position size
    const liquidatorFeesShare = (data.totalFsGLP / totalPositionFsGLP) * liquidatorFeesNum;
    const totalFarmerFsGLP = data.collateralFsGLP + liquidatorFeesShare;

    farmerDistributions.push({
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

  // Calculate total farmer distribution
  const totalFarmerDistribution = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.totalFsGLP), 0);

  console.log("=".repeat(80));
  console.log(`Total Farmer Distribution: ${totalFarmerDistribution.toFixed(6)} fsGLP`);
  console.log(`Expected: ${(totalCollateralFsGLP + liquidatorFeesNum).toFixed(6)} fsGLP`);
  console.log("=".repeat(80) + "\n");

  // Query LP distributions
  console.log("=".repeat(80));
  console.log("LP DISTRIBUTIONS (Querying vsToken balances from BaseReward pools)");
  console.log("=".repeat(80) + "\n");

  const lpDistributions: LPDistribution[] = [];
  const grandTotalVsTokens = ethers.BigNumber.from(0);

  // For each BaseReward pool, we need to get all LP balances
  // This requires querying Transfer events or reading from a snapshot
  console.log("⚠️  NOTE: LP distribution requires querying vsToken holders");
  console.log("This can be done via:");
  console.log("1. Dune Analytics query (faster)");
  console.log("2. On-chain Transfer event scanning (slower)\n");

  console.log("For now, we'll output the borrowed fsGLP total that needs to be distributed to LPs:\n");
  console.log(`Total borrowed fsGLP to distribute to LPs: ${totalBorrowedFsGLP.toFixed(6)}\n`);

  // Write farmer distributions to CSV
  const farmerOutputPath = path.join(__dirname, "step3_farmer-distributions.csv");
  const farmerRows = [
    "farmer,collateral_fsGLP,liquidator_fees_share,total_fsGLP",
    ...farmerDistributions.map((f) => `${f.farmer},${f.collateralFsGLP},${f.liquidatorFeesShare},${f.totalFsGLP}`),
  ];
  fs.writeFileSync(farmerOutputPath, farmerRows.join("\n"));
  console.log(`Farmer distributions written to: ${farmerOutputPath}\n`);

  // Summary
  console.log("=".repeat(80));
  console.log("DISTRIBUTION SUMMARY");
  console.log("=".repeat(80) + "\n");

  console.log(`Total fsGLP to distribute: 1,615,172.99`);
  console.log(
    `  - Farmers: ${totalFarmerDistribution.toFixed(2)} fsGLP (${((totalFarmerDistribution / 1615172.99) * 100).toFixed(
      2
    )}%)`
  );
  console.log(
    `  - LPs: ${totalBorrowedFsGLP.toFixed(2)} fsGLP (${((totalBorrowedFsGLP / 1615172.99) * 100).toFixed(2)}%)\n`
  );

  const totalDistributed = totalFarmerDistribution + totalBorrowedFsGLP;
  const expectedTotal = 1615172.99;
  const diff = Math.abs(totalDistributed - expectedTotal);

  if (diff < 1) {
    console.log(`✅ VERIFIED: Total distributions match expected (diff: ${diff.toFixed(6)})\n`);
  } else {
    console.log(`⚠️  WARNING: Total doesn't match (diff: ${diff.toFixed(2)})\n`);
  }

  console.log("Next step:");
  console.log("  - For LP distribution: Create Dune query or scan Transfer events for vsToken holders");
  console.log("  - Then run step4 to verify final distributions\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
