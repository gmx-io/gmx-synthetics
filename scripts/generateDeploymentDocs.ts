import { readJsonFile } from "../utils/file";
import { getBlockExplorerUrl } from "../hardhat.config";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

interface Deployment {
  contractAddress: string;
  contractName: string;
  txHash?: string;
  blockNumber?: number;
}

interface NetworkDeployments {
  [network: string]: Deployment[];
}

// Networks here must be in sync with getBlockExplorerUrl() from hardhat.config.ts
const NETWORK_INFO = {
  arbitrum: { type: "mainnet", chainId: 42161, name: "Arbitrum One" },
  avalanche: { type: "mainnet", chainId: 43114, name: "Avalanche C-Chain" },
  botanix: { type: "mainnet", chainId: 3637, name: "Botanix" },
  arbitrumSepolia: { type: "testnet", chainId: 421614, name: "Arbitrum Sepolia" },
  avalancheFuji: { type: "testnet", chainId: 43113, name: "Avalanche Fuji" },
};

// All networks to document (derived from NETWORK_INFO)
const ALL_NETWORKS = Object.keys(NETWORK_INFO);

async function collectDeployments(): Promise<NetworkDeployments> {
  const deployments: NetworkDeployments = {};

  for (const network of ALL_NETWORKS) {
    const networkInfo: Deployment[] = [];
    const dir = path.join(__dirname, `../deployments/${network}/`);

    // Check if network deployment directory exists
    if (!fs.existsSync(dir)) {
      console.log(`No deployments found for ${network}`);
      deployments[network] = [];
      continue;
    }

    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".json") || file === ".migrations.json") {
        continue;
      }

      const json = readJsonFile(path.join(dir, file));
      if (!json || !json.address) {
        continue;
      }

      networkInfo.push({
        contractName: file.substring(0, file.length - 5),
        contractAddress: json.address,
        txHash: json.transactionHash,
        blockNumber: json.receipt?.blockNumber,
      });
    }

    // Sort by contract name for consistent output
    networkInfo.sort((a, b) => a.contractName.localeCompare(b.contractName));
    deployments[network] = networkInfo;
  }

  return deployments;
}

function generateMarkdownTable(deployments: Deployment[], network: string): string {
  if (!deployments || deployments.length === 0) {
    return "No deployments found.\n";
  }

  let markdown = "| Name | Address | Link |\n";
  markdown += "|------|---------|------|\n";

  for (const deployment of deployments) {
    const baseUrl = getBlockExplorerUrl(network);
    const explorerUrl = `${baseUrl}/address/${deployment.contractAddress}`;
    const explorerLink = `[View on Explorer](${explorerUrl})`;

    markdown += `| ${deployment.contractName} | \`${deployment.contractAddress}\` | ${explorerLink} |\n`;
  }

  return markdown;
}

function getNetworkLastUpdated(network: string, forceCurrentTime = false): string {
  // If forced to use current time (for manual runs with changes), show current timestamp
  if (forceCurrentTime) {
    return new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  }
  // Use git history to show actual deployment time
  const dir = `deployments/${network}/`;
  const absoluteDir = path.join(__dirname, "..", dir);

  if (!fs.existsSync(absoluteDir)) {
    return "Never";
  }

  try {
    // Use git to get the last commit date for any JSON file in this network's deployment directory
    // Exclude .migrations.json from the search using git's pathspec syntax
    const gitCommand = `git log -1 --format="%ai" -- "${dir}*.json" ":(exclude)${dir}.migrations.json" 2>/dev/null`;
    const result = execSync(gitCommand, { encoding: "utf-8", cwd: path.join(__dirname, "..") }).trim();

    if (!result) {
      return "Never";
    }

    // Parse the git date format (e.g., "2025-07-22 12:07:17 +0300")
    const gitDate = new Date(result);

    if (isNaN(gitDate.getTime())) {
      return "Unknown";
    }

    return gitDate.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch (error) {
    return "Unknown";
  }
}

function generateNetworkMarkdown(network: string, deployments: Deployment[], forceCurrentTime = false): string {
  const info = NETWORK_INFO[network];
  const lastUpdated = getNetworkLastUpdated(network, forceCurrentTime);

  let markdown = `# ${info.name} Deployments\n\n`;
  markdown += `**Network Type:** ${info.type === "mainnet" ? "Mainnet" : "Testnet"}  \n`;
  markdown += `**Chain ID:** ${info.chainId}  \n`;
  markdown += `**Total Contracts:** ${deployments.length}  \n`;
  markdown += `**Last Updated:** ${lastUpdated}\n\n`;

  markdown += "## Deployed Contracts\n\n";
  markdown += generateMarkdownTable(deployments, network);

  return markdown;
}

function generateSummarySection(
  deployments: NetworkDeployments,
  forNetworksTimestamp: Set<string> = new Set()
): string {
  let markdown = `\n## Deployments\n\n`;

  // Add timestamp explanation
  markdown += `*Note: The "Last Updated" timestamp shows when deployment artifacts were committed to git, not the actual on-chain deployment timestamps.*\n\n`;

  // Mainnet section
  markdown += "### Mainnet\n\n";
  markdown += "| Network | Contracts | Documentation | Last Updated |\n";
  markdown += "|---------|-----------|---------------|-------------|\n";

  for (const network of ALL_NETWORKS) {
    const info = NETWORK_INFO[network];
    if (info.type === "mainnet") {
      const count = deployments[network]?.length || 0;
      const forceCurrentTime = forNetworksTimestamp.has(network);
      const lastUpdated = getNetworkLastUpdated(network, forceCurrentTime);
      markdown += `| ${info.name} | ${count} | [View](./${network}-deployments.md) | ${lastUpdated} |\n`;
    }
  }

  // Testnet section
  markdown += "\n### Testnet\n\n";
  markdown += "| Network | Contracts | Documentation | Last Updated |\n";
  markdown += "|---------|-----------|---------------|-------------|\n";

  for (const network of ALL_NETWORKS) {
    const info = NETWORK_INFO[network];
    if (info.type === "testnet") {
      const count = deployments[network]?.length || 0;
      const forceCurrentTime = forNetworksTimestamp.has(network);
      const lastUpdated = getNetworkLastUpdated(network, forceCurrentTime);
      markdown += `| ${info.name} | ${count} | [View](./${network}-deployments.md) | ${lastUpdated} |\n`;
    }
  }

  return markdown;
}

function hasNetworkChanged(network: string, currentDeployments: Deployment[]): boolean {
  const docsDir = path.join(__dirname, "../docs");
  const existingDocPath = path.join(docsDir, `${network}-deployments.md`);

  if (!fs.existsSync(existingDocPath)) {
    return true; // New network, consider it changed
  }

  try {
    const existingDoc = fs.readFileSync(existingDocPath, "utf-8");

    // Extract contract count from existing doc
    const countMatch = existingDoc.match(/\*\*Total Contracts:\*\* (\d+)/);
    const existingCount = countMatch ? parseInt(countMatch[1]) : 0;

    if (existingCount !== currentDeployments.length) {
      return true; // Contract count changed
    }

    // Check if any contract addresses have changed by looking for the contract name and address
    for (const deployment of currentDeployments) {
      const contractLine = `| ${deployment.contractName} | \`${deployment.contractAddress}\` |`;
      if (!existingDoc.includes(contractLine)) {
        return true; // Address changed or contract is new
      }
    }

    return false; // No changes detected
  } catch (error) {
    return true; // Error reading existing file, consider it changed
  }
}

export async function generateDeploymentDocs(forNetworks?: string[]) {
  // If specific networks are provided, only update those + README
  // e.g. npx hardhat generate-deployment-docs --networks arbitrum
  //      npx hardhat generate-deployment-docs --networks arbitrum,avalanche
  // Otherwise, update all networks (for manual runs)
  const networksToUpdate = forNetworks && forNetworks.length > 0 ? forNetworks : ALL_NETWORKS;
  console.log("Collecting deployments for:", networksToUpdate.join(", "));

  const deployments = await collectDeployments();

  // Ensure docs directory exists
  const docsDir = path.join(__dirname, "../docs");

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir);
  }

  // Always detect which networks actually have changes
  const forNetworksTimestamp = new Set<string>();

  // Check each network for actual changes
  for (const network of networksToUpdate) {
    if (hasNetworkChanged(network, deployments[network] || [])) {
      forNetworksTimestamp.add(network);
    }
  }

  // Generate individual network markdown files directly in docs
  for (const network of networksToUpdate) {
    const networkDeployments = deployments[network] || [];
    const hasChanges = forNetworksTimestamp.has(network);
    const markdown = generateNetworkMarkdown(network, networkDeployments, hasChanges);
    const outputPath = path.join(docsDir, `${network}-deployments.md`);

    fs.writeFileSync(outputPath, markdown);
    if (hasChanges) {
      console.log(`Updated deployment docs for ${network} (${networkDeployments.length} contracts)`);
    } else {
      console.log(`No deployment updates for ${network}`);
    }
  }

  // Generate complete README content from template
  const readmePath = path.join(docsDir, "README.md");

  let readmeContent = "# GMX Synthetics Documentation\n\n";
  readmeContent +=
    "This directory contains automatically generated deployment documentation for GMX Synthetics contracts across all supported networks.\n\n";
  readmeContent += "## Automatic Updates\n\n";
  readmeContent += "The deployment documentation is automatically updated when:\n";
  readmeContent +=
    "1. **On commit** - When deployment files change, the post-commit hook selectively updates only the affected network documentation and this README\n";
  readmeContent +=
    "2. **Manual update** - Run `npx hardhat generate-deployment-docs` to regenerate all network documentation files. Use the `--networks <network1,network2>` flag to update specific networks only. Manual runs only update docs for networks with actual deployment changes\n\n";
  readmeContent +=
    "The documentation is generated from the deployment artifacts in `/deployments/` and is kept in sync automatically through git hooks.\n";

  // Add deployment summary section to README
  const summarySection = generateSummarySection(deployments, forNetworksTimestamp);
  readmeContent = readmeContent.trimEnd() + "\n" + summarySection;

  fs.writeFileSync(readmePath, readmeContent);

  if (forNetworksTimestamp.size > 0) {
    console.log(`\nDocumentation updated successfully for: ${Array.from(forNetworksTimestamp).join(", ")}`);
    console.log(`Summary updated in docs/README.md`);
  }
}

// Run if called directly
if (require.main === module) {
  generateDeploymentDocs().catch(console.error);
}
