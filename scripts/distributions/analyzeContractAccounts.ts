import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import hre from "hardhat";

/*
Usage:
npx hardhat --network arbitrum run scripts/distributions/analyzeContractAccounts.ts

Environment variables:
- SAMPLE_SIZE: Number of accounts to analyze (default: analyze all)
  Example: SAMPLE_SIZE=5 npx hardhat --network arbitrum run scripts/distributions/analyzeContractAccounts.ts

This script analyzes the CONTRACT CSV files to identify which ones are smart wallets
*/

// Safe (Gnosis Safe) wallet interface
const SAFE_ABI = [
  "function getOwners() public view returns (address[])",
  "function getThreshold() public view returns (uint256)",
];

// EIP-1967 slots for upgradeable contracts
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"; // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"; // bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1)

interface AccountInfo {
  account: string;
  distributionUsd: string;
  isSmartWallet?: boolean;
  walletType?: string;
  implementation?: string;
}

async function main() {
  const provider = hre.ethers.provider;
  const sampleSize = process.env.SAMPLE_SIZE ? parseInt(process.env.SAMPLE_SIZE) : undefined;

  // Initialize report content
  let reportContent = "# Smart Wallet Analysis Report\n\n";
  reportContent += `Generated on: ${new Date().toISOString()}\n\n`;

  // Process both CSV files
  const csvFiles = [
    path.join(__dirname, "data/sample-for-CONTRACT.csv"),
    // path.join(__dirname, "data/GLP_USDC-for-CONTRACT.csv"),
  ];

  for (const csvFile of csvFiles) {
    console.log("\n========================================");
    console.log("Analyzing:", path.basename(csvFile));
    console.log("========================================\n");

    reportContent += `## Analysis ${path.basename(csvFile)}\n\n`;

    const allAccounts = parseCSV(csvFile);
    const accounts = sampleSize ? allAccounts.slice(0, sampleSize) : allAccounts;

    if (sampleSize) {
      console.log(
        `Analyzing first ${accounts.length} of ${allAccounts.length} contract accounts (SAMPLE_SIZE=${sampleSize})\n`
      );
      reportContent += `Analyzing first ${accounts.length} of ${allAccounts.length} contract accounts (SAMPLE_SIZE=${sampleSize})\n\n`;
    } else {
      console.log(`Analyzing all ${accounts.length} contract accounts\n`);
      reportContent += `Analyzing all ${accounts.length} contract accounts\n\n`;
    }

    // Analyze each account
    const smartWallets: AccountInfo[] = [];
    const otherContracts: AccountInfo[] = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      process.stdout.write(`\rAnalyzing ${i + 1}/${accounts.length}...`);

      try {
        const walletInfo = await identifyContractType(account.account, provider);

        if (walletInfo.isSmartWallet) {
          account.isSmartWallet = true;
          account.walletType = walletInfo.walletType;
          account.implementation = walletInfo.implementation;
          smartWallets.push(account);
        } else {
          account.implementation = walletInfo.implementation;
          otherContracts.push(account);
        }
      } catch (error) {
        // If analysis fails, assume it's a regular contract
        otherContracts.push(account);
      }

      // Small delay to avoid rate limiting
      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log("\n"); // Clear the progress line

    // Generate report content
    reportContent += `### Smart Wallets Identified\n\n`;

    // Summary by wallet type
    const walletTypes: Record<string, number> = {};
    for (const wallet of smartWallets) {
      const type = wallet.walletType || "Unknown";
      walletTypes[type] = (walletTypes[type] || 0) + 1;
    }

    // Build breakdown string
    let breakdownStr = "";
    if (Object.keys(walletTypes).length > 0) {
      const typeBreakdown = Object.entries(walletTypes)
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ");
      breakdownStr = ` (${typeBreakdown})`;
    }

    reportContent += `**Total:** ${smartWallets.length} out of ${accounts.length} contracts${breakdownStr}\n\n`;

    if (smartWallets.length > 0) {
      reportContent += `| Address | Type | Implementation | Distribution USD |\n`;
      reportContent += `|---------|------|----------------|------------------|\n`;

      for (const wallet of smartWallets) {
        const type = wallet.walletType || "-";
        const implementation = wallet.implementation || "-";
        const usd = parseFloat(wallet.distributionUsd || "0").toFixed(2);
        reportContent += `| ${wallet.account} | ${type} | ${implementation} | $${usd} |\n`;
      }
      reportContent += `\n`;
    }

    // Add regular contracts section
    reportContent += `### Regular Contracts (Not Smart Wallets)\n\n`;
    reportContent += `**Total:** ${otherContracts.length} out of ${accounts.length} contracts\n\n`;

    if (otherContracts.length > 0) {
      reportContent += `| Address | Type | Implementation | Distribution USD |\n`;
      reportContent += `|---------|------|----------------|------------------|\n`;

      for (const contract of otherContracts) {
        const type = "-"; // Not a smart wallet, so no type
        const implementation = contract.implementation || "-";
        const usd = parseFloat(contract.distributionUsd || "0").toFixed(2);
        reportContent += `| ${contract.account} | ${type} | ${implementation} | $${usd} |\n`;
      }
      reportContent += `\n`;
    }

    if (sampleSize && allAccounts.length > accounts.length) {
      reportContent += `**NOTE:** This is a sample analysis of the first ${sampleSize} accounts only.\n`;
      reportContent += `- Total accounts in file: ${allAccounts.length}\n`;
      reportContent += `- To analyze all accounts, run without SAMPLE_SIZE environment variable\n\n`;
    }
  }

  // Write report to file
  const reportPath = path.join(__dirname, "REPORT.md");
  fs.writeFileSync(reportPath, reportContent);
  console.log(`Report written to: ${reportPath}`);
}

function parseCSV(filepath: string): AccountInfo[] {
  const content = fs.readFileSync(filepath, "utf-8");
  const lines = content.split("\n");
  const headers = lines[0].split(",");

  const accounts: AccountInfo[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(",");

    // csv columns format: account,ethGlv,btcGlv,usdc,distributionUsd,duneEstimatedDistributionUsd
    const accountIndex = headers.indexOf("account");
    const distributionUsdIndex =
      headers.indexOf("distributionUsd") !== -1
        ? headers.indexOf("distributionUsd")
        : headers.indexOf("approximate_distribution_usd");

    if (accountIndex >= 0 && values[accountIndex]) {
      accounts.push({
        account: values[accountIndex],
        distributionUsd: values[distributionUsdIndex] || "0",
      });
    }
  }

  return accounts;
}

async function identifyContractType(
  address: string,
  provider: ethers.providers.Provider
): Promise<{ isSmartWallet: boolean; walletType?: string; implementation?: string }> {
  // Check for Safe wallet first (most reliable)
  try {
    const safe = new ethers.Contract(address, SAFE_ABI, provider);
    const [owners, threshold] = await Promise.all([
      safe.getOwners().catch(() => null),
      safe.getThreshold().catch(() => null),
    ]);

    if (owners !== null && threshold !== null && Array.isArray(owners) && owners.length > 0) {
      return { isSmartWallet: true, walletType: "Safe" };
    }
  } catch {
    // Not a Safe
  }

  // Check for proxy implementation (might be upgradeable smart wallet)
  let proxyImplementation: string | undefined;

  // Check standard implementation slot
  try {
    const implSlot = await provider.getStorageAt(address, IMPLEMENTATION_SLOT);
    if (implSlot !== ethers.constants.HashZero) {
      const implementation = ethers.utils.getAddress("0x" + implSlot.slice(-40));
      proxyImplementation = implementation;

      // Check if the implementation is a smart wallet
      const isSmartWallet = await hasEIP1271(implementation, provider);

      if (isSmartWallet) {
        return {
          isSmartWallet: true,
          walletType: "EIP-1271-proxy",
          implementation,
        };
      }
    }
  } catch {
    // Ignore if implementation slot detection fails
  }

  // Check beacon slot if no implementation found
  if (!proxyImplementation) {
    try {
      const beaconSlot = await provider.getStorageAt(address, BEACON_SLOT);
      if (beaconSlot !== ethers.constants.HashZero) {
        const beaconAddress = ethers.utils.getAddress("0x" + beaconSlot.slice(-40));

        try {
          const beaconContract = new ethers.Contract(
            beaconAddress,
            ["function implementation() view returns (address)"],
            provider
          );
          const implementation = await beaconContract.implementation();
          proxyImplementation = implementation;

          // Check if the implementation is a smart wallet
          const isSmartWallet = await hasEIP1271(implementation, provider);

          if (isSmartWallet) {
            return {
              isSmartWallet: true,
              walletType: "EIP-1271-beacon",
              implementation,
            };
          }
        } catch (error) {
          console.log(`Failed to get implementation from beacon at ${beaconAddress}`);
        }
      }
    } catch {
      // Ignore if beacon slot detection fails
    }
  }

  // Finally, check for generic EIP-1271 support
  const hasEIP1271Support = await hasEIP1271(address, provider);
  if (hasEIP1271Support) {
    return { isSmartWallet: true, walletType: "EIP-1271", implementation: proxyImplementation };
  }

  // Not a smart wallet
  return { isSmartWallet: false, implementation: proxyImplementation };
}

async function hasEIP1271(address: string, provider: ethers.providers.Provider): Promise<boolean> {
  const EIP1271_ABI = [
    "function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4)",
    "function isValidSignature(bytes memory data, bytes memory signature) external view returns (bytes4)", // legacy version
  ];

  try {
    // Primary method: Try to call the functions directly
    // This is more reliable than bytecode inspection
    const contract = new ethers.Contract(address, EIP1271_ABI, provider);

    // Try current version with dummy parameters
    try {
      const dummyHash = ethers.utils.keccak256("0x00");
      const dummySignature = "0x00";
      await contract.callStatic["isValidSignature(bytes32,bytes)"](dummyHash, dummySignature);
      return true; // Function exists and executed (even if it returned invalid)
    } catch (error: any) {
      // Check if the error is because the function reverted (meaning it exists)
      // vs the function not existing at all
      if (error.data && error.data !== "0x") {
        // There's return data, which means the function exists but reverted
        return true;
      }
      // If error.error exists and contains revert info, function exists
      if (error.error && error.error.data && error.error.data !== "0x") {
        return true;
      }
    }

    // Try legacy version with dummy parameters
    try {
      const dummyData = "0x00";
      const dummySignature = "0x00";
      await contract.callStatic["isValidSignature(bytes,bytes)"](dummyData, dummySignature);
      return true; // Function exists and executed
    } catch (error: any) {
      // Check if the error is because the function reverted (meaning it exists)
      // vs the function not existing at all
      if (error.data && error.data !== "0x") {
        // There's return data, which means the function exists but reverted
        return true;
      }
      // If error.error exists and contains revert info, function exists
      if (error.error && error.error.data && error.error.data !== "0x") {
        return true;
      }
    }

    // Neither function is callable - not EIP-1271 compliant
    return false;
  } catch (error) {
    console.error(`Error checking EIP-1271 for ${address}:`, error);
    return false;
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log("\n\nAnalysis complete!");
      process.exit(0);
    })
    .catch((ex) => {
      console.error(ex);
      process.exit(1);
    });
}
