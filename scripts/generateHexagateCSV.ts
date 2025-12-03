/**
 * Generate Hexagate CSV Import File
 *
 * This script generates a CSV file in Hexagate format containing all deployed contract
 * addresses from mainnet networks (Arbitrum, Avalanche, Botanix).
 *
 * Usage:
 *   TAGS="v2.2" npx hardhat run scripts/generateHexagateCSV.ts
 *
 * Output:
 *   - File: docs/hexagate-import-address.csv
 *   - Format: "chainId","address","tags"
 *   - Networks: Arbitrum (42161), Avalanche (43114), Botanix (3637)
 *
 * ⚠️  WARNING:
 * Before generating the CSV, verify that the format matches Hexagate's current import requirements
 * i.e. template header is "chainId","address","tags"
 */

import { readJsonFile } from "../utils/file";
import { EXISTING_MAINNET_DEPLOYMENTS } from "../config/chains";
import path from "path";
import fs from "fs";

interface Deployment {
  contractAddress: string;
  contractName: string;
  txHash: string;
}

interface NetworkDeployments {
  [network: string]: Deployment[];
}

// Chain IDs for mainnet networks
const NETWORK_CHAIN_IDS = {
  arbitrum: 42161,
  avalanche: 43114,
  botanix: 3637,
};

const TAGS = process.env.TAGS;

async function main() {
  console.log("Generating Hexagate CSV...");
  console.log(`  Format: "chainId","address","tags"\n`);

  // Read contracts.json
  const contractsJsonPath = path.join(__dirname, "../docs/contracts.json");
  const contractsData: NetworkDeployments = readJsonFile(contractsJsonPath);

  if (!contractsData) {
    throw new Error("contracts.json not found or invalid");
  }

  // Build CSV rows
  const rows: string[] = [];
  rows.push('"chainId","address","tags"'); // Header

  let totalContracts = 0;

  for (const network of EXISTING_MAINNET_DEPLOYMENTS) {
    const chainId = NETWORK_CHAIN_IDS[network];
    if (!chainId) {
      throw new Error(`No chain ID found for network ${network}`);
    }

    const contracts = contractsData[network];
    if (!contracts || contracts.length === 0) {
      throw new Error(`No contracts found for ${network}`);
    }

    for (const contract of contracts) {
      const address = contract.contractAddress;
      const tagValue = TAGS || "";
      rows.push(`"${chainId}","${address}","${tagValue}"`);
      totalContracts++;
    }

    console.log(`✅ Added ${contracts.length} contracts from ${network} (chainId: ${chainId})`);
  }

  // Write to file
  const outputPath = path.join(__dirname, "../docs/hexagate-import-address.csv");
  const csvContent = rows.join("\n") + "\n";
  fs.writeFileSync(outputPath, csvContent, "utf-8");

  console.log(`\nSuccessfully generated hexagate-import-address.csv`);
  console.log(`   Total contracts: ${totalContracts}`);
  console.log(`   Tags: ${TAGS || "(none)"}`);
  console.log(`   Output: docs/hexagate-import-address.csv\n`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
