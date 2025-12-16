// Verify DVN configuration for all GM / GLV contracts
// Queries Arbitrum LZ endpoint for DVN configs (hub → spoke direction)
//
// Usage:
// npx hardhat run --network arbitrum scripts/multichain/verify-lz-deployments/verifyDvnConfigs.ts

import hre from "hardhat";
import { ethers } from "ethers";
import {
  networks,
  expansionNetworks,
  gmMarkets,
  glvMarkets,
  getGmContract,
  getGlvContract,
  sendLib,
  dvnAddresses,
  NetworkName,
} from "./addresses";
import {
  initLogFile,
  logSection,
  logSubsection,
  logSuccess,
  logError,
  log,
  decodeDVNConfig,
  validateDVNConfig,
  LZ_ENDPOINT_ABI,
} from "./utils";

interface ContractInfo {
  name: string;
  address: string;
  type: "GM" | "GLV";
}

function getContractsToCheck(): ContractInfo[] {
  const contracts: ContractInfo[] = [];

  for (const market of gmMarkets) {
    contracts.push({
      name: `GM ${market}`,
      address: getGmContract(market, "arbitrum"),
      type: "GM",
    });
  }

  for (const market of glvMarkets) {
    contracts.push({
      name: `GLV ${market}`,
      address: getGlvContract(market, "arbitrum"),
      type: "GLV",
    });
  }

  return contracts;
}

async function checkDvnConfigForContract(
  endpoint: ethers.Contract,
  contractInfo: ContractInfo,
  destNetwork: NetworkName
): Promise<boolean> {
  try {
    const eid = networks[destNetwork].eid;
    const configHex = await endpoint.getConfig(contractInfo.address, sendLib, eid, 2);

    const config = decodeDVNConfig(configHex);
    if (!config) {
      logError(`Failed to decode DVN config for ${destNetwork}`);
      return false;
    }

    return validateDVNConfig(config, `${destNetwork} (${contractInfo.name})`);
  } catch (error) {
    logError(`Failed to get DVN config for ${destNetwork}: ${error}`);
    return false;
  }
}

async function main() {
  const logFile = initLogFile("dvn-config-verification");

  logSection("Enhanced DVN Configuration Verification");
  log(`  Started at: ${new Date().toISOString()}`);
  log(`  Log file: ${logFile}`);
  log("");

  const arbConfig = networks.arbitrum;
  const provider = hre.ethers.provider;
  const endpoint = new hre.ethers.Contract(arbConfig.endpoint, LZ_ENDPOINT_ABI, provider);

  log(`  Checking DVN configurations for:`);
  const contracts = getContractsToCheck();
  for (const contract of contracts) {
    log(`    ${contract.name}: ${contract.address}`);
  }
  log("");

  log(`  Expected configuration:`);
  log(`    Required: LayerZero Labs + Canary (both must verify)`);
  log(`    Optional: Deutsche Telekom + Horizen (1 of 2 must verify)`);
  log("");

  log(`  DVN Addresses:`);
  log(`    LayerZero Labs: ${dvnAddresses.layerzero}`);
  log(`    Canary: ${dvnAddresses.canary}`);
  log(`    Deutsche Telekom: ${dvnAddresses.deutsche}`);
  log(`    Horizen: ${dvnAddresses.horizen}`);

  let overallSuccess = true;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const contract of contracts) {
    logSection(`${contract.name} (${contract.address})`);

    for (const destNetwork of expansionNetworks) {
      logSubsection(`${destNetwork} (EID: ${networks[destNetwork].eid})`);

      const success = await checkDvnConfigForContract(endpoint, contract, destNetwork);
      if (success) {
        totalPassed++;
      } else {
        totalFailed++;
        overallSuccess = false;
      }
    }
  }

  logSection("FINAL SUMMARY");

  log(`  Expected DVN Configuration:`);
  log(`    Required DVNs (both must verify):`);
  log(`      - LayerZero Labs: ${dvnAddresses.layerzero}`);
  log(`      - Canary: ${dvnAddresses.canary}`);
  log(`    Optional DVNs (1 of 2 must verify):`);
  log(`      - Deutsche Telekom: ${dvnAddresses.deutsche}`);
  log(`      - Horizen: ${dvnAddresses.horizen}`);
  log("");

  log(`  Contracts checked:`);
  for (const contract of contracts) {
    log(`    - ${contract.name}: ${contract.address}`);
  }
  log(`  Networks checked: ${expansionNetworks.join(", ")}`);
  log("");

  log(`  Results:`);
  log(`    Passed: ${totalPassed}`);
  log(`    Failed: ${totalFailed}`);
  log("");

  if (overallSuccess) {
    logSuccess("All contracts on all networks have CORRECT DVN configurations!");
  } else {
    logError("Some contracts/networks have INCORRECT DVN configurations!");
    log("  Please review the detailed output above and fix any issues.");
  }

  log("");
  log(`  This script verifies:`);
  log(`    - DVN addresses for ${gmMarkets.length} GM tokens + ${glvMarkets.length} GLV tokens`);
  log(`    - Required vs optional grouping`);
  log(`    - Threshold settings for optional DVNs`);

  log(`\n  Completed at: ${new Date().toISOString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
