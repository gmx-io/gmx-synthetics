// Verifies OFT contracts on expansion networks (non-Arbitrum / source chains)
//
// Usage:
// npx hardhat run --network ethereum scripts/multichain/verify-lz-deployments/verifyOFTs.ts

import hre from "hardhat";
import { ethers } from "ethers";
import {
  networks,
  allNetworks,
  gmMarkets,
  glvMarkets,
  getGmContract,
  getGlvContract,
  getExpectedOwner,
  NetworkName,
  expansionNetworks,
} from "./addresses";
import {
  initLogFile,
  logSection,
  logSubsection,
  log,
  verifyContractDeployed,
  verifyOwnership,
  verifyPeer,
  verifyDelegate,
  verifyTokenProperties,
  verifyEnforcedOptionsSpokeToHub,
  testQuoteSend,
  generateSummary,
  OFT_ABI,
  LZ_ENDPOINT_ABI,
} from "./utils";

function validateNetwork(network: string): NetworkName {
  if (network === "arbitrum") {
    throw new Error("Arbitrum is the hub network - use verifyAdapters.ts instead");
  }

  if (!expansionNetworks.includes(network as NetworkName)) {
    throw new Error(`Invalid network: ${network}. Valid networks: ${expansionNetworks.join(", ")}`);
  }

  return network as NetworkName;
}

async function verifyGmOft(
  market: string,
  network: NetworkName,
  provider: typeof hre.ethers.provider,
  endpoint: ethers.Contract,
  expectedOwner: string
): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  logSubsection(`GM ${market} OFT`);

  const oftAddress = getGmContract(market, network);

  // Check deployment
  if (await verifyContractDeployed(oftAddress, provider)) {
    passed++;
  } else {
    failed++;
    return { passed, failed };
  }

  const oft = new hre.ethers.Contract(oftAddress, OFT_ABI, provider);

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
    if (peerNetwork === network) continue; // Skip self

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
  provider: typeof hre.ethers.provider,
  endpoint: ethers.Contract,
  expectedOwner: string
): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  logSubsection(`GLV ${market} OFT`);

  const oftAddress = getGlvContract(market, network);

  // Check deployment
  if (await verifyContractDeployed(oftAddress, provider)) {
    passed++;
  } else {
    failed++;
    return { passed, failed };
  }

  const oft = new hre.ethers.Contract(oftAddress, OFT_ABI, provider);

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
    if (peerNetwork === network) continue; // Skip self

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

async function main() {
  const networkArg = hre.network.name;
  const network = validateNetwork(networkArg);

  const logFile = initLogFile(`oft-${network}-verification`);

  logSection(`GMX OFT Verification - ${network.toUpperCase()}`);
  log(`  Started at: ${new Date().toISOString()}`);
  log(`  Log file: ${logFile}`);

  const networkConfig = networks[network];
  const provider = hre.ethers.provider;
  const endpoint = new hre.ethers.Contract(networkConfig.endpoint, LZ_ENDPOINT_ABI, provider);
  const expectedOwner = getExpectedOwner(network);

  log(`  Network: ${network}`);
  log(`  EID: ${networkConfig.eid}`);
  log(`  Expected Owner: ${expectedOwner}`);

  let totalPassed = 0;
  let totalFailed = 0;

  // Verify GM OFTs
  logSection("GM OFT VERIFICATION");

  for (const market of gmMarkets) {
    const result = await verifyGmOft(market, network, provider, endpoint, expectedOwner);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  // Verify GLV OFTs
  logSection("GLV OFT VERIFICATION");

  for (const market of glvMarkets) {
    const result = await verifyGlvOft(market, network, provider, endpoint, expectedOwner);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  // Generate summary
  generateSummary(totalPassed, totalFailed);

  log(`\n  Completed at: ${new Date().toISOString()}`);
  log(`\n  Next steps:`);
  log(`    1. Verify contracts on block explorer for ${network}`);
  log(`    2. Test small cross-chain transfers`);
  log(`    3. Monitor LayerZero Scan for message flow`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
