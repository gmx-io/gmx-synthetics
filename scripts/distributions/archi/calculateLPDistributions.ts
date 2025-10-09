import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// npx hardhat run --network arbitrum scripts/distributions/archi/calculateLPDistributions.ts

/**
 * LP DISTRIBUTIONS: Calculate fsGLP entitlements for LPs
 *
 * Inputs:
 *   - archi-unique-LPs.csv: LP addresses with net positions (deposits - withdrawals)
 *   - vault-borrowing-summary.csv: Vault borrowed fsGLP amounts
 *
 * Process:
 *   1. Read LP addresses and their net positions from CSV
 *   2. For each vault:
 *      - Calculate total net deposits across all LPs
 *      - For each LP: fsGLP = (LP_net_deposit / total_net_deposits) × vault_borrowed_fsGLP
 *   3. Aggregate across all vaults per LP
 *
 * Method:
 *   - Uses CSV transaction history (addLiquidity/removeLiquidity) for distribution
 *   - Net position = deposits - withdrawals = current LP balance
 *   - No on-chain queries needed (all data from Dune SQL)
 *
 * Outputs:
 *   - lp-distributions-by-vault.csv: Per-vault breakdown with net deposits
 *   - lp-distributions.csv: Aggregated totals (matches farmer format)
 */

interface VaultConfig {
  name: string;
  supplyRewardPool: string;
  borrowedFsGLP: string;
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

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("LP DISTRIBUTIONS: Calculate fsGLP Entitlements");
  console.log("=".repeat(80) + "\n");

  // ========================================================================
  // STEP 1: Read Vault Borrowed Amounts
  // ========================================================================

  console.log("Step 1: Reading vault borrowed amounts...\n");

  const vaultBorrowingPath = path.join(__dirname, "vault-borrowing-summary.csv");
  if (!fs.existsSync(vaultBorrowingPath)) {
    throw new Error(`File not found: ${vaultBorrowingPath}`);
  }

  const vaultBorrowingCsv = fs.readFileSync(vaultBorrowingPath, "utf-8");
  const vaultLines = vaultBorrowingCsv.split("\n").filter((line) => line.trim());

  const vaultConfig: Record<string, VaultConfig> = {};

  // Parse CSV: vault,borrowed_fsGLP,percentage,position_count
  for (let i = 1; i < vaultLines.length; i++) {
    const parts = vaultLines[i].split(",");
    const vaultName = parts[0];
    const borrowedFsGLPFormatted = parts[1]; // Formatted fsGLP value (e.g., "848962.09")

    // Convert formatted value to wei
    const borrowedFsGLP = ethers.utils.parseEther(borrowedFsGLPFormatted).toString();

    // Map to BaseReward pool addresses
    const poolAddresses: Record<string, string> = {
      WBTC: "0x12e14fDc843Fb9c64B84Dfa6fB03350D6810d8e5",
      WETH: "0x9eBC025393d86f211A720b95650dff133b270684",
      USDT: "0xEca975BeEc3bC90C424FF101605ECBCef22b66eA",
      USDC: "0x670c4391f6421e4cE64D108F810C56479ADFE4B3",
    };

    vaultConfig[vaultName] = {
      name: vaultName,
      supplyRewardPool: poolAddresses[vaultName],
      borrowedFsGLP: borrowedFsGLP,
    };
  }

  console.log("Vault Configuration:");
  for (const vault of Object.values(vaultConfig)) {
    console.log(`  ${vault.name}: ${ethers.utils.formatEther(vault.borrowedFsGLP)} fsGLP`);
  }
  console.log();

  // ========================================================================
  // STEP 2: Read LP Addresses
  // ========================================================================

  console.log("Step 2: Reading LP addresses from CSV...\n");

  const lpCsvPath = path.join(__dirname, "archi-unique-LPs.csv");
  if (!fs.existsSync(lpCsvPath)) {
    throw new Error(`File not found: ${lpCsvPath}`);
  }

  const lpCsv = fs.readFileSync(lpCsvPath, "utf-8");
  const lpLines = lpCsv.split("\n").filter((line) => line.trim());

  // Parse header
  const header = lpLines[0].toLowerCase().split(",");
  const addressIdx = header.indexOf("address");
  const netWbtcIdx = header.indexOf("net_wbtc");
  const netWethIdx = header.indexOf("net_weth");
  const netUsdtIdx = header.indexOf("net_usdt");
  const netUsdcIdx = header.indexOf("net_usdc");

  if (addressIdx === -1 || netWbtcIdx === -1 || netWethIdx === -1 || netUsdtIdx === -1 || netUsdcIdx === -1) {
    throw new Error("CSV missing required columns");
  }

  // Parse LP data
  interface LPData {
    address: string;
    netWbtc: number;
    netWeth: number;
    netUsdt: number;
    netUsdc: number;
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

  // ========================================================================
  // STEP 3: Query vsToken Balances and Calculate Distributions
  // ========================================================================

  console.log("Step 3: Querying vsToken balances and calculating distributions...\n");

  const lpDistributions = new Map<string, LPDistribution>();

  // Initialize distributions for all LPs
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

  // Process each vault
  const vaultOrder = ["WBTC", "WETH", "USDT", "USDC"];

  for (const vaultName of vaultOrder) {
    console.log("=".repeat(80));
    console.log(`${vaultName} Vault`);
    console.log("=".repeat(80) + "\n");

    const vault = vaultConfig[vaultName];
    const borrowedFsGLP = ethers.BigNumber.from(vault.borrowedFsGLP);

    console.log(`  fsGLP to distribute: ${ethers.utils.formatEther(borrowedFsGLP)}\n`);

    // Filter LPs who have net position in this vault
    const netField =
      vaultName === "WBTC"
        ? "netWbtc"
        : vaultName === "WETH"
        ? "netWeth"
        : vaultName === "USDT"
        ? "netUsdt"
        : "netUsdc";

    const relevantLPs = lpData.filter((lp) => lp[netField] > 0);

    console.log(`Processing ${relevantLPs.length} LPs with positive net_${vaultName.toLowerCase()}...\n`);

    // Calculate total net deposits for this vault
    let totalNetDeposits = 0;
    for (const lp of relevantLPs) {
      totalNetDeposits += lp[netField];
    }

    console.log(`  Total net deposits: ${totalNetDeposits.toFixed(8)} tokens\n`);

    if (totalNetDeposits === 0) {
      console.log(`  ⚠️  No net deposits - skipping\n`);
      continue;
    }

    let activeLPCount = 0;

    // Convert total net deposits to BigNumber with proper decimals
    let totalNetDepositsBN: ethers.BigNumber;
    if (vaultName === "WBTC") {
      totalNetDepositsBN = ethers.utils.parseUnits(totalNetDeposits.toFixed(8), 8);
    } else if (vaultName === "WETH") {
      totalNetDepositsBN = ethers.utils.parseUnits(totalNetDeposits.toFixed(18), 18);
    } else {
      // USDT/USDC use 6 decimals
      totalNetDepositsBN = ethers.utils.parseUnits(totalNetDeposits.toFixed(6), 6);
    }

    for (const lp of relevantLPs) {
      const netDeposit = lp[netField];

      activeLPCount++;

      // Convert net deposit to wei (using proper decimals)
      let netDepositWei: ethers.BigNumber;
      if (vaultName === "WBTC") {
        netDepositWei = ethers.utils.parseUnits(netDeposit.toFixed(8), 8);
      } else if (vaultName === "WETH") {
        netDepositWei = ethers.utils.parseUnits(netDeposit.toFixed(18), 18);
      } else {
        // USDT/USDC use 6 decimals
        netDepositWei = ethers.utils.parseUnits(netDeposit.toFixed(6), 6);
      }

      // Calculate fsGLP entitlement using BigNumber math to avoid overflow
      // Formula: (netDeposit / totalDeposits) * borrowedFsGLP
      const fsGLPEntitlement = borrowedFsGLP.mul(netDepositWei).div(totalNetDepositsBN);

      const dist = lpDistributions.get(lp.address)!;

      // Update vault-specific fields
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

      // Update total
      const currentTotal = ethers.BigNumber.from(dist.total_fsGLP);
      dist.total_fsGLP = currentTotal.add(fsGLPEntitlement).toString();
    }

    console.log(`✅ ${vaultName}: ${activeLPCount} LPs with net deposits\n`);
  }

  // ========================================================================
  // STEP 4: Write Output Files
  // ========================================================================

  console.log("=".repeat(80));
  console.log("Writing Output Files");
  console.log("=".repeat(80) + "\n");

  // Filter out LPs with zero distribution
  const nonZeroDistributions = Array.from(lpDistributions.values()).filter((dist) =>
    ethers.BigNumber.from(dist.total_fsGLP).gt(0)
  );

  // Sort by total_fsGLP descending
  nonZeroDistributions.sort((a, b) => (ethers.BigNumber.from(b.total_fsGLP).sub(a.total_fsGLP).gt(0) ? 1 : -1));

  console.log(`Found ${nonZeroDistributions.length} LPs with fsGLP entitlements\n`);

  // Output 1: Detailed breakdown by vault
  const detailedPath = path.join(__dirname, "lp-distributions-by-vault.csv");
  const detailedRows = [
    "address,wbtc_vsTokens,wbtc_fsGLP,weth_vsTokens,weth_fsGLP,usdt_vsTokens,usdt_fsGLP,usdc_vsTokens,usdc_fsGLP,total_fsGLP",
  ];

  for (const dist of nonZeroDistributions) {
    detailedRows.push(
      [
        dist.address,
        dist.wbtc_vsTokens,
        ethers.utils.formatEther(dist.wbtc_fsGLP),
        dist.weth_vsTokens,
        ethers.utils.formatEther(dist.weth_fsGLP),
        dist.usdt_vsTokens,
        ethers.utils.formatEther(dist.usdt_fsGLP),
        dist.usdc_vsTokens,
        ethers.utils.formatEther(dist.usdc_fsGLP),
        ethers.utils.formatEther(dist.total_fsGLP),
      ].join(",")
    );
  }

  fs.writeFileSync(detailedPath, detailedRows.join("\n"));
  console.log(`✅ Detailed breakdown written to: lp-distributions-by-vault.csv`);
  console.log(`   (${nonZeroDistributions.length} LPs)\n`);

  // Output 2: Aggregated (matches farmer format)
  const aggregatedPath = path.join(__dirname, "lp-distributions.csv");
  const aggregatedRows = ["address,wbtc_fsGLP,weth_fsGLP,usdt_fsGLP,usdc_fsGLP,total_fsGLP"];

  for (const dist of nonZeroDistributions) {
    aggregatedRows.push(
      [
        dist.address,
        ethers.utils.formatEther(dist.wbtc_fsGLP),
        ethers.utils.formatEther(dist.weth_fsGLP),
        ethers.utils.formatEther(dist.usdt_fsGLP),
        ethers.utils.formatEther(dist.usdc_fsGLP),
        ethers.utils.formatEther(dist.total_fsGLP),
      ].join(",")
    );
  }

  fs.writeFileSync(aggregatedPath, aggregatedRows.join("\n"));
  console.log(`✅ Aggregated distributions written to: lp-distributions.csv`);
  console.log(`   (${nonZeroDistributions.length} LPs)\n`);

  // ========================================================================
  // SUMMARY
  // ========================================================================

  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80) + "\n");

  let grandTotal = ethers.BigNumber.from(0);

  for (const vaultName of vaultOrder) {
    const vaultTotal = nonZeroDistributions.reduce((sum, dist) => {
      const field =
        vaultName === "WBTC"
          ? "wbtc_fsGLP"
          : vaultName === "WETH"
          ? "weth_fsGLP"
          : vaultName === "USDT"
          ? "usdt_fsGLP"
          : "usdc_fsGLP";
      return sum.add(dist[field]);
    }, ethers.BigNumber.from(0));

    grandTotal = grandTotal.add(vaultTotal);

    const expected = ethers.BigNumber.from(vaultConfig[vaultName].borrowedFsGLP);
    const lpCount = nonZeroDistributions.filter((d) =>
      ethers.BigNumber.from(
        d[
          vaultName === "WBTC"
            ? "wbtc_fsGLP"
            : vaultName === "WETH"
            ? "weth_fsGLP"
            : vaultName === "USDT"
            ? "usdt_fsGLP"
            : "usdc_fsGLP"
        ]
      ).gt(0)
    ).length;

    console.log(`${vaultName} Vault:`);
    console.log(`  Distributed: ${ethers.utils.formatEther(vaultTotal)} fsGLP`);
    console.log(`  Expected:    ${ethers.utils.formatEther(expected)} fsGLP`);
    console.log(`  LPs:         ${lpCount}\n`);
  }

  const totalExpected = Object.values(vaultConfig).reduce(
    (sum, v) => sum.add(v.borrowedFsGLP),
    ethers.BigNumber.from(0)
  );

  console.log(`Total Distributed: ${ethers.utils.formatEther(grandTotal)} fsGLP`);
  console.log(`Total Expected:    ${ethers.utils.formatEther(totalExpected)} fsGLP`);
  console.log(`Total LPs:         ${nonZeroDistributions.length}\n`);

  console.log("=".repeat(80));
  console.log("COMPLETE");
  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
