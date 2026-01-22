// Verify DVN configuration for all GM/GLV OFTs across all networks
// This ensures proper decentralized verification for cross-chain messages
//
// For each network pair (A → B), we verify:
//   - A's sendLib has correct DVN configuration for messages to B
//   - Required DVNs: LayerZero Labs + Canary (both must verify)
//   - Optional DVNs: Deutsche Telekom + Horizen (1 of 2 must verify)
//
// Usage:
//   npx ts-node scripts/multichain/verify-lz-deployments/verifyDvnConfigs.ts
//
// RPC URLs: Uses .env variables if set, otherwise falls back to hardhat.config.ts defaults
// Optional env vars: ARBITRUM_RPC_URL, ETHEREUM_RPC_URL, BASE_RPC_URL, BSC_RPC_URL, BERA_RPC_URL, BOTANIX_RPC_URL
//
// Note: Public RPCs may rate-limit causing transient failures. If you see validation errors,
// re-run the script or set private RPC URLs in .env for more reliable results.

import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import {
  networks,
  allNetworks,
  gmMarkets,
  glvMarkets,
  getGmContract,
  getGlvContract,
  libAddressesByNetwork,
  dvnAddressesByNetwork,
  NetworkName,
} from "./addresses";
import {
  initLogFile,
  logSection,
  logSubsection,
  logSuccess,
  logError,
  logWarning,
  log,
  verifyLibAddresses,
  decodeDVNConfig,
  getRpcUrl,
  DVNConfig,
  LZ_ENDPOINT_ABI_EXTENDED,
} from "./utils";

// =============================================================================
// Types
// =============================================================================

interface NetworkProvider {
  provider: ethers.providers.JsonRpcProvider;
  endpoint: ethers.Contract;
}

interface ContractInfo {
  name: string;
  getAddress: (network: NetworkName) => string;
  type: "GM" | "GLV";
}

interface DVNCheckResult {
  sourceNetwork: NetworkName;
  destNetwork: NetworkName;
  contract: string;
  valid: boolean;
  requiredCount: number | null;
  optionalCount: number | null;
  optionalThreshold: number | null;
  error?: string;
}

// =============================================================================
// Provider Initialization
// =============================================================================

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
// Contract Information
// =============================================================================

function getContractsToCheck(): ContractInfo[] {
  const contracts: ContractInfo[] = [];

  for (const market of gmMarkets) {
    contracts.push({
      name: `GM ${market}`,
      getAddress: (network: NetworkName) => getGmContract(market, network),
      type: "GM",
    });
  }

  for (const market of glvMarkets) {
    contracts.push({
      name: `GLV ${market}`,
      getAddress: (network: NetworkName) => getGlvContract(market, network),
      type: "GLV",
    });
  }

  return contracts;
}

// =============================================================================
// Verification Logic
// =============================================================================

async function verifyNetworkLibAddresses(
  providers: Record<NetworkName, NetworkProvider>,
  contracts: ContractInfo[]
): Promise<boolean> {
  logSection("Step 1: Verify Lib Addresses Match Expected");
  log("  Checking that hardcoded sendLib addresses match endpoint.getSendLibrary()");
  log("");

  let allMatch = true;

  for (const network of allNetworks) {
    logSubsection(`${network.toUpperCase()}`);
    const { endpoint } = providers[network];
    const expectedSendLib = libAddressesByNetwork[network].sendLib;

    // Check for one contract to one destination (if libs match for one, they match for all)
    const contract = contracts[0];
    const contractAddress = contract.getAddress(network);
    const destNetworks = allNetworks.filter((n) => n !== network);

    if (destNetworks.length > 0) {
      const destEid = networks[destNetworks[0]].eid;
      const match = await verifyLibAddresses(endpoint, contractAddress, expectedSendLib, destEid);
      if (!match) {
        allMatch = false;
      }
    }
  }

  return allMatch;
}

/**
 * Validate DVN config using network-specific DVN addresses
 */
function validateDVNConfigForNetwork(
  config: DVNConfig,
  sourceNetwork: NetworkName
): { valid: boolean; error?: string } {
  const dvnAddrs = dvnAddressesByNetwork[sourceNetwork];

  // Check required DVNs: must have LayerZero Labs + Canary
  const hasLayerzero = config.requiredDVNs.includes(dvnAddrs.layerzero);
  const hasCanary = config.requiredDVNs.includes(dvnAddrs.canary);

  if (!hasLayerzero || !hasCanary) {
    const missing = [];
    if (!hasLayerzero) missing.push("LZ Labs");
    if (!hasCanary) missing.push("Canary");
    return { valid: false, error: `missing required: ${missing.join(", ")}` };
  }

  if (config.requiredCount !== 2) {
    return { valid: false, error: `requiredCount=${config.requiredCount}, expected 2` };
  }

  // Check optional DVNs: must have Deutsche + Horizen with threshold 1
  const hasDeutsche = config.optionalDVNs.includes(dvnAddrs.deutsche);
  const hasHorizen = config.optionalDVNs.includes(dvnAddrs.horizen);

  if (!hasDeutsche || !hasHorizen) {
    const missing = [];
    if (!hasDeutsche) missing.push("Deutsche");
    if (!hasHorizen) missing.push("Horizen");
    return { valid: false, error: `missing optional: ${missing.join(", ")}` };
  }

  if (config.optionalCount !== 2 || config.optionalThreshold !== 1) {
    return {
      valid: false,
      error: `optional: count=${config.optionalCount}, threshold=${config.optionalThreshold} (expected 2, 1)`,
    };
  }

  return { valid: true };
}

/**
 * Get DVN config for a contract sending to a destination
 */
async function getDVNConfig(
  endpoint: ethers.Contract,
  oappAddress: string,
  sendLib: string,
  destEid: number
): Promise<DVNConfig | null> {
  try {
    const configHex = await endpoint.getConfig(oappAddress, sendLib, destEid, 2);
    return decodeDVNConfig(configHex);
  } catch {
    return null;
  }
}

/**
 * Verify DVN configuration for a contract between two networks
 */
async function verifyDVNConsistency(
  providers: Record<NetworkName, NetworkProvider>,
  contract: ContractInfo,
  sourceNetwork: NetworkName,
  destNetwork: NetworkName
): Promise<DVNCheckResult> {
  const sourceEndpoint = providers[sourceNetwork].endpoint;
  const sourceContractAddr = contract.getAddress(sourceNetwork);
  const destEid = networks[destNetwork].eid;

  const config = await getDVNConfig(
    sourceEndpoint,
    sourceContractAddr,
    libAddressesByNetwork[sourceNetwork].sendLib,
    destEid
  );

  if (!config) {
    return {
      sourceNetwork,
      destNetwork,
      contract: contract.name,
      valid: false,
      requiredCount: null,
      optionalCount: null,
      optionalThreshold: null,
      error: "failed to decode config",
    };
  }

  const validation = validateDVNConfigForNetwork(config, sourceNetwork);

  return {
    sourceNetwork,
    destNetwork,
    contract: contract.name,
    valid: validation.valid,
    requiredCount: config.requiredCount,
    optionalCount: config.optionalCount,
    optionalThreshold: config.optionalThreshold,
    error: validation.error,
  };
}

// =============================================================================
// Summary Report
// =============================================================================

function generateDVNReport(results: DVNCheckResult[], passed: number, failed: number) {
  logSection("DVN VERIFICATION SUMMARY");

  log(`  Verification approach:`);
  log(`    For each network pair (A → B), we verify:`);
  log(`      - A's sendLib DVN configuration for messages to B`);
  log(`      - Required: LayerZero Labs + Canary (both must verify)`);
  log(`      - Optional: Deutsche Telekom + Horizen (1 of 2 must verify)`);
  log("");

  log(`  Verification matrix:`);
  log(`    Networks: ${allNetworks.length}`);
  log(`    Contracts: ${getContractsToCheck().length}`);
  log(`    Network pairs: ${allNetworks.length * (allNetworks.length - 1)}`);
  log(`    Total checks: ${results.length}`);
  log("");

  log(`  Results:`);
  log(`    Passed: ${passed}`);
  log(`    Failed: ${failed}`);
  log("");

  if (failed > 0) {
    logError("DVN CONFIGURATION ERRORS DETECTED!");
    log("");
    log("  Failed checks:");

    for (const result of results.filter((r) => !r.valid)) {
      log(`    - ${result.contract}: ${result.sourceNetwork} → ${result.destNetwork}`);
      log(`      Error: ${result.error ?? "unknown"}`);
    }
    log("");
    logWarning("DVN misconfigurations can compromise cross-chain message security!");
    logWarning("Ensure all DVNs are correctly configured before sending messages.");
  } else {
    logSuccess("All DVN configurations are correct across all networks!");
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const logFile = initLogFile("dvn-config-verification");

  logSection("DVN Configuration Verification");
  log(`  Started at: ${new Date().toISOString()}`);
  log(`  Log file: ${logFile}`);
  log("");

  log(`  This script verifies DVN configuration consistency:`);
  log(`    - For each network pair (A → B):`);
  log(`      - Query A's sendLib DVN config for messages to B`);
  log(`      - Verify required DVNs: LZ Labs + Canary`);
  log(`      - Verify optional DVNs: Deutsche + Horizen (1 of 2)`);
  log("");

  // Initialize providers
  log("  Initializing providers for all networks...");
  let providers: Record<NetworkName, NetworkProvider>;
  try {
    providers = initializeProviders();
    logSuccess("All providers initialized");
  } catch (error) {
    logError(`Failed to initialize providers: ${error}`);
    log("");
    log("  RPC URLs: .env variables or hardhat.config.ts defaults");
    process.exit(1);
  }

  const contracts = getContractsToCheck();
  log(`  Contracts to verify: ${contracts.map((c) => c.name).join(", ")}`);
  log("");

  const results: DVNCheckResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;

  // Step 1: Verify lib addresses
  await verifyNetworkLibAddresses(providers, contracts);

  // Step 2: Verify DVN configuration
  logSection("Step 2: Verify DVN Configuration");

  for (const contract of contracts) {
    logSubsection(`${contract.name}`);

    for (const sourceNetwork of allNetworks) {
      for (const destNetwork of allNetworks.filter((n) => n !== sourceNetwork)) {
        const result = await verifyDVNConsistency(providers, contract, sourceNetwork, destNetwork);
        results.push(result);

        if (result.valid) {
          logSuccess(
            `${sourceNetwork} → ${destNetwork}: required=${result.requiredCount}, optional=${result.optionalCount}/${result.optionalThreshold} ✓`
          );
          totalPassed++;
        } else {
          logError(`${sourceNetwork} → ${destNetwork}: ${result.error ?? "invalid"} ✗`);
          totalFailed++;
        }
      }
    }
  }

  // Generate summary
  generateDVNReport(results, totalPassed, totalFailed);

  log(`\n  Completed at: ${new Date().toISOString()}`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
