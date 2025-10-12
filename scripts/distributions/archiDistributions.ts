import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// FAST_RPC=true PREVIEW_ALL_LPS=true npx hardhat run --network arbitrum scripts/distributions/archiDistributions.ts

declare const process: any;

// Using StakeFor events is finding all LPs (vs Add / RemoveLiquidity events which is only 99.52% accurate)

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
 *   - Core contract addresses (GMXExecutor, CreditUser2, CreditAggregator, fsGLP)
 *     Found by analyzing contracts deployed by Archi Deployer (0x60A3D336c39e8faC40647142d3068780B4Bc4C93)
 *     https://dune.com/queries/5781806
 *   - Vault BaseReward contract addresses (WETH, WBTC, USDT, USDC)
 *     Found from vault deployment transactions and contract interactions
 *   - Once addresses are known, LPs are discovered automatically via StakeFor events (100% accurate vs Add/RemoveLiquidity which was 98.52% accurate)
 *
 * Outputs:
 *   - archi-farmer-positions.csv: All 47 active positions with borrowing details
 *   - archi-farmer-distributions.csv: Final farmer distributions (4 farmers)
 *   - archi-lp-distributions.csv: LP distributions with vsToken balances
 *   - ARCHI_DISTRIBUTIONS.md: Updated with distribution tables and vault borrowing summary
 */

// Configuration for public | fast RPC rate limiting (for paid RPCs use higher BATCH_SIZE and lower DELAY_MS)
const BATCH_SIZE = process.env.FAST_RPC == "true" ? 100 : 25;
const DELAY_MS = process.env.FAST_RPC == "true" ? 0 : 100;
// Set to -1 to display all LPs in markdown table
const TOP_LPS = process.env.PREVIEW_ALL_LPS == "true" ? -1 : 20;

const START_BLOCK = 42029909; // 2022-11-29 - archi deployer got funded (most archi contracts deployed in Apr-2023)

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

  const startBlock = START_BLOCK;
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

  for (let i = 0; i < openingEvents.length; i++) {
    const event = openingEvents[i];
    if (!event.args) continue;

    // Progress indicator every 10 positions
    if ((i + 1) % 10 === 0 || i === openingEvents.length - 1) {
      process.stdout.write(`\r  Checked ${i + 1}/${openingEvents.length} positions...`);
    }

    const farmer = event.args._recipient;
    const positionIndex = event.args._borrowedIndex.toNumber();

    const isTerminated = await creditUser.isTerminated(farmer, positionIndex);
    if (isTerminated) continue;

    activeCount++;
    const farmerLower = farmer.toLowerCase();
    const key = `${farmerLower}-${positionIndex}`;

    const execution = executionMap.get(key);
    if (!execution) {
      console.log(`\n⚠️  Warning: No execution data for ${farmer} position ${positionIndex}`);
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

const VAULT_CONFIGS = [
  {
    name: "WETH",
    baseRewardAddress: "0x9eBC025393d86f211A720b95650dff133b270684",
    decimals: 6,
    deployBlock: START_BLOCK,
  },
  {
    name: "WBTC",
    baseRewardAddress: "0x12e14fDc843Fb9c64B84Dfa6fB03350D6810d8e5",
    decimals: 6,
    deployBlock: START_BLOCK,
  },
  {
    name: "USDT",
    baseRewardAddress: "0xEca975BeEc3bC90C424FF101605ECBCef22b66eA",
    decimals: 6,
    deployBlock: START_BLOCK,
  },
  {
    name: "USDC",
    baseRewardAddress: "0x670c4391f6421e4cE64D108F810C56479ADFE4B3",
    decimals: 6,
    deployBlock: START_BLOCK,
  },
];

const BASE_REWARD_ABI = [
  "event StakeFor(address indexed _recipient, uint256 _amountIn, uint256 _totalSupply, uint256 _totalUnderlying)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

async function step5_calculateLPDistributions(
  vaultBorrowing: Record<string, VaultBorrowing>
): Promise<LPDistribution[]> {
  console.log("=".repeat(80));
  console.log("STEP 5: Calculate LP Distributions");
  console.log("=".repeat(80) + "\n");

  const [signer] = await ethers.getSigners();
  const provider = signer.provider!;
  const currentBlock = await provider.getBlockNumber();

  // Query BaseReward StakeFor events to find LP addresses per vault
  const vaultLPAddresses = new Map<string, Set<string>>();

  console.log("Discovering LP addresses from BaseReward StakeFor events...\n");

  for (const config of VAULT_CONFIGS) {
    const baseReward = new ethers.Contract(config.baseRewardAddress, BASE_REWARD_ABI, provider);

    const stakeForEvents = await baseReward.queryFilter(
      baseReward.filters.StakeFor(),
      config.deployBlock,
      currentBlock
    );

    const vaultLPs = new Set<string>();
    for (const event of stakeForEvents) {
      if (event.args && event.args._recipient) {
        const recipient = event.args._recipient.toLowerCase();
        vaultLPs.add(recipient);
      }
    }

    vaultLPAddresses.set(config.name, vaultLPs);
    console.log(`  ${config.name}: ${stakeForEvents.length} StakeFor events, ${vaultLPs.size} unique LPs`);
  }

  // Get all unique LP addresses across all vaults
  const allLPAddresses = new Set<string>();
  for (const lpSet of vaultLPAddresses.values()) {
    for (const address of lpSet) {
      allLPAddresses.add(address);
    }
  }

  console.log(`\nTotal unique LP addresses: ${allLPAddresses.size}\n`);

  // Initialize distributions
  const lpDistributions = new Map<string, LPDistribution>();

  for (const address of allLPAddresses) {
    lpDistributions.set(address, {
      address,
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

  console.log("Querying vsToken balances and calculating distributions...");

  // Process vaults sequentially to maintain consistent RPC load
  const vaultResults = [];

  for (const vaultName of vaultOrder) {
    const config = VAULT_CONFIGS.find((v) => v.name === vaultName)!;
    const baseRewardPool = new ethers.Contract(config.baseRewardAddress, BASE_REWARD_ABI, provider);
    const borrowedFsGLP = vaultBorrowing[vaultName].totalBorrowed;

    const totalSupply = await baseRewardPool.totalSupply();

    if (totalSupply.isZero()) {
      console.log(`  ${vaultName}: No supply, skipping`);
      vaultResults.push({ vaultName, balances: new Map<string, ethers.BigNumber>() });
      continue;
    }

    // Only query addresses that have StakeFor events for this vault
    const vaultSpecificAddresses = vaultLPAddresses.get(vaultName)!;
    const addressArray = Array.from(vaultSpecificAddresses);
    const balances = new Map<string, ethers.BigNumber>();
    const totalBatches = Math.ceil(addressArray.length / BATCH_SIZE);

    console.log(`  ${vaultName}: Processing ${addressArray.length} addresses (${totalBatches} batches)...`);

    for (let i = 0; i < addressArray.length; i += BATCH_SIZE) {
      const batch = addressArray.slice(i, Math.min(i + BATCH_SIZE, addressArray.length));
      const currentBatch = Math.floor(i / BATCH_SIZE) + 1;

      const batchResults = await Promise.all(
        batch.map(async (address) => {
          const balance = await baseRewardPool.balanceOf(address);
          return { address, balance };
        })
      );

      for (const { address, balance } of batchResults) {
        if (balance.gt(0)) {
          balances.set(address, balance);
        }
      }

      // Progress indicator
      process.stdout.write(`\r    Batch ${currentBatch}/${totalBatches} (${balances.size} LPs with balance)...`);

      // Add delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < addressArray.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    console.log(`\r    ✅ Completed: ${balances.size} LPs with balances                    `);
    vaultResults.push({ vaultName, balances, borrowedFsGLP, totalSupply });
  }

  console.log();

  // Apply results to lpDistributions
  for (const { vaultName, balances, borrowedFsGLP, totalSupply } of vaultResults) {
    if (!totalSupply || totalSupply.isZero()) continue;

    for (const [address, balance] of balances) {
      const fsGLPEntitlement = borrowedFsGLP.mul(balance).div(totalSupply);

      const dist = lpDistributions.get(address)!;

      if (vaultName === "WBTC") {
        dist.wbtc_vsTokens = balance.toString();
        dist.wbtc_fsGLP = fsGLPEntitlement.toString();
      } else if (vaultName === "WETH") {
        dist.weth_vsTokens = balance.toString();
        dist.weth_fsGLP = fsGLPEntitlement.toString();
      } else if (vaultName === "USDT") {
        dist.usdt_vsTokens = balance.toString();
        dist.usdt_fsGLP = fsGLPEntitlement.toString();
      } else if (vaultName === "USDC") {
        dist.usdc_vsTokens = balance.toString();
        dist.usdc_fsGLP = fsGLPEntitlement.toString();
      }

      const currentTotal = ethers.BigNumber.from(dist.total_fsGLP);
      dist.total_fsGLP = currentTotal.add(fsGLPEntitlement).toString();
    }
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
  const positionsPath = path.join(__dirname, "out/archi-farmer-positions.csv");
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
  console.log(`✅ out/archi-farmer-positions.csv (${positions.length} positions)`);

  // 2. Farmer distributions
  const farmerDistPath = path.join(__dirname, "out/archi-farmer-distributions.csv");
  const farmerRows = [
    "farmer,collateral_fsGLP,liquidator_fees_share,total_fsGLP",
    ...farmerDistributions.map((d) => `${d.farmer},${d.collateralFsGLP},${d.liquidatorFeesShare},${d.totalFsGLP}`),
  ];
  fs.writeFileSync(farmerDistPath, farmerRows.join("\n"));
  console.log(`✅ out/archi-farmer-distributions.csv (${farmerDistributions.length} farmers)`);

  // 3. LP distributions (detailed with vsToken balances)
  const lpDetailPath = path.join(__dirname, "out/archi-lp-distributions.csv");
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
  console.log(`✅ out/archi-lp-distributions.csv (${lpDistributions.length} LPs)\n`);
}

// ============================================================================
// UPDATE MARKDOWN WITH DISTRIBUTION TABLES
// ============================================================================

function updateMarkdownTables(
  farmerDistributions: FarmerDistribution[],
  lpDistributions: LPDistribution[],
  vaultBorrowing: Record<string, VaultBorrowing>
) {
  console.log("=".repeat(80));
  console.log("Updating ARCHI_DISTRIBUTIONS.md with distribution tables");
  console.log("=".repeat(80) + "\n");

  const mdPath = path.join(__dirname, "ARCHI_DISTRIBUTIONS.md");

  if (!fs.existsSync(mdPath)) {
    console.log("⚠️  ARCHI_DISTRIBUTIONS.md not found, skipping markdown update\n");
    return;
  }

  let mdContent = fs.readFileSync(mdPath, "utf-8");

  // Generate vault borrowing table
  const vaultOrder = ["WBTC", "WETH", "USDT", "USDC"];
  const totalBorrowed = Object.values(vaultBorrowing).reduce(
    (sum, v) => sum.add(v.totalBorrowed),
    ethers.BigNumber.from(0)
  );

  const vaultTableRows = vaultOrder.map((vault) => {
    const data = vaultBorrowing[vault];
    const formatted = parseFloat(ethers.utils.formatEther(data.totalBorrowed));
    const pct = totalBorrowed.gt(0)
      ? (Number(data.totalBorrowed.mul(10000).div(totalBorrowed)) / 100).toFixed(2)
      : "0.00";
    return `| ${vault} | ${formatted.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${pct}% | ${
      data.positionCount
    } |`;
  });

  const totalBorrowedFormatted = parseFloat(ethers.utils.formatEther(totalBorrowed));
  const totalPositions = Object.values(vaultBorrowing).reduce((sum, v) => sum + v.positionCount, 0);

  const vaultTable = `### Vault Borrowing Summary (Farmers)

Farmers borrowed fsGLP from these vaults to create leveraged positions. This borrowed fsGLP is distributed to LPs based on their vsToken holdings.

| Vault | Borrowed fsGLP | % of Total | Farmer Positions |
|-------|----------------|------------|------------------|
${vaultTableRows.join("\n")}
| **TOTAL** | **${totalBorrowedFormatted
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **100%** | **${totalPositions}** |`;

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

Farmers deposited collateral and borrowed from vaults to create leveraged fsGLP positions. They receive their collateral fsGLP plus a proportional share of liquidator fees.

| Farmer Address | Collateral fsGLP | Liquidator Fees Share | Total fsGLP | % of Farmer Total |
|----------------|------------------|----------------------|-------------|-------------------|
${farmerTableRows.join("\n")}
| **TOTAL** | **${farmerTotalCollateral.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${farmerTotalFees
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${farmerTotal
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **100%** |

**Note:** Full farmer distribution details available in \`out/archi-farmer-distributions.csv\` (${
    farmerDistributions.length
  } farmers total)`;

  // Generate LP displayed in table
  const topLPs = TOP_LPS === -1 ? lpDistributions : lpDistributions.slice(0, TOP_LPS);
  const lpTableRows = topLPs.map((lp, idx) => {
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

  // Conditionally show separator line and adjust total row based on whether all LPs are displayed
  const separatorLine = TOP_LPS === -1 ? "" : "| ... | ... | ... | ... | ... | ... | ... |\n";
  const totalRowRank = TOP_LPS === -1 ? "**TOTAL**" : `${lpDistributions.length}`;

  const lpTable = `### LP Distributions - Top ${TOP_LPS === -1 ? "All" : TOP_LPS} (${lpDistributions.length} LPs total)

LPs provided liquidity to vaults and received vsTokens. They earn fsGLP rewards proportional to their vsToken holdings when farmers borrow from their vault.

| Rank | LP Address | WBTC fsGLP | WETH fsGLP | USDT fsGLP | USDC fsGLP | Total fsGLP |
|------|------------|------------|------------|------------|------------|-------------|
${lpTableRows.join("\n")}
${separatorLine}| ${totalRowRank} | **All LPs** | **${lpTotalWbtc
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalWeth
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalUsdt
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalUsdc
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpGrandTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** |

**Note:** Full LP distribution list available in \`out/archi-lp-distributions.csv\` (${lpDistributions.length} LPs total)`;

  // Generate timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";

  const newTablesSection = `---

## Detailed Distribution Tables

*Last updated: ${timestamp}*

${vaultTable}

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
  updateMarkdownTables(farmerDistributions, lpDistributions, vaultBorrowing);
  printSummary(totals, farmerDistributions, lpDistributions);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
