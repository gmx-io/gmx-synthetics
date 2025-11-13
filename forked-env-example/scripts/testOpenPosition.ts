import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
  loadGMXContracts,
  dealETH,
  getActiveKeeper,
  setupMockOracleProvider,
  createIncreaseOrderParams,
  createOracleParams,
  getOrderCount,
  getAccountOrderCount,
  getAccountPositionCount,
  getPositionCount,
  getPositionKey,
  logBalances,
  GMX_ADDRESSES,
} from "./helpers";

/**
 * Test script demonstrating how to open a long ETH position on GMX V2
 *
 * This script:
 * 1. Forks Arbitrum at block 392496384 (using Anvil)
 * 2. Funds a test user with ETH
 * 3. Mocks the Chainlink oracle provider to return preset prices
 * 4. Creates a MarketIncrease order (2.5x leverage long ETH)
 * 5. Executes the order as a keeper
 * 6. Verifies the position was created successfully
 *
 * Prerequisites:
 * - Anvil must be running: `npm run anvil:start`
 * - Run with: `npm run test:open`
 */

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║          GMX V2 - Open Long Position Test (Anvil)         ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // ============================================================================
  // Setup
  // ============================================================================

  console.log("=== Fork Setup ===");
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log(`Chain ID: ${chainId}`);
  console.log(`Block number: ${blockNumber}`);
  console.log("==================\n");

  // Load GMX contracts
  const gmx = await loadGMXContracts();
  console.log("GMX contracts loaded ✓\n");

  // Get signers - Anvil provides default accounts
  const [user] = await ethers.getSigners();
  console.log(`User address: ${user.address}`);

  // Fund user with ETH (100 ETH for testing)
  const INITIAL_ETH_BALANCE = ethers.utils.parseEther("100");
  await dealETH(user.address, INITIAL_ETH_BALANCE);

  // Get active keeper
  const keeperAddress = await getActiveKeeper(gmx.roleStore);

  // ============================================================================
  // Test Parameters - Match Mainnet Order
  // ============================================================================

  // Reference: Mainnet tx 0x68a77542fd9ba2bcd342099158dd17c0918cee70726ecd2e2446b0f16c46da50
  // Block 392496384, ETH price = $3,892 (historical price at fork block)
  const ETH_PRICE_USD = 3892;
  const USDC_PRICE_USD = 1;
  const ETH_COLLATERAL = ethers.utils.parseEther("0.001"); // 0.001 ETH collateral
  const LEVERAGE = 2.5;

  console.log("\n=== Position Parameters ===");
  console.log(
    `Collateral: ${ethers.utils.formatEther(ETH_COLLATERAL)} ETH (~$${
      Number(ethers.utils.formatEther(ETH_COLLATERAL)) * ETH_PRICE_USD
    } at $${ETH_PRICE_USD}/ETH)`
  );
  console.log(`Leverage: ${LEVERAGE}x`);
  console.log(`Position Size: ~$${Number(ethers.utils.formatEther(ETH_COLLATERAL)) * ETH_PRICE_USD * LEVERAGE}`);
  console.log(`Direction: LONG`);
  console.log("===========================\n");

  // Record initial balances (preserve keeper's fork balance for realistic execution)
  const initialUserBalance = await ethers.provider.getBalance(user.address);
  const initialKeeperBalance = await ethers.provider.getBalance(keeperAddress);
  await logBalances("Initial Balances", [
    { name: "User", address: user.address },
    { name: "Keeper", address: keeperAddress },
  ]);

  // ============================================================================
  // Step 1: Record Initial State
  // ============================================================================

  const initialOrderCount = await getOrderCount(gmx.dataStore);
  const initialUserOrderCount = await getAccountOrderCount(gmx.dataStore, user.address);
  const initialUserPositionCount = await getAccountPositionCount(gmx.dataStore, user.address);
  const initialPositionCount = await getPositionCount(gmx.dataStore);

  console.log("=== Initial State ===");
  console.log(`Global order count: ${initialOrderCount}`);
  console.log(`User order count: ${initialUserOrderCount}`);
  console.log(`User position count: ${initialUserPositionCount}`);
  console.log(`Global position count: ${initialPositionCount}`);
  console.log("====================\n");

  // ============================================================================
  // Step 2: Setup Mock Oracle
  // ============================================================================

  await setupMockOracleProvider(ETH_PRICE_USD, USDC_PRICE_USD);

  // ============================================================================
  // Step 3: Create Order
  // ============================================================================

  console.log("=== Creating Order ===");

  // Calculate position size in USD (30 decimals)
  // GMX uses 30 decimals for USD values
  // positionSizeUsd = collateral (18 decimals) * price * leverage (30 decimals) / 1e18
  // Example: 0.001 ETH * $3892 * 2.5x = $9.73 → 9.73e30 in GMX format
  const leverageWith30Decimals = ethers.utils.parseUnits(LEVERAGE.toString(), 30);
  const positionSizeUsd = ETH_COLLATERAL.mul(BigNumber.from(ETH_PRICE_USD))
    .mul(leverageWith30Decimals)
    .div(BigNumber.from(10).pow(18));

  const orderParams = createIncreaseOrderParams({
    market: GMX_ADDRESSES.ETH_USD_MARKET,
    collateralToken: GMX_ADDRESSES.WETH,
    collateralAmount: ETH_COLLATERAL,
    sizeDeltaUsd: positionSizeUsd,
    isLong: true,
    receiver: user.address,
  });

  // Send WETH + execution fee to OrderVault
  const totalEthNeeded = orderParams.numbers.initialCollateralDeltaAmount;
  await gmx.exchangeRouter.connect(user).sendWnt(GMX_ADDRESSES.ORDER_VAULT, totalEthNeeded, {
    value: totalEthNeeded,
  });

  // Get order key from callStatic (simulates the call and returns the value)
  const orderKey = await gmx.exchangeRouter.connect(user).callStatic.createOrder(orderParams, {
    value: 0,
  });

  // Create order with value 0 (tokens already sent via sendWnt)
  const createOrderTx = await gmx.exchangeRouter.connect(user).createOrder(orderParams, {
    value: 0,
  });
  await createOrderTx.wait();

  console.log(`Order created successfully! ✓`);
  console.log(`Order key: ${orderKey}`);
  console.log("======================\n");

  // Verify order was created
  const afterCreateOrderCount = await getOrderCount(gmx.dataStore);
  const afterCreateUserOrderCount = await getAccountOrderCount(gmx.dataStore, user.address);

  console.log("=== After Order Creation ===");
  console.log(`Global order count: ${afterCreateOrderCount} (expected: ${initialOrderCount.add(1)})`);
  console.log(`User order count: ${afterCreateUserOrderCount} (expected: ${initialUserOrderCount.add(1)})`);

  if (!afterCreateOrderCount.eq(initialOrderCount.add(1))) {
    throw new Error("Order count did not increase by 1!");
  }
  if (!afterCreateUserOrderCount.eq(initialUserOrderCount.add(1))) {
    throw new Error("User order count did not increase by 1!");
  }
  console.log("============================\n");

  // ============================================================================
  // Step 4: Execute Order (as Keeper)
  // ============================================================================

  console.log("=== Executing Order (as Keeper) ===");

  // Preserve keeper's mainnet balance for realistic execution economics
  // (dealETH sets balance, not adds to it, so we restore the fork state balance)
  await dealETH(keeperAddress, initialKeeperBalance);
  console.log(`Keeper balance preserved at ${ethers.utils.formatEther(initialKeeperBalance)} ETH (mainnet fork state)`);

  // Setup mock oracle provider again right before execution (like Foundry test does)
  await setupMockOracleProvider(ETH_PRICE_USD, USDC_PRICE_USD);

  // Impersonate keeper using Anvil RPC
  // We need to use a direct JsonRpcProvider to bypass Hardhat's account checks
  const anvilProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
  await anvilProvider.send("anvil_impersonateAccount", [keeperAddress]);

  // Get an unchecked signer from the direct provider
  const keeperSigner = anvilProvider.getUncheckedSigner(keeperAddress);

  // Connect the order handler to the keeper signer
  const keeperOrderHandler = gmx.orderHandler.connect(keeperSigner);

  // Create oracle params
  const oracleParams = createOracleParams();

  // Execute order
  const executeOrderTx = await keeperOrderHandler.executeOrder(orderKey, oracleParams);
  const executeOrderReceipt = await executeOrderTx.wait();

  // Debug: Log transaction details
  console.log(`Transaction hash: ${executeOrderReceipt.transactionHash}`);
  console.log(`Gas used: ${executeOrderReceipt.gasUsed.toString()}`);
  console.log(`Status: ${executeOrderReceipt.status}`);
  console.log(`Number of logs: ${executeOrderReceipt.logs.length}`);

  // Check for key events (GMX uses EventLog1 wrapper, so check for specific event name hashes)
  const positionIncreaseHash = "0xf94196ccb31f81a3e67df18f2a62cbfb50009c80a7d3c728a3f542e3abc5cb63"; // keccak256("PositionIncrease")
  const positionFeesHash = "0xe096982abd597114bdaa4a60612f87fabfcc7206aa12d61c50e7ba1e6c291100"; // keccak256("PositionFeesCollected")

  const hasPositionIncrease = executeOrderReceipt.logs.some(
    (log) => log.topics.length > 1 && log.topics[1] === positionIncreaseHash
  );
  const hasPositionFees = executeOrderReceipt.logs.some(
    (log) => log.topics.length > 1 && log.topics[1] === positionFeesHash
  );

  console.log(`\nEvent verification:`);
  console.log(`PositionIncrease event: ${hasPositionIncrease ? "✓" : "✗"}`);
  console.log(`PositionFeesCollected event: ${hasPositionFees ? "✓" : "✗"}`);

  console.log("Order executed successfully! ✓");

  // Stop impersonating keeper
  await anvilProvider.send("anvil_stopImpersonatingAccount", [keeperAddress]);
  console.log("===================================\n");

  // ============================================================================
  // Step 5: Verify Position Key
  // ============================================================================

  console.log("\n=== Position Verification ===");

  // Calculate position key for reference
  const positionKey = getPositionKey(user.address, GMX_ADDRESSES.ETH_USD_MARKET, GMX_ADDRESSES.WETH, true);
  console.log(`Position key: ${positionKey}`);
  console.log(`Position successfully created! ✓`);
  console.log("============================");

  // ============================================================================
  // Step 6: Verify Final State
  // ============================================================================

  const finalOrderCount = await getOrderCount(gmx.dataStore);
  const finalUserOrderCount = await getAccountOrderCount(gmx.dataStore, user.address);
  const finalUserPositionCount = await getAccountPositionCount(gmx.dataStore, user.address);
  const finalPositionCount = await getPositionCount(gmx.dataStore);

  console.log("\n=== Final State ===");
  console.log(`Global order count: ${finalOrderCount} (expected: ${initialOrderCount})`);
  console.log(`User order count: ${finalUserOrderCount} (expected: ${initialUserOrderCount})`);
  console.log(`User position count: ${finalUserPositionCount} (expected: ${initialUserPositionCount.add(1)})`);
  console.log(`Global position count: ${finalPositionCount} (expected: ${initialPositionCount.add(1)})`);
  console.log("===================\n");

  // Verify state changes
  if (!finalOrderCount.eq(initialOrderCount)) {
    throw new Error("Order count did not return to initial (order not consumed)!");
  }
  if (!finalUserOrderCount.eq(initialUserOrderCount)) {
    throw new Error("User order count did not return to initial!");
  }
  if (!finalUserPositionCount.eq(initialUserPositionCount.add(1))) {
    throw new Error("User position count did not increase by 1!");
  }
  if (!finalPositionCount.eq(initialPositionCount.add(1))) {
    throw new Error("Global position count did not increase by 1!");
  }

  // Log final balances with differences
  const finalUserBalance = await ethers.provider.getBalance(user.address);
  const finalKeeperBalance = await ethers.provider.getBalance(keeperAddress);

  const userDiff = finalUserBalance.sub(initialUserBalance);
  const keeperDiff = finalKeeperBalance.sub(initialKeeperBalance);

  console.log("\n=== Final Balances ===");
  console.log(
    `User: ${ethers.utils.formatEther(finalUserBalance)} ETH (${
      userDiff.isNegative() ? "" : "+"
    }${ethers.utils.formatEther(userDiff)} ETH)`
  );
  console.log(
    `Keeper: ${ethers.utils.formatEther(finalKeeperBalance)} ETH (${
      keeperDiff.isNegative() ? "" : "+"
    }${ethers.utils.formatEther(keeperDiff)} ETH)`
  );
  console.log("======================\n");

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    TEST PASSED ✓                           ║");
  console.log("║          Long position opened successfully!                ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
