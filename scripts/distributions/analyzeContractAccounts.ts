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

// EIP-1967 slots for upgradeable contracts
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"; // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"; // bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1)

interface AccountInfo {
  account: string;
  ethGlv?: string;
  btcGlv?: string;
  usdc?: string;
  distributionUsd: string;
  duneEstimatedDistributionUsd?: string;
  status?: string;
  isSmartContractWallet?: string;
  isDolomite?: string;
  implementation?: string;
}

async function main() {
  const provider = hre.ethers.provider;
  const sampleSize = process.env.SAMPLE_SIZE ? parseInt(process.env.SAMPLE_SIZE) : undefined;

  // Initialize report content
  let reportContent = "# Smart Wallet Analysis Report\n\n";
  reportContent += `Generated on: ${new Date().toISOString()}\n\n`;

  // Process both CSV files
  const csvFiles = [path.join(__dirname, "data/distributions.csv")];

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
        const result = await identifyContractType(account.account, provider);

        // Check if contract has DOLOMITE_MARGIN function
        const hasDolomite = await hasDolomiteMargin(account.account, provider);
        account.isDolomite = hasDolomite ? "yes" : "no";
        account.implementation = result.implementation;

        if (result.isSmartWallet) {
          account.isSmartContractWallet = "yes";
          smartWallets.push(account);
        } else {
          account.isSmartContractWallet = "no";
          otherContracts.push(account);
        }
      } catch (error) {
        // If analysis fails, assume it's a regular contract
        account.isSmartContractWallet = "no";
        account.isDolomite = "no";
        otherContracts.push(account);
      }

      // Small delay to avoid rate limiting
      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log("\n"); // Clear the progress line

    // Generate report content
    reportContent += `### Analysis Results\n\n`;

    reportContent += `**Smart Wallets:** ${smartWallets.length} out of ${accounts.length} contracts\n`;
    reportContent += `**Regular Contracts:** ${otherContracts.length} out of ${accounts.length} contracts\n\n`;

    // Smart Wallets table
    if (smartWallets.length > 0) {
      reportContent += `### Smart Wallets\n\n`;
      reportContent += `| Address | Implementation | Distribution USD | isSmartContractWallet | isDolomite |\n`;
      reportContent += `|---------|----------------|------------------|----------------------|------------|\n`;

      for (const account of smartWallets) {
        const implementation = account.implementation || "-";
        const usd = parseFloat(account.distributionUsd || "0").toFixed(2);
        const isSmartContractWallet = "yes";
        const isDolomite = account.isDolomite || "-";
        reportContent += `| ${account.account} | ${implementation} | $${usd} | ${isSmartContractWallet} | ${isDolomite} |\n`;
      }
      reportContent += `\n`;
    }

    // Regular Contracts table
    if (otherContracts.length > 0) {
      reportContent += `### Regular Contracts\n\n`;
      reportContent += `| Address | Implementation | Distribution USD | isSmartContractWallet | isDolomite |\n`;
      reportContent += `|---------|----------------|------------------|----------------------|------------|\n`;

      for (const account of otherContracts) {
        const implementation = account.implementation || "-";
        const usd = parseFloat(account.distributionUsd || "0").toFixed(2);
        const isSmartContractWallet = "no";
        const isDolomite = account.isDolomite || "-";
        reportContent += `| ${account.account} | ${implementation} | $${usd} | ${isSmartContractWallet} | ${isDolomite} |\n`;
      }
      reportContent += `\n`;
    }

    if (sampleSize && allAccounts.length > accounts.length) {
      reportContent += `**NOTE:** This is a sample analysis of the first ${sampleSize} accounts only.\n`;
      reportContent += `- Total accounts in file: ${allAccounts.length}\n`;
      reportContent += `- To analyze all accounts, run without SAMPLE_SIZE environment variable\n\n`;
    }

    // Generate output CSV with same format as input but with analyzed columns
    const outputCsvPath = csvFile.replace(".csv", "-analyzed.csv");
    const csvContent = generateOutputCSV(accounts);
    fs.writeFileSync(outputCsvPath, csvContent);
    console.log(`Analyzed CSV written to: ${outputCsvPath}`);
  }

  // Write report to file
  const reportPath = path.join(__dirname, "REPORT.md");
  fs.writeFileSync(reportPath, reportContent);
  console.log(`Report written to: ${reportPath}`);
}

function generateOutputCSV(accounts: AccountInfo[]): string {
  // Create a map for quick lookup
  const accountMap = new Map<string, AccountInfo>();
  for (const account of accounts) {
    accountMap.set(account.account, account);
  }

  // Build CSV content with headers
  let csvContent =
    "account,ethGlv,btcGlv,usdc,distributionUsd,duneEstimatedDistributionUsd,status,isSmartContractWallet,isDolomite\n";

  // Output only the analyzed accounts
  for (const account of accounts) {
    const values = [
      account.account,
      account.ethGlv || "0",
      account.btcGlv || "0",
      account.usdc || "0",
      account.distributionUsd || "0",
      account.duneEstimatedDistributionUsd || "",
      account.status || "",
      account.isSmartContractWallet || "no",
      account.isDolomite || "no",
    ];
    csvContent += values.join(",") + "\n";
  }

  return csvContent;
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

    // csv columns format: account,ethGlv,btcGlv,usdc,distributionUsd,duneEstimatedDistributionUsd,status,isSmartContractWallet,isDolomite
    const accountIndex = headers.indexOf("account");
    const ethGlvIndex = headers.indexOf("ethGlv");
    const btcGlvIndex = headers.indexOf("btcGlv");
    const usdcIndex = headers.indexOf("usdc");
    const distributionUsdIndex = headers.indexOf("distributionUsd");
    const duneEstimatedDistributionUsdIndex = headers.indexOf("duneEstimatedDistributionUsd");
    const statusIndex = headers.indexOf("status");
    const isSmartContractWalletIndex = headers.indexOf("isSmartContractWallet");
    const isDolomiteIndex = headers.indexOf("isDolomite");

    if (accountIndex >= 0 && values[accountIndex]) {
      accounts.push({
        account: values[accountIndex],
        ethGlv: ethGlvIndex >= 0 ? values[ethGlvIndex] : undefined,
        btcGlv: btcGlvIndex >= 0 ? values[btcGlvIndex] : undefined,
        usdc: usdcIndex >= 0 ? values[usdcIndex] : undefined,
        distributionUsd: values[distributionUsdIndex] || "0",
        duneEstimatedDistributionUsd:
          duneEstimatedDistributionUsdIndex >= 0 ? values[duneEstimatedDistributionUsdIndex] : undefined,
        status: statusIndex >= 0 ? values[statusIndex] : undefined,
        isSmartContractWallet: isSmartContractWalletIndex >= 0 ? values[isSmartContractWalletIndex] : undefined,
        isDolomite: isDolomiteIndex >= 0 ? values[isDolomiteIndex] : undefined,
      });
    }
  }

  return accounts;
}

async function identifyContractType(
  address: string,
  provider: ethers.providers.Provider
): Promise<{ isSmartWallet: boolean; implementation?: string }> {
  // Run all checks in parallel for better performance
  const [directEIP1271, implSlot, beaconSlot] = await Promise.all([
    // Check for direct EIP-1271 support
    hasEIP1271(address, provider),
    // Check standard implementation slot
    provider.getStorageAt(address, IMPLEMENTATION_SLOT).catch(() => ethers.constants.HashZero),
    // Check beacon slot
    provider.getStorageAt(address, BEACON_SLOT).catch(() => ethers.constants.HashZero),
  ]);

  // If direct EIP-1271 support, it's a smart wallet
  if (directEIP1271) {
    return { isSmartWallet: true };
  }

  // Check implementation slot
  if (implSlot !== ethers.constants.HashZero) {
    try {
      const implementation = ethers.utils.getAddress("0x" + implSlot.slice(-40));
      const isSmartWallet = await hasEIP1271(implementation, provider);
      return { isSmartWallet, implementation };
    } catch {
      // Ignore if implementation check fails
      console.log("Implementation slot check failed");
    }
  }

  // Check beacon slot
  if (beaconSlot !== ethers.constants.HashZero) {
    try {
      const beaconAddress = ethers.utils.getAddress("0x" + beaconSlot.slice(-40));
      const beaconContract = new ethers.Contract(
        beaconAddress,
        ["function implementation() view returns (address)"],
        provider
      );
      const implementation = await beaconContract.implementation();
      const isSmartWallet = await hasEIP1271(implementation, provider);
      return { isSmartWallet, implementation };
    } catch {
      // Ignore if beacon check fails
      console.log("Beacon slot check failed");
    }
  }

  // Not a smart wallet
  return { isSmartWallet: false };
}

async function hasDolomiteMargin(address: string, provider: ethers.providers.Provider): Promise<boolean> {
  const DOLOMITE_ABI = ["function DOLOMITE_MARGIN() external view returns (address)"];

  try {
    const contract = new ethers.Contract(address, DOLOMITE_ABI, provider);

    // Try to call DOLOMITE_MARGIN function
    try {
      await contract.callStatic.DOLOMITE_MARGIN();
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

    // Function is not callable - doesn't exist
    return false;
  } catch (error) {
    console.error(`Error checking DOLOMITE_MARGIN for ${address}:`, error);
    return false;
  }
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
