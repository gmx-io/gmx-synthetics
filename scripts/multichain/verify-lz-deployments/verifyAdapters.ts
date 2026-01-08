// Verifies LayerZero OFTAdapter contracts on Arbitrum (hub network)
//
// Usage:
// npx hardhat run --network arbitrum scripts/multichain/verify-lz-deployments/verifyAdapters.ts

import hre from "hardhat";
import { ethers } from "ethers";
import {
  networks,
  expansionNetworks,
  gmMarkets,
  glvMarkets,
  getGmContract,
  getGlvContract,
  getGmUnderlying,
  getGlvUnderlying,
  libAddressesByNetwork,
  NetworkName,
} from "./addresses";
import {
  initLogFile,
  logSection,
  logSubsection,
  logInfo,
  logSuccess,
  logError,
  log,
  verifyContractDeployed,
  verifyOwnership,
  verifyUnderlyingToken,
  verifyPeer,
  verifyDelegate,
  verifyEnforcedOptionsHubToSpoke,
  testQuoteSend,
  generateSummary,
  OFT_ABI,
  LZ_ENDPOINT_ABI,
  ERC20_ABI,
} from "./utils";

async function verifyAdapterBalance(
  adapterAddress: string,
  underlyingAddress: string,
  provider: typeof hre.ethers.provider,
  market: string,
  tokenType: string
) {
  try {
    const underlying = new hre.ethers.Contract(underlyingAddress, ERC20_ABI, provider);
    const balance = await underlying.balanceOf(adapterAddress);
    logInfo(`${market} ${tokenType} adapter balance: ${hre.ethers.utils.formatEther(balance)}`);
  } catch (error) {
    logError(`Failed to check adapter balance: ${error}`);
  }
}

async function verifyDvnConfigExists(
  endpoint: ethers.Contract,
  adapterAddress: string,
  network: NetworkName
): Promise<boolean> {
  try {
    const eid = networks[network].eid;
    const dvnConfig = await endpoint.getConfig(adapterAddress, libAddressesByNetwork.arbitrum.sendLib, eid, 2);

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

async function verifyGmAdapter(
  market: string,
  provider: typeof hre.ethers.provider,
  endpoint: ethers.Contract,
  expectedOwner: string
): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  logSubsection(`GM ${market} Adapter`);

  const adapterAddress = getGmContract(market, "arbitrum");
  const underlyingAddress = getGmUnderlying(market);

  // Check deployment
  if (await verifyContractDeployed(adapterAddress, provider)) {
    passed++;
  } else {
    failed++;
    return { passed, failed };
  }

  const adapter = new hre.ethers.Contract(adapterAddress, OFT_ABI, provider);

  // Check underlying token
  if (await verifyUnderlyingToken(adapter, underlyingAddress)) {
    passed++;
  } else {
    failed++;
  }

  // Check adapter balance
  await verifyAdapterBalance(adapterAddress, underlyingAddress, provider, market, "GM");

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
    if (await verifyDvnConfigExists(endpoint, adapterAddress, network)) {
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
  provider: typeof hre.ethers.provider,
  endpoint: ethers.Contract,
  expectedOwner: string
): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  logSubsection(`GLV ${market} Adapter`);

  const adapterAddress = getGlvContract(market, "arbitrum");
  const underlyingAddress = getGlvUnderlying(market);

  // Check deployment
  if (await verifyContractDeployed(adapterAddress, provider)) {
    passed++;
  } else {
    failed++;
    return { passed, failed };
  }

  const adapter = new hre.ethers.Contract(adapterAddress, OFT_ABI, provider);

  // Check underlying token
  if (await verifyUnderlyingToken(adapter, underlyingAddress)) {
    passed++;
  } else {
    failed++;
  }

  // Check adapter balance
  await verifyAdapterBalance(adapterAddress, underlyingAddress, provider, market, "GLV");

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
    if (await verifyDvnConfigExists(endpoint, adapterAddress, network)) {
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

async function main() {
  const logFile = initLogFile("adapters-verification");

  logSection("GMX OFTAdapter Verification (Arbitrum Hub)");
  log(`  Started at: ${new Date().toISOString()}`);
  log(`  Log file: ${logFile}`);

  const arbConfig = networks.arbitrum;
  const provider = hre.ethers.provider;
  const endpoint = new hre.ethers.Contract(arbConfig.endpoint, LZ_ENDPOINT_ABI, provider);
  const expectedOwner = arbConfig.owner;

  let totalPassed = 0;
  let totalFailed = 0;

  // Verify GM Adapters
  logSection("GM ADAPTER VERIFICATION");

  for (const market of gmMarkets) {
    const result = await verifyGmAdapter(market, provider, endpoint, expectedOwner);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  // Verify GLV Adapters
  logSection("GLV ADAPTER VERIFICATION");

  for (const market of glvMarkets) {
    const result = await verifyGlvAdapter(market, provider, endpoint, expectedOwner);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  // Generate summary
  generateSummary(totalPassed, totalFailed);

  log(`\n  Completed at: ${new Date().toISOString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
