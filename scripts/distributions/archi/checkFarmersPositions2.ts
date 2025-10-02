import { ethers } from "hardhat";
import * as fs from "fs";

// npx hardhat run --network arbitrum scripts/distributions/archi/checkFarmersPositions2.ts

// CreditUser #1 contract (listed on web archive) --> all farmers positions are terminated --> holds 0 fsGLP
// const CREDIT_USER_1_ADDRESS = "0x8718CaD7DE1B411616145669c1e1242051342fb3";

// CreditUser #2 contract (the one with 1.6M fsGLP)
const CREDIT_USER_2_ADDRESS = "0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E";

// CreditUser ABI - only need the functions we're calling
const CREDIT_USER_ABI = [
  "function getUserCounts(address _user) external view returns (uint256)",
  "function getUserBorrowed(address _user, uint256 _borrowedIndex) external view returns (address[] creditManagers, uint256[] borrowedAmountOuts, uint256 collateralMintedAmount, uint256[] borrowedMintedAmount, uint256 mintedAmount)",
  "function getUserLendCredit(address _user, uint256 _borrowedIndex) external view returns (address depositor, address token, uint256 amountIn, uint256 reservedLiquidatorFee, address[] borrowedTokens, uint256[] ratio)",
  "function isTerminated(address _recipient, uint256 _borrowedIndex) external view returns (bool)",
];

interface FarmerData {
  farmer_address: string;
  position_count: number;
}

/**
 * Read and parse CSV file containing farmer addresses and position counts
 * Expected CSV format: farmer_address,position_count,...
 */
async function readFarmersFromCSV(csvFilePath: string): Promise<FarmerData[]> {
  try {
    const csvContent = fs.readFileSync(csvFilePath, "utf-8");
    const lines = csvContent.split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      throw new Error("CSV file is empty");
    }

    // Parse header to find column indices
    const header = lines[0].split(",").map((col) => col.trim().toLowerCase());
    const farmerAddressIndex = header.findIndex((col) => col === "farmer_address" || col === "address");
    const positionCountIndex = header.findIndex((col) => col === "position_count" || col === "farmer_position_count");

    if (farmerAddressIndex === -1) {
      throw new Error("CSV must have 'farmer_address' column");
    }

    const farmers: FarmerData[] = [];

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",").map((col) => col.trim());

      if (row.length > farmerAddressIndex) {
        const farmer_address = row[farmerAddressIndex];

        // Get position count from CSV or count positions for this farmer
        let position_count = 1; // Default to 1
        if (positionCountIndex !== -1 && row[positionCountIndex]) {
          position_count = parseInt(row[positionCountIndex]);
        }

        // Validate address format
        if (farmer_address && ethers.utils.isAddress(farmer_address)) {
          farmers.push({
            farmer_address: farmer_address.toLowerCase(),
            position_count,
          });
        }
      }
    }

    // Group by farmer and sum positions
    const farmerMap = new Map<string, number>();
    for (const farmer of farmers) {
      const current = farmerMap.get(farmer.farmer_address) || 0;
      farmerMap.set(farmer.farmer_address, Math.max(current, farmer.position_count));
    }

    const uniqueFarmers: FarmerData[] = Array.from(farmerMap.entries()).map(([address, count]) => ({
      farmer_address: address,
      position_count: count,
    }));

    console.log(`Loaded ${uniqueFarmers.length} unique farmers from ${csvFilePath}`);
    return uniqueFarmers;
  } catch (error) {
    throw new Error(`Failed to read CSV file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function main() {
  try {
    // Check command line arguments or use default
    const csvFilePath = process.argv[2] || "scripts/distributions/archi/archi-farmers-positions2.csv";

    if (!process.argv[2]) {
      console.log("No CSV file specified, using default: archi-farmers-positions2.csv");
      console.log(
        "Usage: npx hardhat run --network arbitrum scripts/distributions/archi/checkFarmersPositions2.ts <csv_file>"
      );
      console.log(`Looking for: ${csvFilePath}`);
    }

    if (!fs.existsSync(csvFilePath)) {
      console.error(`❌ File not found: ${csvFilePath}`);
      console.log("\n💡 Tip: Export query results from archi-farmers-positions2.sql");
      process.exit(1);
    }

    // Read farmers data from CSV
    const farmers = await readFarmersFromCSV(csvFilePath);
    if (farmers.length === 0) {
      console.error("❌ No valid farmers found in CSV");
      process.exit(1);
    }

    // Get provider from Hardhat's ethers
    const provider = ethers.provider;

    const contract = new ethers.Contract(CREDIT_USER_2_ADDRESS, CREDIT_USER_ABI, provider);

    console.log("\nChecking CreditUser #2 positions...");
    console.log(`Contract: ${CREDIT_USER_2_ADDRESS}`);
    console.log(`Total farmers: ${farmers.length}`);
    console.log(`Expected positions: ${farmers.reduce((sum, f) => sum + f.position_count, 0)}`);

    // First verify actual position counts on-chain
    const farmersWithActualCounts: Array<{ farmer: string; actualCount: number }> = [];

    for (const farmer of farmers) {
      const actualCount = await contract.getUserCounts(farmer.farmer_address);
      farmersWithActualCounts.push({
        farmer: farmer.farmer_address,
        actualCount: actualCount.toNumber(),
      });

      if (actualCount.toNumber() !== farmer.position_count) {
        console.log(
          `⚠️  Mismatch for ${farmer.farmer_address} positions count: Expected ${farmer.position_count} from CSV, Got ${actualCount} on-chain`
        );
      }
    }

    const totalActualPositions = farmersWithActualCounts.reduce((sum, f) => sum + f.actualCount, 0);
    console.log(`\nTotal actual positions on-chain: ${totalActualPositions}\n`);

    // Now check each position's termination status
    const positionChecks: Array<{ farmer: string; index: number }> = [];
    for (const farmer of farmersWithActualCounts) {
      for (let i = 1; i <= farmer.actualCount; i++) {
        positionChecks.push({ farmer: farmer.farmer, index: i });
      }
    }

    console.log(`Checking termination status of ${positionChecks.length} positions...\n`);

    let openPositions = 0;
    let closedPositions = 0;
    const openPositionsList: Array<{ farmer: string; index: number; glpAmount: string }> = [];

    for (const check of positionChecks) {
      try {
        // Use the correct isTerminated function
        const isTerminated = await contract.isTerminated(check.farmer, check.index);

        if (isTerminated) {
          closedPositions++;
        } else {
          // Position is still open - get the GLP amount
          const borrowed = await contract.getUserBorrowed(check.farmer, check.index);
          const mintedAmount = borrowed.mintedAmount;
          const glpAmount = ethers.utils.formatEther(mintedAmount);

          openPositions++;
          openPositionsList.push({ farmer: check.farmer, index: check.index, glpAmount });
          console.log(`✅ OPEN: ${check.farmer} position #${check.index} - ${glpAmount} GLP`);
        }
      } catch (error) {
        console.error(`Error checking ${check.farmer} position #${check.index}:`, error);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total positions checked: ${positionChecks.length}`);
    console.log(`Open positions: ${openPositions}`);
    console.log(`Closed positions: ${closedPositions}`);

    // Calculate total GLP from open positions
    const totalGLP = openPositionsList.reduce((sum, pos) => sum + parseFloat(pos.glpAmount), 0);
    const avgGLPPerPosition = openPositions > 0 ? totalGLP / openPositions : 0;
    const expectedBalance = 1606694.31660856; // GMXExecutor current balance from etherscan
    const difference = totalGLP - expectedBalance;

    console.log(`\nfsGLP ACCOUNTING:`);
    console.log(`Total GLP in open positions: ${totalGLP.toLocaleString()} fsGLP`);
    console.log(`GMXExecutor balance (on-chain): ${expectedBalance.toLocaleString()} fsGLP`);
    console.log(`Difference: ${difference.toLocaleString()} fsGLP`);
    console.log(`Average per position: ${avgGLPPerPosition.toLocaleString()} fsGLP`);

    // Write open positions to file
    if (openPositionsList.length > 0) {
      const csv = [
        "farmer_address,position_index,glp_amount",
        ...openPositionsList.map((p) => `${p.farmer},${p.index},${p.glpAmount}`),
      ].join("\n");

      const outputPath = csvFilePath.replace(".csv", "_open_positions.csv");
      fs.writeFileSync(outputPath, csv);
      console.log(`\nOpen positions exported to: ${outputPath}`);

      // Generate aggregated CSV with unique users
      const userAggregates = new Map<string, { positionCount: number; totalGlp: number }>();

      for (const pos of openPositionsList) {
        const existing = userAggregates.get(pos.farmer) || { positionCount: 0, totalGlp: 0 };
        userAggregates.set(pos.farmer, {
          positionCount: existing.positionCount + 1,
          totalGlp: existing.totalGlp + parseFloat(pos.glpAmount),
        });
      }

      const uniqueUsersCsv = [
        "farmer_address,position_count,total_glp_amount",
        ...Array.from(userAggregates.entries()).map(
          ([address, data]) => `${address},${data.positionCount},${data.totalGlp}`
        ),
      ].join("\n");

      const uniqueUsersPath = csvFilePath.replace(".csv", "_open_positions_unique_users.csv");
      fs.writeFileSync(uniqueUsersPath, uniqueUsersCsv);
      console.log(`Unique users summary exported to: ${uniqueUsersPath}`);

      // Log unique users data
      console.log("\n" + "=".repeat(80));
      console.log("UNIQUE USERS SUMMARY");
      console.log("=".repeat(80));
      Array.from(userAggregates.entries()).forEach(([address, data]) => {
        console.log(`${address}: ${data.positionCount} positions, ${data.totalGlp.toFixed(6)} GLP`);
      });

      // Calculate and log total GLP
      const totalGlp = Array.from(userAggregates.values()).reduce((sum, data) => sum + data.totalGlp, 0);
      console.log("\n" + "=".repeat(80));
      console.log(`TOTAL GLP ACROSS ALL USERS: ${totalGlp.toFixed(6)}`);
      console.log("=".repeat(80));
    }

    console.log("\n✅ Script completed successfully!");
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
