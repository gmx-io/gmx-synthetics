#!/usr/bin/env npx ts-node

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
// For now using a simple CSV parsing instead of external dependency
// import csvParser from 'csv-parser';

// npx hardhat run --network arbitrum scripts/distributions/archi/checkFarmersPositions.ts

// Configuration
const CONFIG = {
  RPC_URL: process.env.ARBITRUM_URL || "https://arb1.arbitrum.io/rpc",
  CREDIT_USER_ADDRESS: "0x8718CaD7DE1B411616145669c1e1242051342fb3",
  BATCH_SIZE: 10, // Number of concurrent requests
  DELAY_MS: 100, // Delay between batches to avoid rate limiting
};

// CreditUser contract ABI (Human Readable format)
const CREDIT_USER_ABI = [
  "function isTerminated(address _recipient, uint256 _borrowedIndex) view returns (bool)",
  "function getUserCounts(address _recipient) view returns (uint256)",
  "function getUserLendCredit(address _recipient, uint256 _borrowedIndex) view returns (address depositor, address token, uint256 amountIn, uint256 reservedLiquidatorFee, address[] borrowedTokens, uint256[] ratios)",
  "function getUserBorrowed(address _recipient, uint256 _borrowedIndex) view returns (address[] creditManagers, uint256[] borrowedAmountOuts, uint256 collateralMintedAmount, uint256[] borrowedMintedAmount, uint256 mintedAmount)",
];

interface FarmerData {
  farmer_address: string;
  position_count: number;
}

interface PositionStatus {
  farmer_address: string;
  position_index: number;
  is_terminated: boolean;
  error?: string;
}

/**
 * Read and parse CSV file containing farmer addresses and position counts
 */
async function readFarmersFromCSV(csvFilePath: string): Promise<FarmerData[]> {
  try {
    const csvContent = fs.readFileSync(csvFilePath, "utf-8");
    const lines = csvContent.split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      throw new Error("CSV file is empty");
    }

    // Parse header
    const header = lines[0].split(",").map((h) => h.trim());
    const addressIndex = header.findIndex((h) => h.toLowerCase().includes("address"));
    const countIndex = header.findIndex(
      (h) => h.toLowerCase().includes("count") || h.toLowerCase().includes("position")
    );

    if (addressIndex === -1 || countIndex === -1) {
      throw new Error('CSV must have columns containing "address" and "count" or "position"');
    }

    const farmers: FarmerData[] = [];

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",").map((cell) => cell.trim());

      if (row.length > Math.max(addressIndex, countIndex)) {
        const farmer_address = row[addressIndex];
        const position_count = parseInt(row[countIndex]);

        if (farmer_address && !isNaN(position_count) && position_count > 0) {
          farmers.push({
            farmer_address: farmer_address.toLowerCase(),
            position_count,
          });
        } else {
          console.warn(`Skipping invalid row ${i + 1}:`, row);
        }
      }
    }

    console.log(`📁 Loaded ${farmers.length} farmers from ${csvFilePath}`);
    return farmers;
  } catch (error) {
    throw new Error(`Failed to read CSV file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Check if a specific position is terminated
 */
async function checkPositionTerminated(
  contract: ethers.Contract,
  farmer_address: string,
  position_index: number
): Promise<PositionStatus> {
  try {
    const isTerminated = await contract.isTerminated(farmer_address, position_index);

    return {
      farmer_address,
      position_index,
      is_terminated: isTerminated,
    };
  } catch (error) {
    console.error(`❌ Error checking position ${position_index} for ${farmer_address}:`, error);
    return {
      farmer_address,
      position_index,
      is_terminated: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process farmers in batches to avoid overwhelming the RPC
 */
async function processFarmersInBatches(contract: ethers.Contract, farmers: FarmerData[]): Promise<PositionStatus[]> {
  const allResults: PositionStatus[] = [];

  // First, get actual position counts from the contract
  console.log("🔍 Getting actual position counts from contract...");
  const farmersWithActualCounts: Array<{ farmer: string; actualCount: number }> = [];

  for (const farmer of farmers) {
    try {
      const actualCount = await contract.getUserCounts(farmer.farmer_address);
      const count = actualCount.toNumber();
      farmersWithActualCounts.push({
        farmer: farmer.farmer_address,
        actualCount: count,
      });
      console.log(`👤 ${farmer.farmer_address}: ${count} positions (CSV had: ${farmer.position_count})`);
    } catch (error) {
      console.error(`❌ Error getting count for ${farmer.farmer_address}:`, error);
    }
  }

  // Create array of all position checks needed based on actual counts
  const positionChecks: Array<{ farmer: string; index: number }> = [];
  for (const farmer of farmersWithActualCounts) {
    for (let i = 1; i <= farmer.actualCount; i++) {
      positionChecks.push({
        farmer: farmer.farmer,
        index: i,
      });
    }
  }

  console.log(`🔍 Checking ${positionChecks.length} positions across ${farmers.length} farmers...`);

  // Process in batches
  for (let i = 0; i < positionChecks.length; i += CONFIG.BATCH_SIZE) {
    const batch = positionChecks.slice(i, i + CONFIG.BATCH_SIZE);

    console.log(
      `Processing batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${Math.ceil(
        positionChecks.length / CONFIG.BATCH_SIZE
      )}`
    );

    const batchPromises = batch.map((check) => checkPositionTerminated(contract, check.farmer, check.index));

    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults);

    // Add delay between batches
    if (i + CONFIG.BATCH_SIZE < positionChecks.length) {
      await new Promise((resolve) => setTimeout(resolve, CONFIG.DELAY_MS));
    }
  }

  return allResults;
}

/**
 * Generate summary statistics
 */
function generateSummary(results: PositionStatus[]): void {
  const totalPositions = results.length;
  const terminatedPositions = results.filter((r) => r.is_terminated).length;
  const activePositions = results.filter((r) => !r.is_terminated && !r.error).length;
  const errorPositions = results.filter((r) => r.error).length;

  const uniqueFarmers = new Set(results.map((r) => r.farmer_address)).size;

  console.log("\n📊 SUMMARY:");
  console.log(`Total Farmers: ${uniqueFarmers}`);
  console.log(`Total Positions: ${totalPositions}`);
  console.log(
    `Terminated Positions: ${terminatedPositions} (${((terminatedPositions / totalPositions) * 100).toFixed(1)}%)`
  );
  console.log(`Active Positions: ${activePositions} (${((activePositions / totalPositions) * 100).toFixed(1)}%)`);
  console.log(`Error Positions: ${errorPositions} (${((errorPositions / totalPositions) * 100).toFixed(1)}%)`);
}

/**
 * Export results to CSV
 */
async function exportResultsToCSV(results: PositionStatus[], outputPath: string): Promise<void> {
  const csvHeader = "farmer_address,position_index,is_terminated,error\n";
  const csvRows = results
    .map((result) => `${result.farmer_address},${result.position_index},${result.is_terminated},${result.error || ""}`)
    .join("\n");

  const csvContent = csvHeader + csvRows;

  fs.writeFileSync(outputPath, csvContent);
  console.log(`💾 Results exported to: ${outputPath}`);
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Check command line arguments
    const csvFilePath = process.argv[2] || "scripts/distributions/archi/archi-farmers-positions.csv";

    if (!process.argv[2]) {
      console.log("📋 No CSV file specified, using default: archi-farmers-positions.csv");
      console.log("Usage: npx hardhat run --network arbitrum scripts/distributions/archi/checkFarmersPositions.ts");
      console.log(`📍 Looking for: ${csvFilePath}`);
    }

    if (!fs.existsSync(csvFilePath)) {
      console.error(`❌ File not found: ${csvFilePath}`);
      process.exit(1);
    }

    // Setup blockchain connection
    console.log("🌐 Connecting to Arbitrum...");
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const contract = new ethers.Contract(CONFIG.CREDIT_USER_ADDRESS, CREDIT_USER_ABI, provider);

    // Test connection
    try {
      await provider.getBlockNumber();
      console.log("✅ Connected to Arbitrum");
    } catch (error) {
      console.error("❌ Failed to connect to Arbitrum:", error);
      process.exit(1);
    }

    // Read farmers data
    const farmers = await readFarmersFromCSV(csvFilePath);
    if (farmers.length === 0) {
      console.error("❌ No valid farmers found in CSV");
      process.exit(1);
    }

    // Process all positions
    const results = await processFarmersInBatches(contract, farmers);

    // Generate summary
    generateSummary(results);

    // Show detailed results for active positions
    const activePositions = results.filter((r) => !r.is_terminated && !r.error);
    if (activePositions.length > 0) {
      console.log("\n🟢 ACTIVE POSITIONS:");
      activePositions.forEach((pos) => {
        console.log(`${pos.farmer_address} - Position ${pos.position_index}: ACTIVE`);
      });
    }

    // Show terminated positions
    const terminatedPositions = results.filter((r) => r.is_terminated);
    if (terminatedPositions.length > 0) {
      console.log("\n🔴 TERMINATED POSITIONS:");
      terminatedPositions.forEach((pos) => {
        console.log(`${pos.farmer_address} - Position ${pos.position_index}: TERMINATED`);
      });
    }

    // Export results to CSV
    const outputPath = csvFilePath.replace(".csv", "_termination_status.csv");
    await exportResultsToCSV(results, outputPath);

    console.log("\n✅ Process completed successfully!");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { main, checkPositionTerminated, readFarmersFromCSV };
