import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// npx hardhat run --network arbitrum scripts/distributions/archi/step2_extractPositionData.ts

/**
 * STEP 2: Extract Active Position Data
 *
 * This script queries all CreateUserLendCredit and CreateUserBorrowed events
 * from CreditUser #2 to build a complete dataset of all 47 active positions.
 *
 * Output: position-data-raw.csv
 */

const CREDIT_USER_2 = "0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E";

const CREDIT_USER_ABI = [
  "event CreateUserLendCredit(address indexed _recipient, uint256 _borrowedIndex, address _depositor, address _token, uint256 _amountIn, address[] _borrowedTokens, uint256[] _ratios)",
  "event CreateUserBorrowed(address indexed _recipient, uint256 _borrowedIndex, address[] _creditManagers, uint256[] _borrowedAmountOuts, uint256 _collateralMintedAmount, uint256[] _borrowedMintedAmount, uint256 _borrowedAt)",
  "function isTerminated(address _recipient, uint256 _borrowedIndex) view returns (bool)",
];

interface PositionData {
  farmer: string;
  positionIndex: number;
  collateralToken: string;
  collateralAmount: string;
  borrowedTokens: string[];
  borrowedAmounts: string[];
  collateralFsGLP: string;
  borrowedFsGLP: string[];
  totalFsGLP: string;
  isClosed: boolean;
}

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("STEP 2: Extract Active Position Data");
  console.log("=".repeat(80) + "\n");

  const [signer] = await ethers.getSigners();
  const provider = signer.provider!;

  const creditUser = new ethers.Contract(CREDIT_USER_2, CREDIT_USER_ABI, provider);

  const startBlock = 73828000; // Contract deployment
  const endBlock = await provider.getBlockNumber();

  console.log(`Querying CreditUser #2 events from block ${startBlock} to ${endBlock}...\n`);

  // Step 2.1: Get all position openings
  console.log("Fetching CreateUserLendCredit events...");
  const openingEvents = await creditUser.queryFilter(creditUser.filters.CreateUserLendCredit(), startBlock, endBlock);
  console.log(`  Found ${openingEvents.length} position openings\n`);

  // Step 2.2: Get all position executions (borrowed details)
  console.log("Fetching CreateUserBorrowed events...");
  const borrowedEvents = await creditUser.queryFilter(creditUser.filters.CreateUserBorrowed(), startBlock, endBlock);
  console.log(`  Found ${borrowedEvents.length} position executions\n`);

  // Map position executions by (farmer, index)
  const executionMap = new Map<string, any>();
  for (const event of borrowedEvents) {
    if (event.args) {
      const key = `${event.args._recipient.toLowerCase()}-${event.args._borrowedIndex.toString()}`;
      executionMap.set(key, event.args);
    }
  }

  // Step 2.3: Check each position's status on-chain
  console.log("Checking position termination status on-chain...");
  const positions: PositionData[] = [];
  let activeCount = 0;
  let closedCount = 0;

  for (const event of openingEvents) {
    if (!event.args) continue;

    const farmer = event.args._recipient;
    const positionIndex = event.args._borrowedIndex.toNumber();

    // Check if position is terminated on-chain
    const isTerminated = await creditUser.isTerminated(farmer, positionIndex);
    if (isTerminated) {
      closedCount++;
      continue; // Skip closed positions
    }

    activeCount++;
    const farmerLower = farmer.toLowerCase();
    const key = `${farmerLower}-${positionIndex}`;

    const execution = executionMap.get(key);
    if (!execution) {
      console.log(`⚠️  Warning: No execution data for ${farmer} position ${positionIndex}`);
      continue;
    }

    // Calculate liquidator fee (5% of original collateral)
    const originalAmount = event.args._amountIn;
    const liquidatorFee = originalAmount.mul(50).div(1000); // 5%
    const netCollateral = originalAmount.sub(liquidatorFee);

    // Calculate total fsGLP
    let totalBorrowedFsGLP = ethers.BigNumber.from(0);
    for (const amount of execution._borrowedMintedAmount) {
      totalBorrowedFsGLP = totalBorrowedFsGLP.add(amount);
    }
    const totalFsGLP = execution._collateralMintedAmount.add(totalBorrowedFsGLP);

    positions.push({
      farmer: farmerLower,
      positionIndex,
      collateralToken: event.args._token,
      collateralAmount: ethers.utils.formatEther(netCollateral),
      borrowedTokens: event.args._borrowedTokens,
      borrowedAmounts: execution._borrowedAmountOuts.map((a: any) => ethers.utils.formatEther(a)),
      collateralFsGLP: ethers.utils.formatEther(execution._collateralMintedAmount),
      borrowedFsGLP: execution._borrowedMintedAmount.map((a: any) => ethers.utils.formatEther(a)),
      totalFsGLP: ethers.utils.formatEther(totalFsGLP),
      isClosed: false,
    });
  }

  console.log("=".repeat(80));
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

  // Calculate total fsGLP from positions
  let totalFsGLP = ethers.BigNumber.from(0);
  for (const pos of positions) {
    totalFsGLP = totalFsGLP.add(ethers.utils.parseEther(pos.totalFsGLP));
  }

  console.log(`Total fsGLP from active positions: ${ethers.utils.formatEther(totalFsGLP)}`);
  console.log(`Expected (from Step 1): 1,606,694.32 fsGLP\n`);

  const diff = Math.abs(parseFloat(ethers.utils.formatEther(totalFsGLP)) - 1606694.32);
  if (diff < 1) {
    console.log(`✅ VERIFIED: Position fsGLP matches GMXExecutor balance\n`);
  } else {
    console.log(`⚠️  WARNING: Position fsGLP doesn't match (diff: ${diff.toFixed(2)})\n`);
  }

  // Write to CSV
  const outputPath = path.join(__dirname, "step2_position-data-raw.csv");
  const rows = [
    "farmer,position_index,collateral_token,collateral_amount,borrowed_tokens,borrowed_amounts,collateral_fsGLP,borrowed_fsGLP,total_fsGLP",
  ];

  for (const pos of positions) {
    rows.push(
      [
        pos.farmer,
        pos.positionIndex,
        pos.collateralToken,
        pos.collateralAmount,
        `"${JSON.stringify(pos.borrowedTokens)}"`,
        `"${JSON.stringify(pos.borrowedAmounts)}"`,
        pos.collateralFsGLP,
        `"${JSON.stringify(pos.borrowedFsGLP)}"`,
        pos.totalFsGLP,
      ].join(",")
    );
  }

  fs.writeFileSync(outputPath, rows.join("\n"));
  console.log(`Output written to: ${outputPath}\n`);

  console.log("Next step: Run step3_calculateDistribution.ts to calculate farmer vs LP shares\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
