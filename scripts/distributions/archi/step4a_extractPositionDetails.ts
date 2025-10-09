import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// npx hardhat run --network arbitrum scripts/distributions/archi/step4a_extractPositionDetails.ts

/**
 * STEP 4a: Extract COMPLETE position details for the 47 active positions
 *
 * For each position, we need:
 * 1. CreateUserLendCredit: collateral amount, borrowed tokens, ratios
 * 2. CreateUserBorrowed: actual borrowed amounts, fsGLP breakdown
 *
 * This will give us the farmer vs vault split for fair distribution
 */

const CREDIT_USER_2 = "0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E";

const CREDIT_USER_ABI = [
  "function getUserLendCredit(address _user, uint256 _borrowedIndex) external view returns (address depositor, address token, uint256 amountIn, uint256 reservedLiquidatorFee, address[] borrowedTokens, uint256[] ratios)",
  "function getUserBorrowed(address _user, uint256 _borrowedIndex) external view returns (address[] creditManagers, uint256[] borrowedAmountOuts, uint256 collateralMintedAmount, uint256[] borrowedMintedAmount, uint256 mintedAmount)",
  "function isTerminated(address _user, uint256 _borrowedIndex) external view returns (bool)",
];

interface ActivePosition {
  farmer: string;
  positionIndex: number;
  totalGLP: number;
}

interface PositionDetails {
  // Identity
  farmer: string;
  positionIndex: number;

  // From getUserLendCredit
  depositor: string;
  collateralToken: string;
  collateralAmount: string;
  liquidatorFee: string;
  borrowedTokens: string[];
  leverageRatios: string[];

  // From getUserBorrowed
  creditManagers: string[];
  borrowedAmounts: string[];
  collateralFsGLP: string;
  borrowedFsGLP: string[];
  totalFsGLP: string;

  // Calculated
  netCollateral: string;
  effectiveLeverage: number;
}

async function main() {
  console.log("\n=== Extracting Complete Position Details ===\n");

  const [signer] = await ethers.getSigners();
  const creditUser = new ethers.Contract(CREDIT_USER_2, CREDIT_USER_ABI, signer);

  // Read active positions CSV
  const csvPath = "scripts/distributions/archi/archi-farmers-positions2_open_positions.csv";
  console.log(`📁 Reading ${csvPath}...\n`);

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").filter((line) => line.trim());

  const activePositions: ActivePosition[] = [];

  // Parse CSV (skip header)
  for (let i = 1; i < lines.length; i++) {
    const [farmer, positionIndex, glp] = lines[i].split(",");
    activePositions.push({
      farmer: farmer.trim(),
      positionIndex: parseInt(positionIndex.trim()),
      totalGLP: parseFloat(glp.trim()),
    });
  }

  console.log(`📊 Found ${activePositions.length} active positions\n`);
  console.log(`🔍 Fetching detailed position data from blockchain...\n`);

  const positionDetails: PositionDetails[] = [];
  let processed = 0;

  for (const position of activePositions) {
    try {
      // Get CreateUserLendCredit data
      const lendCredit = await creditUser.getUserLendCredit(position.farmer, position.positionIndex);

      // Get CreateUserBorrowed data
      const borrowed = await creditUser.getUserBorrowed(position.farmer, position.positionIndex);

      // Calculate metrics
      const netCollateral = lendCredit.amountIn.sub(lendCredit.reservedLiquidatorFee);
      const effectiveLeverage = borrowed.mintedAmount.gt(0)
        ? parseFloat(ethers.utils.formatEther(borrowed.mintedAmount)) /
          parseFloat(ethers.utils.formatEther(borrowed.collateralMintedAmount))
        : 0;

      positionDetails.push({
        farmer: position.farmer,
        positionIndex: position.positionIndex,

        depositor: lendCredit.depositor,
        collateralToken: lendCredit.token,
        collateralAmount: lendCredit.amountIn.toString(),
        liquidatorFee: lendCredit.reservedLiquidatorFee.toString(),
        borrowedTokens: lendCredit.borrowedTokens,
        leverageRatios: lendCredit.ratios.map((r: any) => r.toString()),

        creditManagers: borrowed.creditManagers,
        borrowedAmounts: borrowed.borrowedAmountOuts.map((b: any) => b.toString()),
        collateralFsGLP: borrowed.collateralMintedAmount.toString(),
        borrowedFsGLP: borrowed.borrowedMintedAmount.map((b: any) => b.toString()),
        totalFsGLP: borrowed.mintedAmount.toString(),

        netCollateral: netCollateral.toString(),
        effectiveLeverage: effectiveLeverage,
      });

      processed++;
      if (processed % 5 === 0) {
        console.log(`   Processed ${processed}/${activePositions.length}...`);
      }
    } catch (error) {
      console.error(`❌ Error fetching position ${position.farmer} #${position.positionIndex}:`, error);
    }
  }

  console.log(`\n✅ Fetched ${positionDetails.length} complete position details\n`);

  // Generate detailed CSV
  console.log(`💾 Writing detailed CSV...\n`);

  const csvLines = [
    "farmer,position_index,collateral_token,collateral_amount,liquidator_fee,net_collateral," +
      "borrowed_tokens,borrowed_amounts,credit_managers," +
      "collateral_fsGLP,borrowed_fsGLP,total_fsGLP,leverage",
  ];

  for (const pos of positionDetails) {
    csvLines.push(
      [
        pos.farmer,
        pos.positionIndex,
        pos.collateralToken,
        pos.collateralAmount,
        pos.liquidatorFee,
        pos.netCollateral,
        JSON.stringify(pos.borrowedTokens),
        JSON.stringify(pos.borrowedAmounts),
        JSON.stringify(pos.creditManagers),
        pos.collateralFsGLP,
        JSON.stringify(pos.borrowedFsGLP),
        pos.totalFsGLP,
        pos.effectiveLeverage.toFixed(2),
      ].join(",")
    );
  }

  const outputPath = path.join(__dirname, "step4a_position-details-complete.csv");
  fs.writeFileSync(outputPath, csvLines.join("\n"));
  console.log(`✅ Saved to: step4a_position-details-complete.csv\n`);

  // Calculate aggregations
  console.log(`\n${"=".repeat(80)}`);
  console.log(`AGGREGATION ANALYSIS`);
  console.log(`${"=".repeat(80)}\n`);

  // Total fsGLP breakdown
  let totalCollateralFsGLP = ethers.BigNumber.from(0);
  let totalBorrowedFsGLP = ethers.BigNumber.from(0);
  let totalFsGLP = ethers.BigNumber.from(0);

  for (const pos of positionDetails) {
    totalCollateralFsGLP = totalCollateralFsGLP.add(pos.collateralFsGLP);

    for (const borrowed of pos.borrowedFsGLP) {
      totalBorrowedFsGLP = totalBorrowedFsGLP.add(borrowed);
    }

    totalFsGLP = totalFsGLP.add(pos.totalFsGLP);
  }

  console.log(`Total fsGLP Breakdown:`);
  console.log(
    `  Farmer collateral: ${ethers.utils.formatEther(totalCollateralFsGLP)} fsGLP (${
      totalCollateralFsGLP.mul(10000).div(totalFsGLP).toNumber() / 100
    }%)`
  );
  console.log(
    `  Vault borrowed:    ${ethers.utils.formatEther(totalBorrowedFsGLP)} fsGLP (${
      totalBorrowedFsGLP.mul(10000).div(totalFsGLP).toNumber() / 100
    }%)`
  );
  console.log(`  Total:             ${ethers.utils.formatEther(totalFsGLP)} fsGLP\n`);

  // Breakdown by farmer
  console.log(`Breakdown by Farmer:\n`);

  const farmerMap = new Map<
    string,
    {
      positions: number;
      collateralFsGLP: ethers.BigNumber;
      borrowedFsGLP: ethers.BigNumber;
      totalFsGLP: ethers.BigNumber;
    }
  >();

  for (const pos of positionDetails) {
    const farmer = pos.farmer.toLowerCase();
    const current = farmerMap.get(farmer) || {
      positions: 0,
      collateralFsGLP: ethers.BigNumber.from(0),
      borrowedFsGLP: ethers.BigNumber.from(0),
      totalFsGLP: ethers.BigNumber.from(0),
    };

    current.positions++;
    current.collateralFsGLP = current.collateralFsGLP.add(pos.collateralFsGLP);
    current.totalFsGLP = current.totalFsGLP.add(pos.totalFsGLP);

    for (const borrowed of pos.borrowedFsGLP) {
      current.borrowedFsGLP = current.borrowedFsGLP.add(borrowed);
    }

    farmerMap.set(farmer, current);
  }

  // Sort by total fsGLP
  const sortedFarmers = Array.from(farmerMap.entries()).sort((a, b) =>
    b[1].totalFsGLP.sub(a[1].totalFsGLP).gt(0) ? 1 : -1
  );

  for (const [farmer, stats] of sortedFarmers) {
    console.log(`  ${farmer}:`);
    console.log(`    Positions: ${stats.positions}`);
    console.log(`    Collateral fsGLP: ${ethers.utils.formatEther(stats.collateralFsGLP)}`);
    console.log(`    Borrowed fsGLP:   ${ethers.utils.formatEther(stats.borrowedFsGLP)}`);
    console.log(`    Total fsGLP:      ${ethers.utils.formatEther(stats.totalFsGLP)}`);
    console.log(
      `    Avg leverage:     ${
        parseFloat(ethers.utils.formatEther(stats.totalFsGLP)) /
        parseFloat(ethers.utils.formatEther(stats.collateralFsGLP))
      }x\n`
    );
  }

  // Breakdown by vault (credit manager)
  console.log(`\nBreakdown by Vault:\n`);

  const vaultMap = new Map<
    string,
    {
      token: string;
      borrowedAmount: ethers.BigNumber;
      borrowedFsGLP: ethers.BigNumber;
      positions: number;
    }
  >();

  // Token addresses for identification
  const tokenNames: { [key: string]: string } = {
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": "WETH",
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9": "USDT",
    "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8": "USDC",
    "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f": "WBTC",
  };

  for (const pos of positionDetails) {
    for (let i = 0; i < pos.creditManagers.length; i++) {
      const manager = pos.creditManagers[i];
      const token = pos.borrowedTokens[i];
      const amount = pos.borrowedAmounts[i];
      const fsGLP = pos.borrowedFsGLP[i];

      const current = vaultMap.get(manager) || {
        token: tokenNames[token] || token,
        borrowedAmount: ethers.BigNumber.from(0),
        borrowedFsGLP: ethers.BigNumber.from(0),
        positions: 0,
      };

      current.borrowedAmount = current.borrowedAmount.add(amount);
      current.borrowedFsGLP = current.borrowedFsGLP.add(fsGLP);
      current.positions++;

      vaultMap.set(manager, current);
    }
  }

  for (const [manager, stats] of vaultMap.entries()) {
    console.log(`  ${stats.token} Vault (${manager}):`);
    console.log(`    Borrowed amount: ${ethers.utils.formatEther(stats.borrowedAmount)} ${stats.token}`);
    console.log(`    Borrowed fsGLP:  ${ethers.utils.formatEther(stats.borrowedFsGLP)} fsGLP`);
    console.log(`    Positions:       ${stats.positions}\n`);
  }

  console.log(`${"=".repeat(80)}\n`);
  console.log(`✅ Complete position analysis done!\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
