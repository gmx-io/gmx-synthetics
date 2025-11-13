import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { loadGMXContracts, GMX_ADDRESSES } from "./helpers";

/**
 * Verification script to check Anvil setup is working correctly
 *
 * This script performs basic checks:
 * 1. Connects to Anvil node
 * 2. Verifies fork is at correct block number
 * 3. Loads GMX contracts
 * 4. Checks account balances
 * 5. Verifies contract deployments
 *
 * Run with: npx hardhat run scripts/verifySetup.ts --network anvil
 */

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║            Anvil Setup Verification Script                ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  let checksPass = 0;
  let checksFail = 0;

  // ============================================================================
  // Check 1: Network Connection
  // ============================================================================
  console.log("✓ Check 1: Network Connection");
  try {
    const network = await ethers.provider.getNetwork();
    console.log(`  Chain ID: ${network.chainId}`);

    if (network.chainId === 42161) {
      console.log("  ✅ PASS - Connected to Arbitrum fork\n");
      checksPass++;
    } else {
      console.log(`  ❌ FAIL - Expected Arbitrum (42161), got ${network.chainId}\n`);
      checksFail++;
    }
  } catch (error: any) {
    console.log(`  ❌ FAIL - Could not connect to network: ${error.message}\n`);
    checksFail++;
    return; // Can't continue without network
  }

  // ============================================================================
  // Check 2: Fork Block Number
  // ============================================================================
  console.log("✓ Check 2: Fork Block Number");
  try {
    const blockNumber = await ethers.provider.getBlockNumber();
    console.log(`  Current block: ${blockNumber}`);

    // Should be at or after 392496384 (the reference block)
    const REFERENCE_BLOCK = 392496384;
    if (blockNumber >= REFERENCE_BLOCK) {
      console.log(`  ✅ PASS - Fork is at or after reference block ${REFERENCE_BLOCK}\n`);
      checksPass++;
    } else {
      console.log(`  ❌ FAIL - Block ${blockNumber} is before reference block ${REFERENCE_BLOCK}\n`);
      checksFail++;
    }
  } catch (error: any) {
    console.log(`  ❌ FAIL - Could not get block number: ${error.message}\n`);
    checksFail++;
  }

  // ============================================================================
  // Check 3: Account Access
  // ============================================================================
  console.log("✓ Check 3: Account Access");
  try {
    const [account] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(account.address);

    console.log(`  Default account: ${account.address}`);
    console.log(`  Balance: ${ethers.utils.formatEther(balance)} ETH`);

    if (balance.gt(0)) {
      console.log("  ✅ PASS - Default account has ETH balance\n");
      checksPass++;
    } else {
      console.log("  ❌ FAIL - Default account has no ETH\n");
      checksFail++;
    }
  } catch (error: any) {
    console.log(`  ❌ FAIL - Could not access accounts: ${error.message}\n`);
    checksFail++;
  }

  // ============================================================================
  // Check 4: GMX Contract Deployment
  // ============================================================================
  console.log("✓ Check 4: GMX Contract Deployments");
  try {
    const gmx = await loadGMXContracts();

    // Check a few key contracts have code
    const exchangeRouterCode = await ethers.provider.getCode(GMX_ADDRESSES.EXCHANGE_ROUTER);
    const dataStoreCode = await ethers.provider.getCode(GMX_ADDRESSES.DATA_STORE);
    const oracleCode = await ethers.provider.getCode(GMX_ADDRESSES.ORACLE);

    const hasCode = exchangeRouterCode !== "0x" && dataStoreCode !== "0x" && oracleCode !== "0x";

    console.log(`  ExchangeRouter: ${GMX_ADDRESSES.EXCHANGE_ROUTER} ${exchangeRouterCode !== "0x" ? "✓" : "✗"}`);
    console.log(`  DataStore: ${GMX_ADDRESSES.DATA_STORE} ${dataStoreCode !== "0x" ? "✓" : "✗"}`);
    console.log(`  Oracle: ${GMX_ADDRESSES.ORACLE} ${oracleCode !== "0x" ? "✓" : "✗"}`);

    if (hasCode) {
      console.log("  ✅ PASS - GMX contracts deployed at expected addresses\n");
      checksPass++;
    } else {
      console.log("  ❌ FAIL - Some GMX contracts not found\n");
      checksFail++;
    }
  } catch (error: any) {
    console.log(`  ❌ FAIL - Could not load GMX contracts: ${error.message}\n`);
    checksFail++;
  }

  // ============================================================================
  // Check 5: Token Contracts
  // ============================================================================
  console.log("✓ Check 5: Token Contract Deployments");
  try {
    // Simple ABI for decimals() function
    const erc20Abi = ["function decimals() view returns (uint8)"];

    const weth = new ethers.Contract(GMX_ADDRESSES.WETH, erc20Abi, ethers.provider);
    const usdc = new ethers.Contract(GMX_ADDRESSES.USDC, erc20Abi, ethers.provider);

    // Try to call a view function
    const wethDecimals = await weth.decimals();
    const usdcDecimals = await usdc.decimals();

    console.log(`  WETH: ${GMX_ADDRESSES.WETH} (${wethDecimals} decimals) ✓`);
    console.log(`  USDC: ${GMX_ADDRESSES.USDC} (${usdcDecimals} decimals) ✓`);

    if (wethDecimals === 18 && usdcDecimals === 6) {
      console.log("  ✅ PASS - Token contracts accessible with correct decimals\n");
      checksPass++;
    } else {
      console.log("  ❌ FAIL - Token decimals incorrect\n");
      checksFail++;
    }
  } catch (error: any) {
    console.log(`  ❌ FAIL - Could not access token contracts: ${error.message}\n`);
    checksFail++;
  }

  // ============================================================================
  // Check 6: Anvil RPC Methods
  // ============================================================================
  console.log("✓ Check 6: Anvil RPC Methods");
  try {
    // Test anvil_setBalance
    const testAddress = "0x0000000000000000000000000000000000000001";
    const testAmount = ethers.utils.parseEther("1");
    await ethers.provider.send("anvil_setBalance", [testAddress, testAmount.toHexString()]);

    const newBalance = await ethers.provider.getBalance(testAddress);

    if (newBalance.eq(testAmount)) {
      console.log("  anvil_setBalance: ✓");
      console.log("  ✅ PASS - Anvil RPC methods working\n");
      checksPass++;
    } else {
      console.log("  anvil_setBalance: ✗");
      console.log("  ❌ FAIL - anvil_setBalance not working correctly\n");
      checksFail++;
    }
  } catch (error: any) {
    console.log(`  ❌ FAIL - Anvil RPC methods not available: ${error.message}\n`);
    checksFail++;
  }

  // ============================================================================
  // Check 7: Contract Compilation
  // ============================================================================
  console.log("✓ Check 7: Contract Compilation");
  try {
    // Try to get the contract factory for MockOracleProvider
    const MockOracleProviderFactory = await ethers.getContractFactory("MockOracleProvider");

    console.log("  MockOracleProvider: ✓");
    console.log("  ✅ PASS - Contracts compiled successfully\n");
    checksPass++;
  } catch (error: any) {
    console.log(`  ❌ FAIL - Contracts not compiled: ${error.message}`);
    console.log("  Run: npx hardhat compile\n");
    checksFail++;
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    Verification Summary                    ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log(`Total checks: ${checksPass + checksFail}`);
  console.log(`✅ Passed: ${checksPass}`);
  console.log(`❌ Failed: ${checksFail}\n`);

  if (checksFail === 0) {
    console.log("🎉 All checks passed! Your Anvil setup is ready to use.");
    console.log("\nNext steps:");
    console.log("  - Run: npm run test:open");
    console.log("  - Run: npm run test:close");
    console.log("  - Or: npm run test:all\n");
  } else {
    console.log("⚠️  Some checks failed. Please review the errors above.");
    console.log("\nCommon fixes:");
    console.log("  - Ensure Anvil is running: npm run anvil:start");
    console.log("  - Compile contracts: npx hardhat compile");
    console.log("  - Check .env has ARBITRUM_RPC_URL set");
    console.log("  - See ANVIL_SETUP.md for troubleshooting\n");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Verification script error:", error);
    process.exit(1);
  });
