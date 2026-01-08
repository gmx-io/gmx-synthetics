// Verify bidirectional confirmation consistency for all GM/GLV OFTs across all networks
// This prevents "bricked sends" caused by confirmation mismatches between networks
//
// For each network pair (A → B), we verify:
//   - A's sendLib confirmations to B
//   - B's receiveLib confirmations from A
//   - These must match - if they don't, messages get stuck
//
// This script queries actual values from contracts rather than comparing against hardcoded expectations.
//
// Usage:
//   npx ts-node scripts/multichain/verify-lz-deployments/verifyConfirmations.ts
//
// RPC URLs: Uses .env variables if set, otherwise falls back to hardhat.config.ts defaults
// Optional env vars: ARBITRUM_RPC_URL, ETHEREUM_RPC_URL, BASE_RPC_URL, BSC_RPC_URL, BERA_RPC_URL, BOTANIX_RPC_URL
//
// Note: Public RPCs may rate-limit causing transient failures. If you see mismatches,
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
  libAddresses,
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

interface ConfirmationPair {
  sourceNetwork: NetworkName;
  destNetwork: NetworkName;
  contract: string;
  sendConfirmations: number | null;
  receiveConfirmations: number | null;
  match: boolean;
}

// =============================================================================
// Provider Initialization
// =============================================================================

// Default RPCs from hardhat.config.ts
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

  // 1. Try environment variable first
  const envVar = envVarMap[network];
  const envRpcUrl = process.env[envVar];
  if (envRpcUrl) {
    return envRpcUrl;
  }

  // 2. Fall back to hardhat.config.ts defaults
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
    const expectedSendLib = libAddresses[network].sendLib;

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
 * Get confirmation value from UlnConfig
 */
async function getConfirmations(
  endpoint: ethers.Contract,
  oappAddress: string,
  lib: string,
  peerEid: number
): Promise<number | null> {
  try {
    const configHex = await endpoint.getConfig(oappAddress, lib, peerEid, 2);
    const config = decodeDVNConfig(configHex);
    return config ? config.confirmations : null;
  } catch {
    return null;
  }
}

/**
 * Verify bidirectional confirmation consistency for a contract between two networks.
 *
 * The key check: When A sends to B, A's sendLib specifies X confirmations.
 * B's receiveLib should expect exactly X confirmations from A.
 * If they don't match, messages can get stuck ("bricked").
 */
async function verifyConfirmationConsistency(
  providers: Record<NetworkName, NetworkProvider>,
  contract: ContractInfo,
  sourceNetwork: NetworkName,
  destNetwork: NetworkName
): Promise<ConfirmationPair> {
  const sourceEndpoint = providers[sourceNetwork].endpoint;
  const destEndpoint = providers[destNetwork].endpoint;

  const sourceContractAddr = contract.getAddress(sourceNetwork);
  const destContractAddr = contract.getAddress(destNetwork);

  const destEid = networks[destNetwork].eid;
  const sourceEid = networks[sourceNetwork].eid;

  // 1. Query source's sendLib: how many confirmations does source require before sending to dest?
  const sendConfirmations = await getConfirmations(
    sourceEndpoint,
    sourceContractAddr,
    libAddresses[sourceNetwork].sendLib,
    destEid
  );

  // 2. Query dest's receiveLib: how many confirmations does dest expect from source?
  const receiveConfirmations = await getConfirmations(
    destEndpoint,
    destContractAddr,
    libAddresses[destNetwork].receiveLib,
    sourceEid
  );

  // 3. They should match
  const match =
    sendConfirmations !== null && receiveConfirmations !== null && sendConfirmations === receiveConfirmations;

  return {
    sourceNetwork,
    destNetwork,
    contract: contract.name,
    sendConfirmations,
    receiveConfirmations,
    match,
  };
}

// =============================================================================
// Summary Report
// =============================================================================

function generateConfirmationReport(results: ConfirmationPair[], passed: number, failed: number) {
  logSection("CONFIRMATION VERIFICATION SUMMARY");

  log(`  Verification approach:`);
  log(`    For each network pair (A → B), we verify:`);
  log(`      - A's sendLib confirmations to B`);
  log(`      - B's receiveLib confirmations from A`);
  log(`      - These must match to prevent bricked sends`);
  log("");

  log(`  Verification matrix:`);
  log(`    Networks: ${allNetworks.length}`);
  log(`    Contracts: ${getContractsToCheck().length}`);
  log(`    Network pairs: ${allNetworks.length * (allNetworks.length - 1)}`);
  log(`    Total checks: ${results.length}`);
  log("");

  log(`  Results:`);
  log(`    Matched: ${passed}`);
  log(`    Mismatched: ${failed}`);
  log("");

  if (failed > 0) {
    logError("CONFIRMATION MISMATCHES DETECTED!");
    log("");
    log("  Mismatched pairs:");

    for (const result of results.filter((r) => !r.match)) {
      log(`    - ${result.contract}: ${result.sourceNetwork} → ${result.destNetwork}`);
      log(`      ${result.sourceNetwork} sendLib: ${result.sendConfirmations ?? "N/A"} confirmations`);
      log(`      ${result.destNetwork} receiveLib expects: ${result.receiveConfirmations ?? "N/A"} confirmations`);
    }
    log("");
    logWarning("Confirmation mismatches can cause BRICKED SENDS!");
    logWarning("The receiving network must expect the same confirmations that the sender configures.");
  } else {
    logSuccess("All bidirectional confirmation configurations are consistent!");
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const logFile = initLogFile("confirmations-verification");

  logSection("Bidirectional Confirmation Verification");
  log(`  Started at: ${new Date().toISOString()}`);
  log(`  Log file: ${logFile}`);
  log("");

  log(`  This script verifies bidirectional confirmation consistency:`);
  log(`    - For each network pair (A → B):`);
  log(`      - Query A's sendLib confirmations to B`);
  log(`      - Query B's receiveLib confirmations from A`);
  log(`      - Verify they match (prevents bricked sends)`);
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

  const results: ConfirmationPair[] = [];
  let totalMatched = 0;
  let totalMismatched = 0;

  // Step 1: Verify lib addresses
  await verifyNetworkLibAddresses(providers, contracts);

  // Step 2: Verify bidirectional confirmation consistency
  logSection("Step 2: Verify Bidirectional Confirmation Consistency");

  for (const contract of contracts) {
    logSubsection(`${contract.name}`);

    for (const sourceNetwork of allNetworks) {
      for (const destNetwork of allNetworks.filter((n) => n !== sourceNetwork)) {
        const result = await verifyConfirmationConsistency(providers, contract, sourceNetwork, destNetwork);
        results.push(result);

        if (result.match) {
          logSuccess(
            `${sourceNetwork} → ${destNetwork}: send=${result.sendConfirmations}, receive=${result.receiveConfirmations} ✓`
          );
          totalMatched++;
        } else {
          logError(
            `${sourceNetwork} → ${destNetwork}: send=${result.sendConfirmations ?? "N/A"}, receive=${
              result.receiveConfirmations ?? "N/A"
            } ✗ MISMATCH`
          );
          totalMismatched++;
        }
      }
    }
  }

  // Generate summary
  generateConfirmationReport(results, totalMatched, totalMismatched);

  log(`\n  Completed at: ${new Date().toISOString()}`);

  if (totalMismatched > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
