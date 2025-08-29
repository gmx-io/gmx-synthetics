import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import hre from "hardhat";

/*
Usage:
npx hardhat --network arbitrum run scripts/distributions/analyzeContractAccounts.ts | tee scripts/distributions/out/distributions-logs.txt
OR
FILEPATH=./scripts/data/distributions.csv npx hardhat --network arbitrum run scripts/distributions/analyzeContractAccounts.ts | tee scripts/distributions/out/distributions-logs.txt

Environment variables:
- SAMPLE_SIZE: Number of accounts to analyze (default: analyze all)
  Example: SAMPLE_SIZE=5 npx hardhat --network arbitrum run scripts/distributions/analyzeContractAccounts.ts

This script analyzes the CONTRACT CSV files to identify which ones are smart wallets
*/

const CSV_FILES = [];

// CSV files to process
if (process.env.FILEPATH) {
  CSV_FILES.push(path.join(process.cwd(), process.env.FILEPATH));
} else {
  CSV_FILES.push(path.join(__dirname, "data/distributions.csv"));
}

const messageHash = ethers.utils.hashMessage("some-message");
let messageSignature: string;
const validSignatureResponses = [
  // https://eips.ethereum.org/EIPS/eip-1271
  "0x1626ba7e", // valid signature e.g. bytes4(keccak256("isValidSignature(bytes32,bytes)"))
  "0xffffffff", // invalid signature - suggested by spec
  "0x00000000", // invalid signature - not in spec, but commonly used
  // Any other 4-byte value could be a fallback function
];

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
}

const manuallyCheckedSmartWalletAccounts = [
  "0xf42b28742b8d23ec0223ddc3581f691efcf5675c",
  "0xe5bfa2543d0630bcbecc66684d950c3c99c2f497",
  "0x882dad8e29922ab48237beb605d70d04fa6488db",
  "0x476e93e40e12da89b832e866e97efaf227e4cc4d",
  "0x290f4f95923170eaad0f8cadd84b6e887171c17a",
].map((account) => account.toLowerCase());

async function main() {
  const signer = new ethers.Wallet(process.env.ACCOUNT_KEY);
  messageSignature = await signer.signMessage(ethers.utils.arrayify(messageHash));

  const provider = hre.ethers.provider;
  const sampleSize = process.env.SAMPLE_SIZE ? parseInt(process.env.SAMPLE_SIZE) : undefined;

  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, "out");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Initialize report content
  let reportContent = "# Smart Wallet Analysis Report\n\n";
  reportContent += `Generated on: ${new Date().toISOString()}\n\n`;

  for (const csvFile of CSV_FILES) {
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
    const needsManualCheck: AccountInfo[] = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      // NOTE: comment out progress bar if using tee scripts/distributions/out/distributions-logs.txt
      process.stdout.write(`\rAnalyzing ${i + 1}/${accounts.length}...`);

      try {
        const result = await hasEIP1271(account.account, provider);

        if (manuallyCheckedSmartWalletAccounts.includes(account.account.toLowerCase())) {
          console.log(`Manually checked smart wallet: ${account.account}`);
          account.isSmartContractWallet = "yes";
          smartWallets.push(account);
          continue;
        }

        // Check if contract has DOLOMITE_MARGIN function
        const hasDolomite = await hasDolomiteMargin(account.account, provider);
        account.isDolomite = hasDolomite ? "yes" : "no";

        if (result.needsManualCheck) {
          account.isSmartContractWallet = "?";
          needsManualCheck.push(account);
        } else if (result.isSmartWallet) {
          account.isSmartContractWallet = "yes";
          smartWallets.push(account);
        } else {
          account.isSmartContractWallet = "no";
          otherContracts.push(account);
        }
      } catch (error) {
        console.log(`Error analyzing ${account.account}:`, error);
        // If analysis fails, mark for manual check
        account.isSmartContractWallet = "?";
        account.isDolomite = "no";
        needsManualCheck.push(account);
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
    reportContent += `**Regular Contracts:** ${otherContracts.length} out of ${accounts.length} contracts\n`;
    reportContent += `**Needs Manual Check:** ${needsManualCheck.length} out of ${accounts.length} contracts\n\n`;

    // Smart Wallets table
    if (smartWallets.length > 0) {
      reportContent += `### Smart Wallets\n\n`;
      reportContent += `| Address | Distribution USD | isSmartContractWallet | isDolomite |\n`;
      reportContent += `|---------|------------------|----------------------|------------|\n`;

      for (const account of smartWallets) {
        const usd = parseFloat(account.distributionUsd || "0").toFixed(2);
        const isSmartContractWallet = "yes";
        const isDolomite = account.isDolomite || "-";
        reportContent += `| ${account.account} | $${usd} | ${isSmartContractWallet} | ${isDolomite} |\n`;
      }
      reportContent += `\n`;
    }

    // Regular Contracts table
    if (otherContracts.length > 0) {
      reportContent += `### Regular Contracts\n\n`;
      reportContent += `| Address | Distribution USD | isSmartContractWallet | isDolomite |\n`;
      reportContent += `|---------|------------------|----------------------|------------|\n`;

      for (const account of otherContracts) {
        const usd = parseFloat(account.distributionUsd || "0").toFixed(2);
        const isSmartContractWallet = "no";
        const isDolomite = account.isDolomite || "-";
        reportContent += `| ${account.account} | $${usd} | ${isSmartContractWallet} | ${isDolomite} |\n`;
      }
      reportContent += `\n`;
    }

    // Needs Manual Check table
    if (needsManualCheck.length > 0) {
      reportContent += `### Contracts Requiring Manual Verification\n\n`;
      reportContent += `| Address | Distribution USD | isSmartContractWallet | isDolomite |\n`;
      reportContent += `|---------|------------------|----------------------|------------|\n`;

      for (const account of needsManualCheck) {
        const usd = parseFloat(account.distributionUsd || "0").toFixed(2);
        const isSmartContractWallet = "?";
        const isDolomite = account.isDolomite || "-";
        reportContent += `| ${account.account} | $${usd} | ${isSmartContractWallet} | ${isDolomite} |\n`;
      }
      reportContent += `\n`;
    }

    if (sampleSize && allAccounts.length > accounts.length) {
      reportContent += `**NOTE:** This is a sample analysis of the first ${sampleSize} accounts only.\n`;
      reportContent += `- Total accounts in file: ${allAccounts.length}\n`;
      reportContent += `- To analyze all accounts, run without SAMPLE_SIZE environment variable\n\n`;
    }

    // Generate output CSV with same format as input but with analyzed columns
    const outputCsvName = path.basename(csvFile).replace(".csv", "-analyzed.csv");
    const outputCsvPath = path.join(outputDir, outputCsvName);
    const csvContent = generateOutputCSV(accounts);
    fs.writeFileSync(outputCsvPath, csvContent);
    console.log(`Analyzed CSV written to: ${outputCsvPath}`);
  }

  // Write report to file
  const reportPath = path.join(outputDir, "REPORT.md");
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
      account.isSmartContractWallet || "?",
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

async function hasDolomiteMargin(address: string, provider: ethers.providers.Provider): Promise<boolean> {
  const DOLOMITE_ABI = ["function DOLOMITE_MARGIN() external view returns (address)"];

  const contract = new ethers.Contract(address, DOLOMITE_ABI, provider);
  // Try to call DOLOMITE_MARGIN function
  try {
    await contract.callStatic.DOLOMITE_MARGIN();
    return true; // Function exists and executed
  } catch (error: any) {
    // DOLOMITE_MARGIN does not revert in Dolomite contracts (it's a view function returning an address)
    // so no need to check the error data or revert reason
  }

  return false;
}

async function hasEIP1271(
  address: string,
  provider: ethers.providers.Provider
): Promise<{ isSmartWallet: boolean; needsManualCheck: boolean }> {
  const EIP1271_ABI = [
    "function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4)",
  ];
  const contract = new ethers.Contract(address, EIP1271_ABI, provider);

  try {
    const result = await contract.callStatic["isValidSignature(bytes32,bytes)"](messageHash, messageSignature);
    // console.log(`${address} try --> call result: ${result}`);
    if (validSignatureResponses.includes(result)) {
      // is flagging 1036 out of 1700 addresses (returning 0x00000000 or 0xffffffff)
      return { isSmartWallet: true, needsManualCheck: false }; // Valid EIP-1271 response
    }
    // If the function returned something else, it's likely a fallback function
  } catch (error: any) {
    if (error.errorSignature && error.reason && !error.reason.includes("Function does not exist")) {
      // is flagging 7 out of 1700 addresses (5 SafeProxy, 2 unverified contracts)
      console.log(
        `\nWARNING: isValidSignature call failed with signature error and reason "${error.reason}" for ${address}. Contract should be manually verified.`
      );
      return { isSmartWallet: false, needsManualCheck: true };
    }
  }

  return { isSmartWallet: false, needsManualCheck: false };
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
