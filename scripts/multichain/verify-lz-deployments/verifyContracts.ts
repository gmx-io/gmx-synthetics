// Verify all OFTAdapter and OFT contracts across all networks
//
// This script verifies:
//   - Arbitrum hub: OFTAdapter contracts (6 adapters)
//   - Spoke networks: OFT contracts (6 OFTs × 5 networks = 30 OFTs)
//
// Usage:
//   npx ts-node scripts/multichain/verify-lz-deployments/verifyContracts.ts
//
// RPC URLs: Uses .env variables if set, otherwise falls back to hardhat.config.ts defaults
// Optional env vars: ARBITRUM_RPC_URL, ETHEREUM_RPC_URL, BASE_RPC_URL, BSC_RPC_URL, BERA_RPC_URL, BOTANIX_RPC_URL

import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import {
  networks,
  allNetworks,
  expansionNetworks,
  gmMarkets,
  glvMarkets,
  getGmContract,
  getGlvContract,
  getGmUnderlying,
  getGlvUnderlying,
  getExpectedOwner,
  libAddressesByNetwork,
  NetworkName,
} from "./addresses";
import {
  initLogFile,
  logSection,
  logSubsection,
  logSuccess,
  logError,
  logInfo,
  log,
  verifyContractDeployed,
  verifyOwnership,
  verifyUnderlyingToken,
  verifyPeer,
  verifyDelegate,
  verifyTokenProperties,
  verifyEnforcedOptionsHubToSpoke,
  verifyEnforcedOptionsSpokeToHub,
  testQuoteSend,
  verifyLibAddresses,
  OFT_ABI,
  ERC20_ABI,
  LZ_ENDPOINT_ABI_EXTENDED,
} from "./utils";

// =============================================================================
// Types
// =============================================================================

interface NetworkProvider {
  provider: ethers.providers.JsonRpcProvider;
  endpoint: ethers.Contract;
}

interface NetworkResults {
  passed: number;
  failed: number;
}

// =============================================================================
// Provider Initialization
// =============================================================================

const defaultRpcs: Record<NetworkName, string> = {
  arbitrum: "https://arb1.arbitrum.io/rpc",
  ethereum: "https://mainnet.gateway.tenderly.co",
  base: "https://base.gateway.tenderly.co",
  bsc: "https://bsc-dataseed.binance.org",
  bera: "https://rpc.berachain.com",
  botanix: "https://rpc.botanixlabs.com",
};

function getRpcUrl(network: NetworkName): string {
  const envVarMap: Record<NetworkName, string> = {
    arbitrum: "ARBITRUM_RPC_URL",
    ethereum: "ETHEREUM_RPC_URL",
    base: "BASE_RPC_URL",
    bsc: "BSC_RPC_URL",
    bera: "BERA_RPC_URL",
    botanix: "BOTANIX_RPC_URL",
  };

  const envVar = envVarMap[network];
  const envRpcUrl = process.env[envVar];
  if (envRpcUrl) {
    return envRpcUrl;
  }

  return defaultRpcs[network];
}

function initializeProviders(): Record<NetworkName, NetworkProvider> {
  const providers: Partial<Record<NetworkName, NetworkProvider>> = {};

  for (const network of allNetworks) {
    const rpcUrl = getRpcUrl(network);
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const endpoint = new ethers.Contract(networks[network].endpoint, LZ_ENDPOINT_ABI_EXTENDED, provider);

    providers[network] = { provider, endpoint };
  }

  return providers as Record<NetworkName, NetworkProvider>;
}

// =============================================================================
// DVN Config Verification (for adapters)
// =============================================================================

async function verifyDvnConfigExists(
  endpoint: ethers.Contract,
  adapterAddress: string,
  network: NetworkName,
  sourceNetwork: NetworkName
): Promise<boolean> {
  try {
    const eid = networks[network].eid;
    const dvnConfig = await endpoint.getConfig(adapterAddress, libAddressesByNetwork[sourceNetwork].sendLib, eid, 2);

    if (dvnConfig && dvnConfig !== "0x" && dvnConfig.length > 10) {
      logSuccess(`DVN config exists for ${network} (EID ${eid})`);
      return true;
    }
    logError(`Missing DVN config for ${network} (EID ${eid})`);
    return false;
  } catch (error) {
    logError(`Failed to check DVN config for ${network}: ${error}`);
    return false;
  }
}

// =============================================================================
// Adapter Balance Check (info only)
// =============================================================================

async function checkAdapterBalance(
  adapterAddress: string,
  underlyingAddress: string,
  provider: ethers.providers.Provider,
  market: string,
  tokenType: string
) {
  try {
    const underlying = new ethers.Contract(underlyingAddress, ERC20_ABI, provider);
    const balance = await underlying.balanceOf(adapterAddress);
    logInfo(`${market} ${tokenType} adapter balance: ${ethers.utils.formatEther(balance)}`);
  } catch (error) {
    logError(`Failed to check adapter balance: ${error}`);
  }
}

// =============================================================================
// Adapter Verification (Hub)
// =============================================================================

async function verifyGmAdapter(
  market: string,
  providers: Record<NetworkName, NetworkProvider>
): Promise<NetworkResults> {
  let passed = 0;
  let failed = 0;

  logSubsection(`GM ${market} Adapter`);

  const { provider, endpoint } = providers.arbitrum;
  const adapterAddress = getGmContract(market, "arbitrum");
  const underlyingAddress = getGmUnderlying(market);
  const expectedOwner = getExpectedOwner("arbitrum");

  // Check deployment
  if (await verifyContractDeployed(adapterAddress, provider)) {
    passed++;
  } else {
    failed++;
    return { passed, failed };
  }

  const adapter = new ethers.Contract(adapterAddress, OFT_ABI, provider);

  // Check underlying token
  if (await verifyUnderlyingToken(adapter, underlyingAddress)) {
    passed++;
  } else {
    failed++;
  }

  // Check adapter balance (info only)
  await checkAdapterBalance(adapterAddress, underlyingAddress, provider, market, "GM");

  // Check ownership
  if (await verifyOwnership(adapter, expectedOwner)) {
    passed++;
  } else {
    failed++;
  }

  // Check delegate
  if (await verifyDelegate(endpoint, adapterAddress, expectedOwner)) {
    passed++;
  } else {
    failed++;
  }

  // Check peers for all expansion networks
  for (const network of expansionNetworks) {
    const expectedPeer = getGmContract(market, network);
    if (await verifyPeer(adapter, network, expectedPeer)) {
      passed++;
    } else {
      failed++;
    }
  }

  // Check DVN config for all expansion networks
  for (const network of expansionNetworks) {
    if (await verifyDvnConfigExists(endpoint, adapterAddress, network, "arbitrum")) {
      passed++;
    } else {
      failed++;
    }
  }

  // Check enforced options (hub → spoke)
  for (const network of expansionNetworks) {
    if (await verifyEnforcedOptionsHubToSpoke(adapter, network)) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test quotes
  for (const network of expansionNetworks) {
    const eid = networks[network].eid;
    if (await testQuoteSend(adapter, eid)) {
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

async function verifyGlvAdapter(
  market: string,
  providers: Record<NetworkName, NetworkProvider>
): Promise<NetworkResults> {
  let passed = 0;
  let failed = 0;

  logSubsection(`GLV ${market} Adapter`);

  const { provider, endpoint } = providers.arbitrum;
  const adapterAddress = getGlvContract(market, "arbitrum");
  const underlyingAddress = getGlvUnderlying(market);
  const expectedOwner = getExpectedOwner("arbitrum");

  // Check deployment
  if (await verifyContractDeployed(adapterAddress, provider)) {
    passed++;
  } else {
    failed++;
    return { passed, failed };
  }

  const adapter = new ethers.Contract(adapterAddress, OFT_ABI, provider);

  // Check underlying token
  if (await verifyUnderlyingToken(adapter, underlyingAddress)) {
    passed++;
  } else {
    failed++;
  }

  // Check adapter balance (info only)
  await checkAdapterBalance(adapterAddress, underlyingAddress, provider, market, "GLV");

  // Check ownership
  if (await verifyOwnership(adapter, expectedOwner)) {
    passed++;
  } else {
    failed++;
  }

  // Check delegate
  if (await verifyDelegate(endpoint, adapterAddress, expectedOwner)) {
    passed++;
  } else {
    failed++;
  }

  // Check peers for all expansion networks
  for (const network of expansionNetworks) {
    const expectedPeer = getGlvContract(market, network);
    if (await verifyPeer(adapter, network, expectedPeer)) {
      passed++;
    } else {
      failed++;
    }
  }

  // Check DVN config for all expansion networks
  for (const network of expansionNetworks) {
    if (await verifyDvnConfigExists(endpoint, adapterAddress, network, "arbitrum")) {
      passed++;
    } else {
      failed++;
    }
  }

  // Check enforced options (hub → spoke)
  for (const network of expansionNetworks) {
    if (await verifyEnforcedOptionsHubToSpoke(adapter, network)) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test quotes
  for (const network of expansionNetworks) {
    const eid = networks[network].eid;
    if (await testQuoteSend(adapter, eid)) {
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

// =============================================================================
// OFT Verification (Spokes)
// =============================================================================

async function verifyGmOft(
  market: string,
  network: NetworkName,
  providers: Record<NetworkName, NetworkProvider>
): Promise<NetworkResults> {
  let passed = 0;
  let failed = 0;

  logSubsection(`GM ${market} OFT`);

  const { provider, endpoint } = providers[network];
  const oftAddress = getGmContract(market, network);
  const expectedOwner = getExpectedOwner(network);

  // Check deployment
  if (await verifyContractDeployed(oftAddress, provider)) {
    passed++;
  } else {
    failed++;
    return { passed, failed };
  }

  const oft = new ethers.Contract(oftAddress, OFT_ABI, provider);

  // Check token properties
  if (await verifyTokenProperties(oft)) {
    passed++;
  } else {
    failed++;
  }

  // Check ownership
  if (await verifyOwnership(oft, expectedOwner)) {
    passed++;
  } else {
    failed++;
  }

  // Check delegate
  if (await verifyDelegate(endpoint, oftAddress, expectedOwner)) {
    passed++;
  } else {
    failed++;
  }

  // Check peers for all other networks (including Arbitrum hub)
  for (const peerNetwork of allNetworks) {
    if (peerNetwork === network) continue;

    const expectedPeer = getGmContract(market, peerNetwork);
    if (await verifyPeer(oft, peerNetwork, expectedPeer)) {
      passed++;
    } else {
      failed++;
    }
  }

  // Check enforced options (spoke → hub)
  if (await verifyEnforcedOptionsSpokeToHub(oft)) {
    passed++;
  } else {
    failed++;
  }

  // Test quote to Arbitrum
  const arbEid = networks.arbitrum.eid;
  if (await testQuoteSend(oft, arbEid)) {
    passed++;
  } else {
    failed++;
  }

  return { passed, failed };
}

async function verifyGlvOft(
  market: string,
  network: NetworkName,
  providers: Record<NetworkName, NetworkProvider>
): Promise<NetworkResults> {
  let passed = 0;
  let failed = 0;

  logSubsection(`GLV ${market} OFT`);

  const { provider, endpoint } = providers[network];
  const oftAddress = getGlvContract(market, network);
  const expectedOwner = getExpectedOwner(network);

  // Check deployment
  if (await verifyContractDeployed(oftAddress, provider)) {
    passed++;
  } else {
    failed++;
    return { passed, failed };
  }

  const oft = new ethers.Contract(oftAddress, OFT_ABI, provider);

  // Check token properties
  if (await verifyTokenProperties(oft)) {
    passed++;
  } else {
    failed++;
  }

  // Check ownership
  if (await verifyOwnership(oft, expectedOwner)) {
    passed++;
  } else {
    failed++;
  }

  // Check delegate
  if (await verifyDelegate(endpoint, oftAddress, expectedOwner)) {
    passed++;
  } else {
    failed++;
  }

  // Check peers for all other networks (including Arbitrum hub)
  for (const peerNetwork of allNetworks) {
    if (peerNetwork === network) continue;

    const expectedPeer = getGlvContract(market, peerNetwork);
    if (await verifyPeer(oft, peerNetwork, expectedPeer)) {
      passed++;
    } else {
      failed++;
    }
  }

  // Check enforced options (spoke → hub)
  if (await verifyEnforcedOptionsSpokeToHub(oft)) {
    passed++;
  } else {
    failed++;
  }

  // Test quote to Arbitrum
  const arbEid = networks.arbitrum.eid;
  if (await testQuoteSend(oft, arbEid)) {
    passed++;
  } else {
    failed++;
  }

  return { passed, failed };
}

// =============================================================================
// Lib Address Verification
// =============================================================================

async function verifyNetworkLibAddresses(
  network: NetworkName,
  providers: Record<NetworkName, NetworkProvider>
): Promise<boolean> {
  const { endpoint } = providers[network];
  const contracts = [
    ...gmMarkets.map((m) => getGmContract(m, network)),
    ...glvMarkets.map((m) => getGlvContract(m, network)),
  ];

  // Just check the first contract - they all use the same lib
  const firstContract = contracts[0];
  const destEid = network === "arbitrum" ? networks.ethereum.eid : networks.arbitrum.eid;

  return verifyLibAddresses(endpoint, firstContract, libAddressesByNetwork[network].sendLib, destEid);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const logFile = initLogFile("contracts-verification");

  logSection("Contract Verification (All Networks)");
  log(`  Started at: ${new Date().toISOString()}`);
  log(`  Log file: ${logFile}`);
  log("");
  log("  This script verifies OFTAdapter and OFT contracts:");
  log("    - Arbitrum hub: 6 OFTAdapter contracts");
  log("    - Spoke networks: 6 OFT contracts × 5 networks = 30 OFTs");
  log("");
  log("  Initializing providers for all networks...");

  const providers = initializeProviders();
  logSuccess("All providers initialized");

  const contractNames = [...gmMarkets.map((m) => `GM ${m}`), ...glvMarkets.map((m) => `GLV ${m}`)];
  log(`  Contracts to verify: ${contractNames.join(", ")}`);

  const results: Record<NetworkName, NetworkResults> = {
    arbitrum: { passed: 0, failed: 0 },
    ethereum: { passed: 0, failed: 0 },
    base: { passed: 0, failed: 0 },
    bsc: { passed: 0, failed: 0 },
    bera: { passed: 0, failed: 0 },
    botanix: { passed: 0, failed: 0 },
  };

  // ==========================================================================
  // Step 1: Verify Lib Addresses
  // ==========================================================================
  logSection("Step 1: Verify Lib Addresses Match Expected");
  log("  Checking that hardcoded sendLib addresses match endpoint.getSendLibrary()");

  for (const network of allNetworks) {
    log(`\n--- ${network.toUpperCase()} ---`);
    await verifyNetworkLibAddresses(network, providers);
  }

  // ==========================================================================
  // Step 2: Arbitrum Hub - Adapters
  // ==========================================================================
  logSection("Step 2: Arbitrum Hub - Adapters");

  log("\n--- GM ADAPTERS ---");
  for (const market of gmMarkets) {
    const result = await verifyGmAdapter(market, providers);
    results.arbitrum.passed += result.passed;
    results.arbitrum.failed += result.failed;
  }

  log("\n--- GLV ADAPTERS ---");
  for (const market of glvMarkets) {
    const result = await verifyGlvAdapter(market, providers);
    results.arbitrum.passed += result.passed;
    results.arbitrum.failed += result.failed;
  }

  // ==========================================================================
  // Step 3: Spoke Networks - OFTs
  // ==========================================================================
  logSection("Step 3: Spoke Networks - OFTs");

  for (const network of expansionNetworks) {
    log(`\n${"=".repeat(40)}`);
    log(`  ${network.toUpperCase()}`);
    log(`${"=".repeat(40)}`);

    log("\n--- GM OFTs ---");
    for (const market of gmMarkets) {
      const result = await verifyGmOft(market, network, providers);
      results[network].passed += result.passed;
      results[network].failed += result.failed;
    }

    log("\n--- GLV OFTs ---");
    for (const market of glvMarkets) {
      const result = await verifyGlvOft(market, network, providers);
      results[network].passed += result.passed;
      results[network].failed += result.failed;
    }
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  logSection("CONTRACT VERIFICATION SUMMARY");

  log("  Per-network results:");
  let totalPassed = 0;
  let totalFailed = 0;

  for (const network of allNetworks) {
    const r = results[network];
    totalPassed += r.passed;
    totalFailed += r.failed;
    const status = r.failed === 0 ? "✓" : "✗";
    log(`    ${status} ${network}: ${r.passed} passed, ${r.failed} failed`);
  }

  log("");
  log(`  Total: ${totalPassed} passed, ${totalFailed} failed`);
  log("");

  if (totalFailed === 0) {
    logSuccess("All contract verifications passed!");
  } else {
    logError(`${totalFailed} verification(s) failed - review output above`);
  }

  log(`\n  Completed at: ${new Date().toISOString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
