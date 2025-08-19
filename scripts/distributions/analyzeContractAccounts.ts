import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import hre from "hardhat";

/*
Usage:
npx hardhat --network arbitrum run scripts/distributions/analyzeContractAccounts.ts

Environment variables:
- SAMPLE_SIZE: Number of accounts to analyze (default: analyze all)
  Example: SAMPLE_SIZE=50 npx hardhat --network arbitrum run scripts/distributions/analyzeContractAccounts.ts

This script analyzes the CONTRACT CSV files to identify which are smart wallets
*/

// EIP-1271 signature validation interface
const EIP1271_ABI = ["function isValidSignature(bytes32 hash, bytes memory signature) public view returns (bytes4)"];

// Safe (Gnosis Safe) wallet interface
const SAFE_ABI = [
  "function getOwners() public view returns (address[])",
  "function getThreshold() public view returns (uint256)",
];

// Argent wallet interface
const ARGENT_ABI = ["function owner() public view returns (address)"];

// EIP-1967 slots for upgradeable contracts
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

interface AccountInfo {
  account: string;
  contractName?: string;
  distributionToken: string;
  approximateDistributionUsd: string;
  isSmartWallet?: boolean;
  walletType?: string;
  implementation?: string;
}

async function main() {
  const provider = hre.ethers.provider;
  const sampleSize = process.env.SAMPLE_SIZE ? parseInt(process.env.SAMPLE_SIZE) : undefined;

  // Process both CSV files
  const csvFiles = [
    "/Users/max/gmx/gmx-synthetics/scripts/distributions/data/GLP_GLV-for-CONTRACT.csv",
    "/Users/max/gmx/gmx-synthetics/scripts/distributions/data/GLP_USDC-for-CONTRACT.csv",
  ];

  for (const csvFile of csvFiles) {
    console.log("\n========================================");
    console.log("Analyzing:", path.basename(csvFile));
    console.log("========================================\n");

    const allAccounts = parseCSV(csvFile);
    const accounts = sampleSize ? allAccounts.slice(0, sampleSize) : allAccounts;

    if (sampleSize) {
      console.log(
        `Analyzing first ${accounts.length} of ${allAccounts.length} contract accounts (SAMPLE_SIZE=${sampleSize})\n`
      );
    } else {
      console.log(`Analyzing all ${accounts.length} contract accounts\n`);
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

    console.log("\n");

    // Display results
    console.log("=== SMART WALLETS IDENTIFIED ===");
    console.log(`Total: ${smartWallets.length} out of ${accounts.length} contracts\n`);

    if (smartWallets.length > 0) {
      console.log(
        "Address                                    | Type         | Contract Name                  | Distribution USD"
      );
      console.log(
        "-------------------------------------------|--------------|--------------------------------|------------------"
      );

      for (const wallet of smartWallets) {
        const name = wallet.contractName || "-";
        const usd = parseFloat(wallet.approximateDistributionUsd).toFixed(2);
        console.log(
          `${wallet.account} | ${(wallet.walletType || "Unknown").padEnd(12)} | ${name.padEnd(30)} | $${usd}`
        );
      }
    }

    // Summary by wallet type
    const walletTypes: Record<string, number> = {};
    for (const wallet of smartWallets) {
      const type = wallet.walletType || "Unknown";
      walletTypes[type] = (walletTypes[type] || 0) + 1;
    }

    if (Object.keys(walletTypes).length > 0) {
      console.log("\n=== SMART WALLET TYPE BREAKDOWN ===");
      for (const [type, count] of Object.entries(walletTypes)) {
        console.log(`${type}: ${count}`);
      }
    }

    // Show some regular contracts for context
    console.log("\n=== REGULAR CONTRACTS (NOT SMART WALLETS) ===");
    console.log(`Total: ${otherContracts.length} out of ${accounts.length} contracts\n`);

    if (otherContracts.length > 0) {
      console.log("Showing first 10 regular contracts:");
      console.log("Address                                     | Contract Name");
      console.log("-------------------------------------------|--------------------");

      for (let i = 0; i < Math.min(10, otherContracts.length); i++) {
        const contract = otherContracts[i];
        const name = contract.contractName || "(unnamed)";
        console.log(`${contract.account} | ${name}`);
      }

      if (otherContracts.length > 10) {
        console.log(`... and ${otherContracts.length - 10} more`);
      }
    }

    if (sampleSize && allAccounts.length > accounts.length) {
      console.log(`\n📝 NOTE: This is a sample analysis of the first ${sampleSize} accounts only.`);
      console.log(`   Total accounts in file: ${allAccounts.length}`);
      console.log(`   To analyze all accounts, run without SAMPLE_SIZE environment variable`);
    }
  }
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
    const accountIndex = headers.indexOf("account");
    const contractNameIndex = headers.indexOf("contract_name");
    const tokenIndex = headers.indexOf("distribution_token");
    const usdIndex = headers.indexOf("approximate_distribution_usd");

    if (accountIndex >= 0 && values[accountIndex]) {
      accounts.push({
        account: values[accountIndex],
        contractName: values[contractNameIndex] || undefined,
        distributionToken: values[tokenIndex] || "",
        approximateDistributionUsd: values[usdIndex] || "0",
      });
    }
  }

  return accounts;
}

async function identifyContractType(
  address: string,
  provider: ethers.providers.Provider
): Promise<{ isSmartWallet: boolean; walletType?: string; implementation?: string }> {
  // Check for Safe wallet
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
    // Ignore if Safe detection fails
  }

  // Check for Argent wallet
  try {
    const argent = new ethers.Contract(address, ARGENT_ABI, provider);
    const owner = await argent.owner().catch(() => null);

    if (owner && ethers.utils.isAddress(owner)) {
      // Additional check for isValidSignature
      if (await hasEIP1271(address, provider)) {
        return { isSmartWallet: true, walletType: "Argent" };
      }
    }
  } catch {
    // Ignore if Argent detection fails
  }

  // Check for proxy implementation (might be upgradeable smart wallet)
  try {
    const implSlot = await provider.getStorageAt(address, IMPLEMENTATION_SLOT);
    if (implSlot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      const implementation = ethers.utils.getAddress("0x" + implSlot.slice(-40));

      // Check if the implementation has EIP-1271
      if (await hasEIP1271(address, provider)) {
        return {
          isSmartWallet: true,
          walletType: "SmartWallet",
          implementation,
        };
      }
    }
  } catch {
    // Ignore if proxy detection fails
  }

  // Check for generic EIP-1271 support (could be any smart wallet)
  if (await hasEIP1271(address, provider)) {
    return { isSmartWallet: true, walletType: "EIP1271" };
  }

  // Not identified as a smart wallet
  return { isSmartWallet: false };
}

async function hasEIP1271(address: string, provider: ethers.providers.Provider): Promise<boolean> {
  try {
    const contract = new ethers.Contract(address, EIP1271_ABI, provider);
    const dummyHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"));
    const dummySignature = "0x00";

    // Check if the contract has the isValidSignature function by checking bytecode
    const code = await provider.getCode(address);
    // Function selector for isValidSignature(bytes32,bytes): 0x1626ba7e
    if (!code.includes("1626ba7e")) {
      return false;
    }

    try {
      // Try to call the function - it should return bytes4 if it's a real EIP-1271 implementation
      const result = await contract.callStatic.isValidSignature(dummyHash, dummySignature);
      // EIP-1271 should return bytes4, either 0x1626ba7e for valid or something else for invalid
      // If we get any bytes4 response, it likely implements EIP-1271
      return ethers.utils.hexDataLength(result) === 4;
    } catch (error: any) {
      // If it reverts with a specific error about signature validation, it might still be EIP-1271
      // But if it reverts because the function doesn't exist, it's not EIP-1271
      return false;
    }
  } catch {
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
