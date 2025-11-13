import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
  loadGMXContracts,
  dealETH,
  getActiveKeeper,
  setupMockOracleProvider,
  createIncreaseOrderParams,
  createDecreaseOrderParams,
  createOracleParams,
  getAccountPositionCount,
  getPositionKey,
  getOrderKeyFromReceipt,
  logBalances,
  GMX_ADDRESSES,
} from "./helpers";

/**
 * Test script demonstrating how to close a long ETH position on GMX V2
 *
 * This script:
 * 1. Opens a long ETH position (same as testOpenPosition.ts)
 * 2. Creates a MarketDecrease order to close the position
 * 3. Executes the order as a keeper
 * 4. Verifies the position was closed and collateral returned
 *
 * Prerequisites:
 * - Anvil must be running: `npm run anvil:start`
 * - Run with: `npm run test:close`
 */

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║         GMX V2 - Close Long Position Test (Anvil)         ║");
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

  // Get signers
  const [user] = await ethers.getSigners();
  console.log(`User address: ${user.address}`);

  // Fund user with ETH
  const INITIAL_ETH_BALANCE = ethers.utils.parseEther("100");
  await dealETH(user.address, INITIAL_ETH_BALANCE);

  // Get active keeper
  const keeperAddress = await getActiveKeeper(gmx.roleStore);

  // ============================================================================
  // Test Parameters
  // ============================================================================

  const ETH_PRICE_USD = 3892;
  const USDC_PRICE_USD = 1;
  const ETH_COLLATERAL = ethers.utils.parseEther("0.001");
  const LEVERAGE = 2.5;

  console.log("\n=== Position Parameters ===");
  console.log(`Collateral: ${ethers.utils.formatEther(ETH_COLLATERAL)} ETH`);
  console.log(`Leverage: ${LEVERAGE}x`);
  console.log(`Direction: LONG`);
  console.log("===========================\n");

  // Setup mock oracle
  await setupMockOracleProvider(ETH_PRICE_USD, USDC_PRICE_USD);

  // ============================================================================
  // Step 1: Open Position
  // ============================================================================

  console.log("=== Step 1: Opening Position ===\n");

  // Calculate position size
  const positionSizeUsd = ETH_COLLATERAL.mul(BigNumber.from(ETH_PRICE_USD))
    .mul(BigNumber.from(Math.floor(LEVERAGE * 1e12)))
    .div(BigNumber.from(10).pow(18));

  // Create increase order parameters
  const openOrderParams = createIncreaseOrderParams({
    market: GMX_ADDRESSES.ETH_USD_MARKET,
    collateralToken: GMX_ADDRESSES.WETH,
    collateralAmount: ETH_COLLATERAL,
    sizeDeltaUsd: positionSizeUsd,
    isLong: true,
    receiver: user.address,
  });

  // Send WETH + execution fee
  const totalEthNeeded = openOrderParams.numbers.initialCollateralDeltaAmount;
  await gmx.exchangeRouter.connect(user).sendWnt(GMX_ADDRESSES.ORDER_VAULT, totalEthNeeded, {
    value: totalEthNeeded,
  });

  // Create order
  const createOrderTx = await gmx.exchangeRouter.connect(user).createOrder(openOrderParams);
  const createOrderReceipt = await createOrderTx.wait();
  const openOrderKey = getOrderKeyFromReceipt(createOrderReceipt);

  console.log(`Order created: ${openOrderKey}`);

  // Execute order as keeper
  await ethers.provider.send("anvil_impersonateAccount", [keeperAddress]);
  const keeper = await ethers.getSigner(keeperAddress);
  await dealETH(keeperAddress, ethers.utils.parseEther("1"));

  const oracleParams = createOracleParams();
  const executeOpenTx = await gmx.orderHandler.connect(keeper).executeOrder(openOrderKey, oracleParams);
  await executeOpenTx.wait();

  await ethers.provider.send("anvil_stopImpersonatingAccount", [keeperAddress]);

  console.log("Position opened successfully! ✓");

  // Verify position was created
  const positionKey = getPositionKey(user.address, GMX_ADDRESSES.ETH_USD_MARKET, GMX_ADDRESSES.WETH, true);
  console.log(`Position key: ${positionKey}\n`);

  const positionCountAfterOpen = await getAccountPositionCount(gmx.dataStore, user.address);
  console.log(`User position count after opening: ${positionCountAfterOpen}`);

  if (!positionCountAfterOpen.eq(1)) {
    throw new Error("Expected 1 position after opening!");
  }

  console.log("================================\n");

  // Record WETH balance before closing (should be 0 or minimal)
  const weth = await ethers.getContractAt("IERC20", GMX_ADDRESSES.WETH);
  const wethBalanceBefore = await weth.balanceOf(user.address);
  console.log(`User WETH balance before closing: ${ethers.utils.formatEther(wethBalanceBefore)} WETH\n`);

  // ============================================================================
  // Step 2: Close Position
  // ============================================================================

  console.log("=== Step 2: Closing Position ===\n");

  // Create decrease order to close entire position
  const closeOrderParams = createDecreaseOrderParams({
    market: GMX_ADDRESSES.ETH_USD_MARKET,
    collateralToken: GMX_ADDRESSES.WETH,
    sizeDeltaUsd: positionSizeUsd, // Close entire position
    isLong: true,
    receiver: user.address,
  });

  // Send execution fee
  const executionFee = closeOrderParams.numbers.executionFee;
  await gmx.exchangeRouter.connect(user).sendWnt(GMX_ADDRESSES.ORDER_VAULT, executionFee, {
    value: executionFee,
  });

  // Create decrease order
  const createCloseOrderTx = await gmx.exchangeRouter.connect(user).createOrder(closeOrderParams);
  const createCloseOrderReceipt = await createCloseOrderTx.wait();
  const closeOrderKey = getOrderKeyFromReceipt(createCloseOrderReceipt);

  console.log(`Decrease order created: ${closeOrderKey}`);

  // Execute close order as keeper
  await ethers.provider.send("anvil_impersonateAccount", [keeperAddress]);
  const keeperForClose = await ethers.getSigner(keeperAddress);

  const executeCloseTx = await gmx.orderHandler.connect(keeperForClose).executeOrder(closeOrderKey, oracleParams);
  await executeCloseTx.wait();

  await ethers.provider.send("anvil_stopImpersonatingAccount", [keeperAddress]);

  console.log("Position closed successfully! ✓");
  console.log("================================\n");

  // ============================================================================
  // Step 3: Verify Results
  // ============================================================================

  console.log("=== Verification ===\n");

  const positionCountAfterClose = await getAccountPositionCount(gmx.dataStore, user.address);
  console.log(`User position count after closing: ${positionCountAfterClose} (expected: 0)`);

  if (!positionCountAfterClose.eq(0)) {
    throw new Error("Expected 0 positions after closing!");
  }

  // Check WETH balance - should have received collateral back
  const wethBalanceAfter = await weth.balanceOf(user.address);
  const wethReceived = wethBalanceAfter.sub(wethBalanceBefore);

  console.log(`\nWETH balances:`);
  console.log(`- Before closing: ${ethers.utils.formatEther(wethBalanceBefore)} WETH`);
  console.log(`- After closing: ${ethers.utils.formatEther(wethBalanceAfter)} WETH`);
  console.log(`- WETH received: ${ethers.utils.formatEther(wethReceived)} WETH`);

  if (wethReceived.lte(0)) {
    throw new Error("Should have received WETH back (collateral returned)!");
  }

  console.log("\n✓ Collateral returned successfully!");
  console.log("====================\n");

  // Log final balances
  await logBalances("Final Balances", [{ name: "User", address: user.address }]);

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    TEST PASSED ✓                           ║");
  console.log("║          Position closed and collateral returned!         ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
