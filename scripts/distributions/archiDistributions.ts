import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// FAST_RPC=true PREVIEW_ALL_LPS=true npx hardhat run --network arbitrum scripts/distributions/archiDistributions.ts

declare const process: any;

// GLP to GLV conversion constants
// Total GLV amounts to be distributed across all farmers and LPs
// Each address receives a proportional share based on their fsGLP allocation
const FSGLP_PRICE_AT_INCIDENT = 1.4522064768; // GLP price in USD at incident
const TOTAL_ETH_GLV = 710379.6304; // Total ETH GLV to distribute
const TOTAL_BTC_GLV = 653567.8033; // Total BTC GLV to distribute

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

const GMX_GLP_MANAGER_ABI = ["function getPrice(bool _maximise) external view returns (uint256)"];

const GMX_GLP_MANAGER = "0x3963FfC9dff443c2A94f21b129D429891E32ec18";

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

// Token addresses for identifying original collateral
const TOKEN_ADDRESSES: Record<string, string> = {
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "WBTC",
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": "USDC",
  "0x5402b5f40310bded796c7d0f3ff6683f5c0cffdf": "fsGLP",
  "0x1addd80e6039594ee970e5872d247bf0414c8903": "fsGLP",
};

interface PositionData {
  farmer: string;
  positionIndex: number;
  originalCollateralToken: string;
  originalCollateralAmount: string;
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
  // Historical data
  txHash: string;
  blockNumber: number;
  timestamp: number;
  date: string;
  glpPriceUsd: string;
  collateralValueUsd: string;
  priceSource: string;
}

interface FarmerDistribution {
  farmer: string;
  collateralFsGLP: string;
  liquidatorFeesShare: string;
  totalFsGLP: string;
  avgFsGlpPriceAtOpen: string;
  fsGlpPriceAtIncident: string;
  cappedTotalFsGLP: string;
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
  usdt_deposit_usd: string;
  usdt_fsGLP_capped: string;
  usdc_vsTokens: string;
  usdc_fsGLP: string;
  usdc_deposit_usd: string;
  usdc_fsGLP_capped: string;
  total_fsGLP: string;
  wbtc_fsGLP_final: string;
  weth_fsGLP_final: string;
  usdt_fsGLP_final: string;
  usdc_fsGLP_final: string;
  total_fsGLP_final: string;
}

// ============================================================================
// HELPER: EXTRACT ORIGINAL COLLATERAL FROM TRANSACTION
// ============================================================================

async function extractOriginalCollateral(
  provider: any,
  txHash: string,
  eventAmountIn: ethers.BigNumber
): Promise<{ token: string; amount: string; symbol: string }> {
  try {
    const tx = await provider.getTransaction(txHash);

    // Try newer signature first (with _token parameter)
    // Function signature: openLendCredit(address _depositor, address _token, uint256 _amountIn, address[] _borrowedTokens, uint256[] _ratios, address _recipient)
    const ifaceNew = new ethers.utils.Interface([
      "function openLendCredit(address _depositor, address _token, uint256 _amountIn, address[] _borrowedTokens, uint256[] _ratios, address _recipient)",
    ]);

    try {
      const decoded = ifaceNew.parseTransaction({ data: tx.data });
      const tokenAddress = decoded.args._token.toLowerCase();
      const amountIn = decoded.args._amountIn;

      // Check if it's ETH placeholder address
      if (tokenAddress === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        return {
          token: tokenAddress,
          amount: ethers.utils.formatEther(amountIn),
          symbol: "ETH",
        };
      }

      // Look up token symbol
      const tokenSymbol = TOKEN_ADDRESSES[tokenAddress];
      if (tokenSymbol) {
        // Determine decimals (WBTC has 8 decimals, others have 18)
        const decimals = tokenSymbol === "WBTC" ? 8 : 18;
        const formattedAmount = ethers.utils.formatUnits(amountIn, decimals);

        return {
          token: tokenAddress,
          amount: formattedAmount,
          symbol: tokenSymbol,
        };
      }

      // Unknown token
      return {
        token: tokenAddress,
        amount: ethers.utils.formatEther(amountIn),
        symbol: "UNKNOWN",
      };
    } catch (decodeError) {
      // Try older signature (without _token parameter - fsGLP was deposited directly)
      // Function signature: openLendCredit(address _depositor, uint256 _amountIn, address[] _borrowedTokens, uint256[] _ratios, address _recipient)
      const ifaceOld = new ethers.utils.Interface([
        "function openLendCredit(address _depositor, uint256 _amountIn, address[] _borrowedTokens, uint256[] _ratios, address _recipient)",
      ]);

      try {
        ifaceOld.parseTransaction({ data: tx.data });
        // Successfully decoded with old signature - this means fsGLP was deposited directly
        return {
          token: "0x1addd80e6039594ee970e5872d247bf0414c8903",
          amount: ethers.utils.formatEther(eventAmountIn),
          symbol: "fsGLP",
        };
      } catch (oldDecodeError) {
        console.warn(`  Could not decode transaction input for ${txHash} with either signature. Using fallback fsGLP`);

        // Fallback: return fsGLP with amount from event
        return {
          token: "0x1addd80e6039594ee970e5872d247bf0414c8903",
          amount: ethers.utils.formatEther(eventAmountIn),
          symbol: "fsGLP",
        };
      }
    }
  } catch (error) {
    console.warn(`  ⚠️  Could not extract original collateral from tx ${txHash}: ${error}`);
    return {
      token: "0x1addd80e6039594ee970e5872d247bf0414c8903",
      amount: ethers.utils.formatEther(eventAmountIn),
      symbol: "fsGLP",
    };
  }
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
  const glpManager = new ethers.Contract(GMX_GLP_MANAGER, GMX_GLP_MANAGER_ABI, provider);

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

  console.log("Checking position termination status and extracting original collateral...");
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

    // Extract original collateral from transaction
    const txHash = event.transactionHash;
    const originalAmount = event.args._amountIn;
    const originalCollateral = await extractOriginalCollateral(provider, txHash, originalAmount);
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

    // Get block data for historical context
    const block = await provider.getBlock(event.blockNumber);
    const date = new Date(block.timestamp * 1000);

    // Query historical GLP price at the block when position was opened
    let glpPriceUsd = "N/A";
    let collateralValueUsd = "N/A";
    let priceSource = "unavailable";

    try {
      const glpPriceBN = await glpManager.getPrice(false, { blockTag: event.blockNumber });
      glpPriceUsd = ethers.utils.formatUnits(glpPriceBN, 30);

      // Calculate collateral value in USD
      const collateralValueBN = originalAmount.mul(glpPriceBN).div(ethers.BigNumber.from(10).pow(30));
      collateralValueUsd = ethers.utils.formatEther(collateralValueBN);
      priceSource = "historical";
    } catch (error: any) {
      // Archive data not available - mark as N/A
      // This will happen on non-archive RPC nodes for old blocks
    }

    positions.push({
      farmer: farmerLower,
      positionIndex,
      originalCollateralToken: originalCollateral.symbol,
      originalCollateralAmount: originalCollateral.amount,
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
      // Historical data
      txHash,
      blockNumber: event.blockNumber,
      timestamp: block.timestamp,
      date: date.toISOString(),
      glpPriceUsd,
      collateralValueUsd,
      priceSource,
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

  const farmerData = new Map<
    string,
    {
      collateralFsGLP: number;
      totalFsGLP: number;
      glpPrices: number[];
      collateralAmounts: number[];
    }
  >();
  let totalPositionFsGLP = 0;

  for (const pos of positions) {
    const collateralFsGLP = parseFloat(pos.collateralFsGLP);
    const totalFsGLP = parseFloat(pos.totalFsGLP);
    const glpPrice = pos.glpPriceUsd !== "N/A" ? parseFloat(pos.glpPriceUsd) : 0;
    const collateralAmount = parseFloat(pos.collateralFsGLP);

    if (!farmerData.has(pos.farmer)) {
      farmerData.set(pos.farmer, {
        collateralFsGLP: 0,
        totalFsGLP: 0,
        glpPrices: [],
        collateralAmounts: [],
      });
    }

    const data = farmerData.get(pos.farmer)!;
    data.collateralFsGLP += collateralFsGLP;
    data.totalFsGLP += totalFsGLP;
    totalPositionFsGLP += totalFsGLP;

    // Track prices and collateral amounts for weighted average
    if (glpPrice > 0) {
      data.glpPrices.push(glpPrice);
      data.collateralAmounts.push(collateralAmount);
    }
  }

  const distributions: FarmerDistribution[] = [];

  for (const [farmer, data] of farmerData) {
    const liquidatorFeesShare = (data.totalFsGLP / totalPositionFsGLP) * liquidatorFeesTotal;
    const totalFarmerFsGLP = data.collateralFsGLP + liquidatorFeesShare;

    // Calculate weighted average fsGLP price at open
    let avgFsGlpPriceAtOpen = 0;
    if (data.glpPrices.length > 0) {
      const totalCollateral = data.collateralAmounts.reduce((sum, amt) => sum + amt, 0);
      const weightedSum = data.glpPrices.reduce((sum, price, idx) => sum + price * data.collateralAmounts[idx], 0);
      avgFsGlpPriceAtOpen = totalCollateral > 0 ? weightedSum / totalCollateral : 0;
    }

    // Calculate capped total fsGLP
    const cappedTotalFsGLP =
      avgFsGlpPriceAtOpen > 0 ? (totalFarmerFsGLP * avgFsGlpPriceAtOpen) / FSGLP_PRICE_AT_INCIDENT : totalFarmerFsGLP;

    distributions.push({
      farmer,
      collateralFsGLP: data.collateralFsGLP.toFixed(18),
      liquidatorFeesShare: liquidatorFeesShare.toFixed(18),
      totalFsGLP: totalFarmerFsGLP.toFixed(18),
      avgFsGlpPriceAtOpen: avgFsGlpPriceAtOpen.toFixed(18),
      fsGlpPriceAtIncident: FSGLP_PRICE_AT_INCIDENT.toFixed(18),
      cappedTotalFsGLP: cappedTotalFsGLP.toFixed(18),
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
      usdt_deposit_usd: "0",
      usdt_fsGLP_capped: "0",
      usdc_vsTokens: "0",
      usdc_fsGLP: "0",
      usdc_deposit_usd: "0",
      usdc_fsGLP_capped: "0",
      total_fsGLP: "0",
      wbtc_fsGLP_final: "0",
      weth_fsGLP_final: "0",
      usdt_fsGLP_final: "0",
      usdc_fsGLP_final: "0",
      total_fsGLP_final: "0",
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
// STEP 6: APPLY STABLECOIN CAPPING AND REDISTRIBUTE EXCESS
// ============================================================================

function step6_applyStablecoinCapping(
  lpDistributions: LPDistribution[],
  farmerDistributions: FarmerDistribution[]
): LPDistribution[] {
  console.log("=".repeat(80));
  console.log("STEP 6: Apply Stablecoin Capping and Redistribute Excess");
  console.log("=".repeat(80) + "\n");

  const FSGLP_PRICE_AT_INCIDENT = 1.45;
  const STABLECOIN_PRICE = 1.0;

  // Step 0: Calculate farmer excess from IL adjustment
  const farmerTotalOriginal = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.totalFsGLP), 0);
  const farmerTotalCapped = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.cappedTotalFsGLP), 0);
  const farmerExcess = farmerTotalOriginal - farmerTotalCapped;

  console.log(`Farmer IL adjustment:`);
  console.log(`  Original farmer total: ${farmerTotalOriginal.toFixed(2)} fsGLP`);
  console.log(`  Capped farmer total:   ${farmerTotalCapped.toFixed(2)} fsGLP`);
  console.log(`  Farmer excess:         ${farmerExcess.toFixed(2)} fsGLP\n`);

  let totalUsdcExcess = 0;
  let totalUsdtExcess = 0;

  // Step 1: Calculate deposit values and capped amounts for stablecoins
  console.log("Calculating stablecoin deposit values and capped amounts...\n");

  for (const dist of lpDistributions) {
    // USDC calculations
    const usdcVsTokens = parseFloat(dist.usdc_vsTokens);
    const usdcDepositUsd = (usdcVsTokens / 1e6) * STABLECOIN_PRICE;
    const usdcFsGLP = parseFloat(ethers.utils.formatEther(dist.usdc_fsGLP));
    const usdcFsGLPValue = usdcFsGLP * FSGLP_PRICE_AT_INCIDENT;
    const usdcCappedFsGLP = Math.min(usdcFsGLP, usdcDepositUsd / FSGLP_PRICE_AT_INCIDENT);
    const usdcExcess = usdcFsGLP - usdcCappedFsGLP;

    dist.usdc_deposit_usd = usdcDepositUsd.toFixed(18);
    dist.usdc_fsGLP_capped = ethers.utils.parseEther(usdcCappedFsGLP.toFixed(18)).toString();
    totalUsdcExcess += usdcExcess;

    // USDT calculations
    const usdtVsTokens = parseFloat(dist.usdt_vsTokens);
    const usdtDepositUsd = (usdtVsTokens / 1e6) * STABLECOIN_PRICE;
    const usdtFsGLP = parseFloat(ethers.utils.formatEther(dist.usdt_fsGLP));
    const usdtFsGLPValue = usdtFsGLP * FSGLP_PRICE_AT_INCIDENT;
    const usdtCappedFsGLP = Math.min(usdtFsGLP, usdtDepositUsd / FSGLP_PRICE_AT_INCIDENT);
    const usdtExcess = usdtFsGLP - usdtCappedFsGLP;

    dist.usdt_deposit_usd = usdtDepositUsd.toFixed(18);
    dist.usdt_fsGLP_capped = ethers.utils.parseEther(usdtCappedFsGLP.toFixed(18)).toString();
    totalUsdtExcess += usdtExcess;
  }

  const stablecoinExcess = totalUsdcExcess + totalUsdtExcess;
  const totalExcess = farmerExcess + stablecoinExcess;

  console.log(`Stablecoin LP excess:`);
  console.log(`  USDC excess: ${totalUsdcExcess.toFixed(2)} fsGLP`);
  console.log(`  USDT excess: ${totalUsdtExcess.toFixed(2)} fsGLP`);
  console.log(`  Total stablecoin excess: ${stablecoinExcess.toFixed(2)} fsGLP\n`);
  console.log(
    `Total excess to redistribute to volatile LPs: ${totalExcess.toFixed(2)} fsGLP (${farmerExcess.toFixed(
      2
    )} from farmers + ${stablecoinExcess.toFixed(2)} from stablecoin LPs)\n`
  );

  // Step 2: Calculate total volatile value across all LPs
  console.log("Calculating volatile asset values for redistribution...\n");

  let totalVolatileValue = 0;
  const lpVolatileValues = new Map<string, number>();

  for (const dist of lpDistributions) {
    const wbtcFsGLP = parseFloat(ethers.utils.formatEther(dist.wbtc_fsGLP));
    const wethFsGLP = parseFloat(ethers.utils.formatEther(dist.weth_fsGLP));
    const volatileValue = wbtcFsGLP * FSGLP_PRICE_AT_INCIDENT + wethFsGLP * FSGLP_PRICE_AT_INCIDENT;

    lpVolatileValues.set(dist.address, volatileValue);
    totalVolatileValue += volatileValue;
  }

  console.log(`Total volatile asset value: $${totalVolatileValue.toFixed(2)}\n`);

  // Step 3: Redistribute excess to WBTC/WETH LPs proportionally
  console.log("Redistributing excess to WBTC/WETH LPs...\n");

  for (const dist of lpDistributions) {
    const wbtcFsGLP = parseFloat(ethers.utils.formatEther(dist.wbtc_fsGLP));
    const wethFsGLP = parseFloat(ethers.utils.formatEther(dist.weth_fsGLP));
    const usdcCappedFsGLP = parseFloat(ethers.utils.formatEther(dist.usdc_fsGLP_capped));
    const usdtCappedFsGLP = parseFloat(ethers.utils.formatEther(dist.usdt_fsGLP_capped));

    const lpVolatileValue = lpVolatileValues.get(dist.address)!;

    // Calculate this LP's share of the excess
    const excessShare = totalVolatileValue > 0 ? (lpVolatileValue / totalVolatileValue) * totalExcess : 0;

    // Split excess between WBTC and WETH based on their value ratio within this LP
    let wbtcExcessShare = 0;
    let wethExcessShare = 0;

    if (lpVolatileValue > 0) {
      const wbtcValue = wbtcFsGLP * FSGLP_PRICE_AT_INCIDENT;
      const wethValue = wethFsGLP * FSGLP_PRICE_AT_INCIDENT;
      const wbtcRatio = wbtcValue / lpVolatileValue;
      const wethRatio = wethValue / lpVolatileValue;

      wbtcExcessShare = excessShare * wbtcRatio;
      wethExcessShare = excessShare * wethRatio;
    }

    // Calculate final distributions
    const wbtcFinal = wbtcFsGLP + wbtcExcessShare;
    const wethFinal = wethFsGLP + wethExcessShare;
    const usdcFinal = usdcCappedFsGLP;
    const usdtFinal = usdtCappedFsGLP;
    const totalFinal = wbtcFinal + wethFinal + usdcFinal + usdtFinal;

    dist.wbtc_fsGLP_final = ethers.utils.parseEther(wbtcFinal.toFixed(18)).toString();
    dist.weth_fsGLP_final = ethers.utils.parseEther(wethFinal.toFixed(18)).toString();
    dist.usdc_fsGLP_final = dist.usdc_fsGLP_capped;
    dist.usdt_fsGLP_final = dist.usdt_fsGLP_capped;
    dist.total_fsGLP_final = ethers.utils.parseEther(totalFinal.toFixed(18)).toString();
  }

  // Calculate totals for summary
  const totalOriginal = lpDistributions.reduce(
    (sum, d) => sum + parseFloat(ethers.utils.formatEther(d.total_fsGLP)),
    0
  );
  const totalFinal = lpDistributions.reduce(
    (sum, d) => sum + parseFloat(ethers.utils.formatEther(d.total_fsGLP_final)),
    0
  );

  console.log(`Total original distribution: ${totalOriginal.toFixed(2)} fsGLP`);
  console.log(`Total final distribution: ${totalFinal.toFixed(2)} fsGLP`);
  console.log(`Difference (should be ~0): ${(totalFinal - totalOriginal).toFixed(6)} fsGLP\n`);

  console.log(`✅ Applied stablecoin capping and redistributed ${totalExcess.toFixed(2)} fsGLP to volatile LPs\n`);

  return lpDistributions;
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
    "farmer,position_index,original_collateral_token,original_collateral_amount,collateral_token,collateral_amount,liquidator_fee,net_collateral,borrowed_tokens,borrowed_amounts,credit_managers,collateral_fsGLP,borrowed_fsGLP,total_fsGLP,leverage,tx_hash,block_number,timestamp,date,glp_price_usd,collateral_value_usd,price_source",
    ...positions.map((p) =>
      [
        p.farmer,
        p.positionIndex,
        p.originalCollateralToken,
        p.originalCollateralAmount,
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
        p.txHash,
        p.blockNumber,
        p.timestamp,
        p.date,
        p.glpPriceUsd,
        p.collateralValueUsd,
        p.priceSource,
      ].join(",")
    ),
  ];
  fs.writeFileSync(positionsPath, positionRows.join("\n"));

  // Count positions with/without price data
  const withPrice = positions.filter((p) => p.priceSource === "historical").length;
  const withoutPrice = positions.filter((p) => p.priceSource === "unavailable").length;

  console.log(`✅ out/archi-farmer-positions.csv (${positions.length} positions)`);
  if (withPrice > 0) {
    console.log(`   📊 Historical prices: ${withPrice}/${positions.length} positions`);
  }
  if (withoutPrice > 0) {
    console.log(`   ⚠️  Missing prices: ${withoutPrice}/${positions.length} (requires archive node)`);
  }

  // 2. Farmer distributions
  const farmerDistPath = path.join(__dirname, "out/archi-farmer-distributions.csv");
  const farmerRows = [
    "farmer,collateral_fsGLP,liquidator_fees_share,total_fsGLP,avg_fsGLP_price_at_open,fsGLP_price_at_incident,capped_total_fsGLP",
    ...farmerDistributions.map(
      (d) =>
        `${d.farmer},${d.collateralFsGLP},${d.liquidatorFeesShare},${d.totalFsGLP},${d.avgFsGlpPriceAtOpen},${d.fsGlpPriceAtIncident},${d.cappedTotalFsGLP}`
    ),
  ];
  fs.writeFileSync(farmerDistPath, farmerRows.join("\n"));
  console.log(`✅ out/archi-farmer-distributions.csv (${farmerDistributions.length} farmers)`);

  // 3. LP distributions (detailed with vsToken balances and capping)
  const lpDetailPath = path.join(__dirname, "out/archi-lp-distributions.csv");
  const lpDetailRows = [
    "address,wbtc_vsTokens,wbtc_fsGLP,weth_vsTokens,weth_fsGLP,usdt_vsTokens,usdt_fsGLP,usdt_deposit_usd,usdt_fsGLP_capped,usdc_vsTokens,usdc_fsGLP,usdc_deposit_usd,usdc_fsGLP_capped,total_fsGLP,wbtc_fsGLP_final,weth_fsGLP_final,usdt_fsGLP_final,usdc_fsGLP_final,total_fsGLP_final",
    ...lpDistributions.map((d) =>
      [
        d.address,
        d.wbtc_vsTokens,
        ethers.utils.formatEther(d.wbtc_fsGLP),
        d.weth_vsTokens,
        ethers.utils.formatEther(d.weth_fsGLP),
        d.usdt_vsTokens,
        ethers.utils.formatEther(d.usdt_fsGLP),
        d.usdt_deposit_usd,
        ethers.utils.formatEther(d.usdt_fsGLP_capped),
        d.usdc_vsTokens,
        ethers.utils.formatEther(d.usdc_fsGLP),
        d.usdc_deposit_usd,
        ethers.utils.formatEther(d.usdc_fsGLP_capped),
        ethers.utils.formatEther(d.total_fsGLP),
        ethers.utils.formatEther(d.wbtc_fsGLP_final),
        ethers.utils.formatEther(d.weth_fsGLP_final),
        ethers.utils.formatEther(d.usdt_fsGLP_final),
        ethers.utils.formatEther(d.usdc_fsGLP_final),
        ethers.utils.formatEther(d.total_fsGLP_final),
      ].join(",")
    ),
  ];
  fs.writeFileSync(lpDetailPath, lpDetailRows.join("\n"));
  console.log(`✅ out/archi-lp-distributions.csv (${lpDistributions.length} LPs)\n`);
}

// ============================================================================
// GENERATE SIMPLIFIED DISTRIBUTIONS
// ============================================================================

/**
 * Generates simplified CSV files for farmer and LP distributions with GLV conversions.
 *
 * This function reads the detailed distribution CSVs from `out/` directory and creates
 * simplified versions containing the essential columns needed for final distributions:
 * - Column 1: Sequential number (#)
 * - Column 2: Wallet address
 * - Column 3: Final fsGLP distribution amount
 * - Column 4: ETH GLV distribution amount
 * - Column 5: BTC GLV distribution amount
 *
 * For farmers: Uses `capped_total_fsGLP` which accounts for IL adjustment based on
 *              the difference between avg opening price and incident price ($1.45)
 *
 * For LPs: Uses `total_fsGLP_final` which includes stablecoin capping and the
 *          redistributed excess from farmers and stablecoin LPs to volatile asset LPs
 *
 * GLV Conversion Formula:
 * ----------------------
 * The fsGLP amounts are converted to ETH GLV and BTC GLV tokens proportionally:
 *
 * Total fsGLP = Sum of all farmer capped_total_fsGLP + Sum of all LP total_fsGLP_final
 * ETH_GLV_amount = (address_fsGLP / Total_fsGLP) × TOTAL_ETH_GLV
 * BTC_GLV_amount = (address_fsGLP / Total_fsGLP) × TOTAL_BTC_GLV
 *
 * Where:
 * - TOTAL_ETH_GLV = 710379.6304 (Total ETH GLV tokens to distribute)
 * - TOTAL_BTC_GLV = 653567.8033 (Total BTC GLV tokens to distribute)
 *
 * This proportional approach ensures that the total GLV distributed exactly matches
 * the target amounts, with each address receiving their proportional share based on
 * their fsGLP allocation.
 *
 * Input files:
 * - `out/archi-farmer-distributions.csv` (detailed farmer distributions)
 * - `out/archi-lp-distributions.csv` (detailed LP distributions)
 *
 * Output files:
 * - `archi-farmer-distributions.csv` (simplified 5-column format with GLV amounts)
 * - `archi-lp-distributions.csv` (simplified 5-column format with GLV amounts)
 */
function parseCsvSimple(content: string): any[] {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const record: any = {};
    headers.forEach((header, index) => {
      record[header] = values[index];
    });
    records.push(record);
  }

  return records;
}

function createCsvSimple(headers: string[], rows: string[][]): string {
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(row.join(","));
  });
  return lines.join("\n");
}

function generateSimplifiedDistributions() {
  console.log("=".repeat(80));
  console.log("Generating Simplified Distribution CSVs");
  console.log("=".repeat(80) + "\n");

  const outDir = path.join(__dirname, "out");
  const distributionsDir = __dirname;

  // Read farmer and LP distributions
  console.log("Reading distribution data...");
  const farmerCsvPath = path.join(outDir, "archi-farmer-distributions.csv");
  const farmerCsvContent = fs.readFileSync(farmerCsvPath, "utf-8");
  const farmerRecords = parseCsvSimple(farmerCsvContent);

  const lpCsvPath = path.join(outDir, "archi-lp-distributions.csv");
  const lpCsvContent = fs.readFileSync(lpCsvPath, "utf-8");
  const lpRecords = parseCsvSimple(lpCsvContent);

  // Calculate total fsGLP across farmers and LPs
  const totalFarmerFsGLP = farmerRecords.reduce((sum: number, record: any) => {
    return sum + parseFloat(record.capped_total_fsGLP);
  }, 0);

  const totalLPFsGLP = lpRecords.reduce((sum: number, record: any) => {
    return sum + parseFloat(record.total_fsGLP_final);
  }, 0);

  const totalFsGLP = totalFarmerFsGLP + totalLPFsGLP;

  console.log(
    `Total fsGLP: ${totalFsGLP.toFixed(2)} (Farmers: ${totalFarmerFsGLP.toFixed(2)}, LPs: ${totalLPFsGLP.toFixed(2)})`
  );
  console.log(`Total ETH GLV to distribute: ${TOTAL_ETH_GLV.toFixed(2)}`);
  console.log(`Total BTC GLV to distribute: ${TOTAL_BTC_GLV.toFixed(2)}\n`);

  // Process farmer distributions
  console.log("Processing simplified farmer distributions...");
  const farmerRows = farmerRecords.map((record: any, index: number) => {
    const fsGlpAmount = parseFloat(record.capped_total_fsGLP);
    const ethGlvAmount = (fsGlpAmount / totalFsGLP) * TOTAL_ETH_GLV;
    const btcGlvAmount = (fsGlpAmount / totalFsGLP) * TOTAL_BTC_GLV;
    return [
      String(index + 1),
      record.farmer,
      record.capped_total_fsGLP,
      ethGlvAmount.toFixed(18),
      btcGlvAmount.toFixed(18),
    ];
  });

  const farmerOutputPath = path.join(distributionsDir, "archi-farmer-distributions.csv");
  const farmerCsvOutput = createCsvSimple(
    ["#", "address", "fsGLP_distribution", "eth_glv_distribution", "btc_glv_distribution"],
    farmerRows
  );
  fs.writeFileSync(farmerOutputPath, farmerCsvOutput);
  console.log(`✅ ${farmerOutputPath} (${farmerRecords.length} farmers)`);

  // Process LP distributions
  console.log("Processing simplified LP distributions...");
  const lpRows = lpRecords.map((record: any, index: number) => {
    const fsGlpAmount = parseFloat(record.total_fsGLP_final);
    const ethGlvAmount = (fsGlpAmount / totalFsGLP) * TOTAL_ETH_GLV;
    const btcGlvAmount = (fsGlpAmount / totalFsGLP) * TOTAL_BTC_GLV;
    return [
      String(index + 1),
      record.address,
      record.total_fsGLP_final,
      ethGlvAmount.toFixed(18),
      btcGlvAmount.toFixed(18),
    ];
  });

  const lpOutputPath = path.join(distributionsDir, "archi-lp-distributions.csv");
  const lpCsvOutput = createCsvSimple(
    ["#", "address", "fsGLP_distribution", "eth_glv_distribution", "btc_glv_distribution"],
    lpRows
  );
  fs.writeFileSync(lpOutputPath, lpCsvOutput);
  console.log(`✅ ${lpOutputPath} (${lpRecords.length} LPs)\n`);
}

// ============================================================================
// UPDATE MARKDOWN WITH DISTRIBUTION TABLES
// ============================================================================

function updateMarkdownTables(
  positions: PositionData[],
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

Farmers borrowed tokens (WETH, WBTC, USDT, USDC) from these vaults to create leveraged positions. The borrowed tokens were converted to fsGLP and tracked by vault. This fsGLP is distributed to LPs based on their vsToken holdings.

| Vault | Borrowed fsGLP | % of Total | Farmer Positions |
|-------|----------------|------------|------------------|
${vaultTableRows.join("\n")}
| **TOTAL** | **${totalBorrowedFormatted
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **100%** | **${totalPositions}** |`;

  // Calculate farmer percentages
  const farmerTotal = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.totalFsGLP), 0);

  // Calculate total capped fsGLP for percentage calculations
  const farmerTotalCapped = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.cappedTotalFsGLP), 0);

  // Calculate total fsGLP for GLV distribution calculations (farmers + LPs)
  const lpTotalFsGLPForGLV = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.total_fsGLP_final)),
    0
  );
  const totalFsGLPForGLV = farmerTotalCapped + lpTotalFsGLPForGLV;

  // Generate farmer table
  const farmerTableRows = farmerDistributions
    .sort((a, b) => parseFloat(b.totalFsGLP) - parseFloat(a.totalFsGLP))
    .map((f) => {
      const collateral = parseFloat(f.collateralFsGLP);
      const fees = parseFloat(f.liquidatorFeesShare);
      const total = parseFloat(f.totalFsGLP);
      const avgPrice = parseFloat(f.avgFsGlpPriceAtOpen);
      const incidentPrice = parseFloat(f.fsGlpPriceAtIncident);
      const cappedTotal = parseFloat(f.cappedTotalFsGLP);
      const recoveryPct = ((cappedTotal / total) * 100).toFixed(2);
      const avgPriceDisplay = avgPrice > 0 ? `$${avgPrice.toFixed(4)}` : "N/A";

      // Calculate GLV distributions
      const ethGlv = (cappedTotal / totalFsGLPForGLV) * TOTAL_ETH_GLV;
      const btcGlv = (cappedTotal / totalFsGLPForGLV) * TOTAL_BTC_GLV;

      return `| ${f.farmer} | ${collateral.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${fees
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | **${total
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | ${avgPriceDisplay} | $${incidentPrice.toFixed(2)} | **${cappedTotal
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | ${recoveryPct}% | ${ethGlv
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${btcGlv.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} |`;
    });

  const farmerTotalCollateral = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.collateralFsGLP), 0);
  const farmerTotalFees = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.liquidatorFeesShare), 0);

  // Calculate total GLV for farmers
  const farmerTotalEthGLV = farmerDistributions.reduce((sum, f) => {
    const cappedTotal = parseFloat(f.cappedTotalFsGLP);
    return sum + (cappedTotal / totalFsGLPForGLV) * TOTAL_ETH_GLV;
  }, 0);
  const farmerTotalBtcGLV = farmerDistributions.reduce((sum, f) => {
    const cappedTotal = parseFloat(f.cappedTotalFsGLP);
    return sum + (cappedTotal / totalFsGLPForGLV) * TOTAL_BTC_GLV;
  }, 0);

  const farmerTable = `### Farmer Distributions (${farmerDistributions.length} farmers)

Farmers deposited collateral and borrowed tokens from vaults to create leveraged fsGLP positions. All assets were converted to fsGLP. They receive their collateral fsGLP entitlement plus a proportional share of liquidator fees.

The **Capped Total fsGLP** column accounts for the difference between the average fsGLP price when farmers opened their positions versus the fsGLP price at the time of the incident ($1.45), calculated as: \`total_fsGLP * avg_price_at_open / price_at_incident\`.

The **Recovery %** column shows what percentage of their original total fsGLP each farmer receives back after the cap is applied (i.e., \`capped_total / total_fsGLP * 100\`).

The **ETH GLV** and **BTC GLV** columns show the GLV token distributions, calculated proportionally based on each farmer's share of the total fsGLP distribution.

| Farmer Address | Collateral fsGLP | Liquidator Fees Share | Total fsGLP | Avg Price at Open | Price at Incident | Capped Total fsGLP | Recovery % | ETH GLV | BTC GLV |
|----------------|------------------|----------------------|-------------|-------------------|-------------------|--------------------|------------|---------|---------|
${farmerTableRows.join("\n")}
| **TOTAL** | **${farmerTotalCollateral.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${farmerTotalFees
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${farmerTotal
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | - | **$1.45** | **${farmerTotalCapped
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${((farmerTotalCapped / farmerTotal) * 100).toFixed(
    2
  )}%** | **${farmerTotalEthGLV.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${farmerTotalBtcGLV
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** |

**Note:** Full farmer distribution details available in \`out/archi-farmer-distributions.csv\` (${
    farmerDistributions.length
  } farmers total)`;

  // Generate farmer positions table with historical data
  const positionsTableRows = positions
    .sort((a, b) => {
      // Sort by farmer, then by position index
      if (a.farmer !== b.farmer) return a.farmer.localeCompare(b.farmer);
      return a.positionIndex - b.positionIndex;
    })
    .map((p, idx) => {
      const dateStr = p.date.split("T")[0];
      const collateralFmt = parseFloat(p.collateralAmount).toFixed(2);
      const totalFsGLPFmt = parseFloat(p.totalFsGLP).toFixed(2);
      const leverageFmt = p.leverage;
      const priceDisplay = p.priceSource === "historical" ? `$${parseFloat(p.glpPriceUsd).toFixed(4)}` : "N/A";
      const valueDisplay =
        p.priceSource === "historical"
          ? `$${parseFloat(p.collateralValueUsd)
              .toFixed(2)
              .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
          : "N/A";
      const txLink = `[${p.txHash.substring(0, 6)}...](https://arbiscan.io/tx/${p.txHash})`;

      return `| ${idx + 1} | ${p.farmer} | ${
        p.positionIndex
      } | ${dateStr} | ${collateralFmt} | ${priceDisplay} | ${valueDisplay} | ${totalFsGLPFmt} | ${leverageFmt}x | ${txLink} |`;
    });

  const positionsWithPrice = positions.filter((p) => p.priceSource === "historical").length;
  const positionsWithoutPrice = positions.filter((p) => p.priceSource === "unavailable").length;

  const priceNote =
    positionsWithoutPrice > 0
      ? `\n\n⚠️ **Note on Prices:** ${positionsWithPrice}/${positions.length} positions have historical price data. ${positionsWithoutPrice} position(s) require archive node for historical prices.`
      : `\n\n✅ **All positions have historical price data.**`;

  const positionsTable = `<details>
<summary><strong>All Farmer Positions (${positions.length} positions)</strong></summary>

Complete details for all active farmer positions including opening dates, historical GLP prices, and transaction hashes.

| # | Farmer | Pos# | Opening Date | Collateral (fsGLP) | GLP Price | Collateral Value (USD) | Total fsGLP | Leverage | Transaction |
|---|--------|------|--------------|-------------------|-----------|----------------------|-------------|----------|-------------|
${positionsTableRows.join("\n")}

**Column Definitions:**
- **Farmer**: Address of the farmer who created the position
- **Pos#**: Position index number
- **Opening Date**: Date when position was opened (YYYY-MM-DD)
- **Collateral (fsGLP)**: Amount of fsGLP deposited as collateral
- **GLP Price**: Historical GLP price in USD at the time of opening
- **Collateral Value (USD)**: USD value of collateral at opening (collateral × GLP price)
- **Total fsGLP**: Total fsGLP including borrowed amounts (collateral + borrowed)
- **Leverage**: Leverage multiplier (total fsGLP ÷ collateral fsGLP)
- **Transaction**: Link to opening transaction on Arbiscan${priceNote}

**Full Details:** See \`out/archi-farmer-positions.csv\` for complete data including block numbers, timestamps, borrowed tokens, credit managers, and more.

</details>`;

  // Generate LP displayed in table (showing final distributions after capping)
  const topLPs = TOP_LPS === -1 ? lpDistributions : lpDistributions.slice(0, TOP_LPS);
  const lpTableRows = topLPs.map((lp, idx) => {
    const wbtcFinal = parseFloat(ethers.utils.formatEther(lp.wbtc_fsGLP_final));
    const wethFinal = parseFloat(ethers.utils.formatEther(lp.weth_fsGLP_final));
    const usdtFinal = parseFloat(ethers.utils.formatEther(lp.usdt_fsGLP_final));
    const usdcFinal = parseFloat(ethers.utils.formatEther(lp.usdc_fsGLP_final));
    const totalFinal = parseFloat(ethers.utils.formatEther(lp.total_fsGLP_final));

    // Calculate GLV distributions
    const ethGlv = (totalFinal / totalFsGLPForGLV) * TOTAL_ETH_GLV;
    const btcGlv = (totalFinal / totalFsGLPForGLV) * TOTAL_BTC_GLV;

    return `| ${idx + 1} | ${lp.address} | ${wbtcFinal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${wethFinal
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${usdtFinal
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${usdcFinal
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | **${totalFinal
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | ${ethGlv.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} | ${btcGlv
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")} |`;
  });

  const lpTotalWbtcFinal = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.wbtc_fsGLP_final)),
    0
  );
  const lpTotalWethFinal = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.weth_fsGLP_final)),
    0
  );
  const lpTotalUsdtFinal = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.usdt_fsGLP_final)),
    0
  );
  const lpTotalUsdcFinal = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.usdc_fsGLP_final)),
    0
  );
  const lpGrandTotalFinal = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.total_fsGLP_final)),
    0
  );

  // Calculate total GLV for LPs
  const lpTotalEthGLV = lpDistributions.reduce((sum, lp) => {
    const totalFinal = parseFloat(ethers.utils.formatEther(lp.total_fsGLP_final));
    return sum + (totalFinal / totalFsGLPForGLV) * TOTAL_ETH_GLV;
  }, 0);
  const lpTotalBtcGLV = lpDistributions.reduce((sum, lp) => {
    const totalFinal = parseFloat(ethers.utils.formatEther(lp.total_fsGLP_final));
    return sum + (totalFinal / totalFsGLPForGLV) * TOTAL_BTC_GLV;
  }, 0);

  // Conditionally show separator line and adjust total row based on whether all LPs are displayed
  const separatorLine = TOP_LPS === -1 ? "" : "| ... | ... | ... | ... | ... | ... | ... | ... | ... |\n";
  const totalRowRank = TOP_LPS === -1 ? "**TOTAL**" : `${lpDistributions.length}`;

  const lpTable = `### LP Distributions - Top ${TOP_LPS === -1 ? "All" : TOP_LPS} (${lpDistributions.length} LPs total)

LPs provided liquidity to vaults and received vsTokens. They receive fsGLP distributions proportional to their vsToken holdings, based on what farmers borrowed from their vault (tracked as fsGLP value).

**Stablecoin Capping Applied:** USDC and USDT distributions are capped so that their fsGLP value at $1.45 does not exceed their original deposit value. The excess fsGLP from this capping is redistributed proportionally to WBTC and WETH LPs based on their volatile asset holdings.

**These are final distributions** after stablecoin capping and excess redistribution.

The **ETH GLV** and **BTC GLV** columns show the GLV token distributions, calculated proportionally based on each LP's share of the total fsGLP distribution.

| Rank | LP Address | WBTC fsGLP | WETH fsGLP | USDT fsGLP | USDC fsGLP | Total fsGLP | ETH GLV | BTC GLV |
|------|------------|------------|------------|------------|------------|-------------|---------|---------|
${lpTableRows.join("\n")}
${separatorLine}| ${totalRowRank} | **All LPs** | **${lpTotalWbtcFinal
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalWethFinal
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalUsdtFinal
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalUsdcFinal
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpGrandTotalFinal
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalEthGLV
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** | **${lpTotalBtcGLV.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}** |

**Note:** Full LP distribution list available in \`out/archi-lp-distributions.csv\` (${
    lpDistributions.length
  } LPs total)`;

  // Generate timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";

  const newTablesSection = `---

## Detailed Distribution Tables

*Last updated: ${timestamp}*

${vaultTable}

${farmerTable}

${positionsTable}

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

  const farmerTotalOriginal = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.totalFsGLP), 0);
  const farmerTotalCapped = farmerDistributions.reduce((sum, f) => sum + parseFloat(f.cappedTotalFsGLP), 0);
  const lpTotalOriginal = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.total_fsGLP)),
    0
  );
  const lpTotalFinal = lpDistributions.reduce(
    (sum, lp) => sum + parseFloat(ethers.utils.formatEther(lp.total_fsGLP_final)),
    0
  );
  const distributedOriginal = farmerTotalOriginal + lpTotalOriginal;
  const distributedFinal = farmerTotalCapped + lpTotalFinal;

  const farmerExcess = farmerTotalOriginal - farmerTotalCapped;
  const lpGain = lpTotalFinal - lpTotalOriginal;

  console.log("Distribution Breakdown:");
  console.log(`  Farmers (original): ${farmerTotalOriginal.toFixed(2)} fsGLP`);
  console.log(
    `  Farmers (capped):   ${farmerTotalCapped.toFixed(2)} fsGLP (after IL adjustment) (${
      farmerDistributions.length
    } farmers)`
  );
  console.log(`  Farmer excess:      ${farmerExcess.toFixed(2)} fsGLP (redistributed to LPs)\n`);
  console.log(`  LPs (original):     ${lpTotalOriginal.toFixed(2)} fsGLP`);
  console.log(`  LPs (final):        ${lpTotalFinal.toFixed(2)} fsGLP (${lpDistributions.length} LPs)`);
  console.log(`  LP gain:            ${lpGain.toFixed(2)} fsGLP (from farmer excess + stablecoin capping)\n`);
  console.log(`  Total (original):   ${distributedOriginal.toFixed(2)} fsGLP`);
  console.log(`  Total (final):      ${distributedFinal.toFixed(2)} fsGLP`);
  console.log(`  Expected:           ${(totals.gmxExecutor + totals.creditUser2).toFixed(2)} fsGLP`);
  console.log(
    `  Difference:         ${(distributedFinal - (totals.gmxExecutor + totals.creditUser2)).toFixed(
      6
    )} fsGLP (should be ~0)\n`
  );

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
  const lpDistributionsFinal = step6_applyStablecoinCapping(lpDistributions, farmerDistributions);

  writeOutputFiles(positions, farmerDistributions, vaultBorrowing, lpDistributionsFinal);
  updateMarkdownTables(positions, farmerDistributions, lpDistributionsFinal, vaultBorrowing);
  generateSimplifiedDistributions();
  printSummary(totals, farmerDistributions, lpDistributionsFinal);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
