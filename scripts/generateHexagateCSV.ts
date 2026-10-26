/**
 * Generate Hexagate CSV Import File
 *
 * This script generates a CSV file in Hexagate format containing all deployed contract
 * addresses from mainnet networks (Arbitrum, Avalanche, Botanix, MegaETH).
 *
 * Usage:
 *   TAGS="v2.2" npx hardhat run scripts/generateHexagateCSV.ts
 *   TAGS="v2.2" npx hardhat run scripts/generateHexagateCSV.ts --network arbitrum
 *
 * Output:
 *   - File: out/hexagate/hexagate-import-{network}.csv
 *   - Format: "chainId","address","tags"
 *   - Networks: Arbitrum (42161), Avalanche (43114), Botanix (3637), MegaETH (4326)
 *
 * ⚠️  WARNING:
 * Before generating the CSV, verify that the format matches Hexagate's current import requirements
 * i.e. template header is "chainId","address","tags"
 */

import hre from "hardhat";
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
  megaEth: 4326,
};

const TAGS = process.env.TAGS;

async function main() {
  console.log("Generating Hexagate CSV...");
  console.log(`  Format: "chainId","address","tags"`);
  console.log(`  Tags: ${TAGS || "(none)"}\n`);

  // Read contracts.json
  const contractsJsonPath = path.join(__dirname, "../docs/contracts.json");
  const contractsData: NetworkDeployments = readJsonFile(contractsJsonPath);

  if (!contractsData) {
    throw new Error("contracts.json not found or invalid");
  }

  const outDir = path.join(__dirname, "../out/hexagate");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const networks = hre.network.name !== "hardhat" ? [hre.network.name] : EXISTING_MAINNET_DEPLOYMENTS;

  for (const network of networks) {
    const chainId = NETWORK_CHAIN_IDS[network];
    if (!chainId) {
      throw new Error(`No chain ID found for network ${network}`);
    }

    const contracts = contractsData[network];
    if (!contracts || contracts.length === 0) {
      throw new Error(`No contracts found for ${network}`);
    }

    const rows: string[] = [];
    rows.push('"chainId","address","tags"');

    for (const contract of contracts) {
      const tagValue = TAGS || "";
      rows.push(`"${chainId}","${contract.contractAddress}","${tagValue}"`);
    }

    const filename = `hexagate-import-${network}.csv`;
    fs.writeFileSync(path.join(outDir, filename), rows.join("\n") + "\n", "utf-8");
    console.log(`✅ ${network} (chainId: ${chainId}): ${contracts.length} contracts → out/hexagate/${filename}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
