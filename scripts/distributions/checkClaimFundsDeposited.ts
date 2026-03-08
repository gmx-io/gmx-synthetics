import fs from "fs";
import path from "path";
import hre, { ethers } from "hardhat";
import { getEventDataFromLog } from "../../utils/event";

/*
Checks whether funds have been deposited for addresses in the input CSV
by looking for ClaimFundsDeposited events on-chain.

Classifies each address as:
  - Deposited:    ClaimFundsDeposited event exists (funds were sent, regardless of claim status)
  - Not deposited: no deposit event found — should be reimbursed

The input CSV is exported from the GLP_GLV-for-CONTRACT spreadsheet.
Outputs a summary and writes out/remaining_distributions.csv with addresses still owed funds.

Usage:
CSV_PATH=scripts/distributions/data/GLP_GLV-for-CONTRACT.csv npx hardhat --network arbitrum run scripts/distributions/checkClaimFundsDeposited.ts

CSV format: #,account,fsGLP_distribution,ethGlv,btcGlv, ...
*/

const ETH_GLV = "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9";
const BTC_GLV = "0xdf03eed325b82bc1d4db8b49c30ecc9e05104b96";

// Addresses confirmed reimbursed to a different address via Safe multisig.
// Includes both original contract addresses and deposit-target addresses (although just the original should be sufficient).
const ALREADY_REIMBURSED = new Set([
  "0xa71a021ef66b03e45e0d85590432dfcfa1b7174c", // Abra (original)
  "0x85667409a723684fe1e57dd1abde8d88c2f54214", // Abra (deposit target)
  "0xa5c1c5a67ba16430547fea9d608ef81119be1876", // Plutus (original)
  "0xbec7635c7a475cbe081698ea110ef411e40f8dd9", // Plutus (deposit target)
  "0x03c513588288524c2cd29ae6171acafdec592f1e", // Plutus Vault (Dolomite contract deployed by Plutus, found in tg discussions)
  "0xb81a869025fa244a9841d86630996368857a6e86", // DappOs (original = deposit target)
  "0xee2a909e3382cdf45a0d391202aff3fb11956ad1", // Rage (original)
  "0x8478ab5064ebac770ddce77e7d31d969205f041e", // Rage (deposit target)
  "0xa75c21c5be284122a87a37a76cc6c4dd3e55a1d4", // Dolomite (original)
  "0xdd0556ddcfe7cdab3540e7f09cb366f498d90774", // Jones DAO (original)
  "0x64ecc55a4f5d61ead9b966bcb59d777593afbd6f", // Jones DAO (deposit target 1)
  "0x5a446ba4d4bf482a3e63648e76e9404e784f7bbc", // Jones DAO (deposit target 2)
  "0x3f5eddad52c665a4aa011cd11a21e1d5107d7862", // Beefy (original)
  "0xdb8d4639de19be6be5a5efe8279744c7e236b48d", // Beefy (deposit target)
  "0x66c9269d75ab52941e325d9c1e3b156a325e8a90", // Mucho Finance (original)
  "0xd7e4ceb17d313996fa0f5e14dd6425ee9248c4b6", // Mucho Finance (deposit target)
  "0x1a776c84d64ecada985c968c3589b3c8615a1e7c", // Stabilize (original)
  "0x214a2432aff539a5fbac965d391254d2d8f2e68e", // Stabilize (deposit target)
  "0xc328dfcd2c8450e2487a91daa9b75629075b7a43", // Pendle (original)
  "0xd1f7d5fec6eb532847e552269c905ac489992ef6", // Pendle (deposit target)
  "0x9824a8898a96082942a7c9857509483b2f72aeba", // Vaultka (original)
  "0x9566db22dc32e54234d2d0ae7b72f44e05158239", // Vaultka (deposit target)
  "0x80b54e18e5bb556c6503e1c6f2655749c9e41da2", // Tenderfi / GLend (original)
  "0xff2073d3810754d6da4783235c8647e11e43c943", // Tenderfi / GLend (deposit target)
  "0x5be876ed0a9655133226be302ca6f5503e3da569", // Hinkal (original)
  "0x41658b0daf59bb2fbb2d9a5249207011d2b364de", // Hinkal (deposit target)
  "0x4415361b7ab26c3373d41dffa115328518a6046a", // Pirex (original)
  "0xb0e54cde03e37414672d69687b212388566ba856", // Pirex (deposit target)
  "0x599850287dd42db3137ef82f70c5dcabc690d524", // YieldYak (original)
  "0xbe5958f1dbb48a60efd0a9d8d26917641d3b50ef", // YieldYak (deposit target)
  "0x49ee14e37cb47bff8c512b3a0d672302a3446eb1", // Archi (GMXExecutor)
  "0xe854358bc324cd5a73deb5552a698e462a9cc38e", // Archi (CreditUser2)
  "0x437a182b571390c7e5d14cc7103d3b9d7628faca", // Archi (CreditAggregator)
]);

interface CsvRow {
  account: string;
  ethGlv: string;
  btcGlv: string;
}

// Parse a CSV line respecting quoted fields (handles "xx,xxx.xx" style values)
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

// Parse numeric string, stripping thousand-separator commas
function parseNum(val: string): number {
  if (!val || val === "") return 0;
  return parseFloat(val.replace(/,/g, "")) || 0;
}

// Convert human-readable amount to wei string (18 decimals)
// Precision is limited to the CSV's decimal places (typically 2). If possible, use the original wei amounts
function toWei(val: string): string {
  const cleaned = (val || "0").replace(/,/g, "");
  if (!cleaned || cleaned === "0") return "0";
  return ethers.utils.parseUnits(cleaned, 18).toString();
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = parseCsvLine(lines[0]);

  const accountIdx = headers.indexOf("account") !== -1 ? headers.indexOf("account") : headers.indexOf("address");
  const ethGlvIdx =
    headers.indexOf("ethGlv") !== -1 ? headers.indexOf("ethGlv") : headers.indexOf("eth_glv_distribution");
  const btcGlvIdx =
    headers.indexOf("btcGlv") !== -1 ? headers.indexOf("btcGlv") : headers.indexOf("btc_glv_distribution");

  if (accountIdx === -1) {
    throw new Error(`CSV missing 'account' or 'address' column. Headers: ${headers.join(", ")}`);
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (!values[accountIdx]) continue;

    rows.push({
      account: values[accountIdx],
      ethGlv: ethGlvIdx !== -1 ? values[ethGlvIdx] : "0",
      btcGlv: btcGlvIdx !== -1 ? values[btcGlvIdx] : "0",
    });
  }

  return rows;
}

function sumAmounts(rows: CsvRow[]): { totalEthGlv: number; totalBtcGlv: number } {
  let totalEthGlv = 0;
  let totalBtcGlv = 0;
  for (const row of rows) {
    totalEthGlv += parseNum(row.ethGlv);
    totalBtcGlv += parseNum(row.btcGlv);
  }
  return { totalEthGlv, totalBtcGlv };
}

interface DepositedResult {
  accounts: Set<string>;
  distributionIdCounts: Map<string, number>; // distributionId → event count
}

// Query ClaimFundsDeposited events from EventEmitter to find addresses for which funds have been deposited
async function getDepositedAccounts(eventEmitterContract: any, tokenAddresses: string[]): Promise<DepositedResult> {
  const depositedAccounts = new Set<string>();
  const distributionIdCounts = new Map<string, number>();

  // EventLog2 topics:
  // topic[0] = EventLog2 event selector (from ABI)
  // topic[1] = keccak256("ClaimFundsDeposited") (indexed eventNameHash)
  // topic[2] = bytes32(account) (indexed topic1)
  // topic[3] = bytes32(token) (indexed topic2)
  const eventLog2Topic = eventEmitterContract.interface.getEventTopic("EventLog2");
  const eventNameHash = ethers.utils.id("ClaimFundsDeposited");

  const latestBlock = await ethers.provider.getBlockNumber();
  const MAX_CHUNK = 50_000_000;
  let chunkSize = MAX_CHUNK; // persists across tokens — avoids re-discovering the right size

  for (const token of tokenAddresses) {
    const tokenTopic = ethers.utils.hexZeroPad(token.toLowerCase(), 32);
    let totalLogs = 0;
    let fromBlock = 0;

    while (fromBlock <= latestBlock) {
      const toBlock = Math.min(fromBlock + chunkSize, latestBlock);
      try {
        const logs = await ethers.provider.getLogs({
          address: eventEmitterContract.address,
          topics: [
            eventLog2Topic,
            eventNameHash,
            null, // topic1 = account (we'll filter locally)
            tokenTopic,
          ],
          fromBlock,
          toBlock,
        });

        for (const log of logs) {
          // topic[2] is the account (bytes32-padded address)
          const accountBytes32 = log.topics[2];
          const account = ethers.utils.getAddress("0x" + accountBytes32.slice(26)).toLowerCase();
          depositedAccounts.add(account);

          // Decode event data to extract distributionId
          const parsedLog = eventEmitterContract.interface.parseLog(log);
          const eventData: any = getEventDataFromLog(parsedLog);
          const distId = eventData.distributionId.toString();
          distributionIdCounts.set(distId, (distributionIdCounts.get(distId) || 0) + 1);
        }

        totalLogs += logs.length;
        fromBlock = toBlock + 1;
        // Try to grow chunk back up (event density varies across block ranges)
        chunkSize = Math.min(chunkSize * 2, MAX_CHUNK);
      } catch (e: any) {
        const msg = e.message || e.body || "";
        if (msg.includes("Log response size exceeded") || msg.includes("Query timeout exceeded")) {
          chunkSize = Math.floor(chunkSize / 2);
          if (chunkSize < 1000) throw new Error("Chunk size too small, aborting");
          // don't advance fromBlock — retry same range with smaller chunk
        } else {
          throw e;
        }
      }
    }

    console.log("Found %s ClaimFundsDeposited events for token %s", totalLogs, token);
  }

  return { accounts: depositedAccounts, distributionIdCounts };
}

async function main() {
  const csvPath = process.env.CSV_PATH;
  if (!csvPath) {
    throw new Error("CSV_PATH env var is required");
  }

  const resolvedPath = csvPath.startsWith("/") ? csvPath : path.resolve(process.cwd(), csvPath);
  console.log("Reading CSV: %s", resolvedPath);

  const allRows = parseCsv(resolvedPath);
  const rows = allRows.filter((r) => !ALREADY_REIMBURSED.has(r.account.toLowerCase()));
  const excludedCount = allRows.length - rows.length;
  console.log("Found %s addresses in CSV (%s excluded as manually reimbursed)\n", allRows.length, excludedCount);

  const eventEmitter = await hre.ethers.getContract("EventEmitter");

  // Check ClaimFundsDeposited events for all addresses
  console.log("Checking ClaimFundsDeposited events...");
  const { accounts: allDeposited, distributionIdCounts } = await getDepositedAccounts(eventEmitter, [ETH_GLV, BTC_GLV]);

  // Print distribution ID summary
  console.log("\n" + "=".repeat(60));
  console.log("DISTRIBUTION IDS");
  console.log("=".repeat(60));
  console.log("Distinct distribution IDs: %s", distributionIdCounts.size);
  for (const [distId, count] of distributionIdCounts) {
    console.log("  ID %s: %s events", distId, count);
  }
  if (distributionIdCounts.size > 1) {
    console.log("⚠️  WARNING: Multiple distribution IDs found — events may include unrelated distributions");
  }
  console.log();

  // Classify addresses into two categories
  const deposited = rows.filter((r) => allDeposited.has(r.account.toLowerCase()));
  const notDeposited = rows.filter((r) => !allDeposited.has(r.account.toLowerCase()));

  // Print results — single list in CSV order with status icons
  console.log("=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log("Total addresses:    %s", rows.length);
  console.log("✅  Deposited:      %s", deposited.length);
  console.log("🛑  Not deposited:  %s (no deposits made, should be reimbursed)", notDeposited.length);
  console.log();

  for (const row of rows) {
    const addr = row.account.toLowerCase();
    if (allDeposited.has(addr)) {
      console.log("✅  %s", row.account);
    } else {
      console.log("🛑  %s  ETH GLV: %s  BTC GLV: %s", row.account, row.ethGlv, row.btcGlv);
    }
  }
  console.log();

  // Print totals
  const allTotals = sumAmounts(rows);
  const notDepositedTotals = sumAmounts(notDeposited);
  const depositedTotals = sumAmounts(deposited);

  console.log("=".repeat(60));
  console.log("TOTALS");
  console.log("=".repeat(60));
  console.log(
    "All addresses:       ETH GLV: %s  BTC GLV: %s",
    allTotals.totalEthGlv.toFixed(2),
    allTotals.totalBtcGlv.toFixed(2)
  );
  console.log(
    "✅  Deposited:        ETH GLV: %s  BTC GLV: %s",
    depositedTotals.totalEthGlv.toFixed(2),
    depositedTotals.totalBtcGlv.toFixed(2)
  );
  console.log(
    "🛑  Not deposited:    ETH GLV: %s  BTC GLV: %s",
    notDepositedTotals.totalEthGlv.toFixed(2),
    notDepositedTotals.totalBtcGlv.toFixed(2)
  );
  console.log();

  // Write filtered CSV (addresses for which no deposits have been made)
  const outDir = path.join(__dirname, "out");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const csvLines = [
    "account,ethGlv_formatted,btcGlv_formatted,ethGlv,btcGlv",
    ...notDeposited.map((r) => {
      const ethGlv = r.ethGlv.replace(/,/g, "");
      const btcGlv = r.btcGlv.replace(/,/g, "");
      return `${r.account},${ethGlv},${btcGlv},${toWei(r.ethGlv)},${toWei(r.btcGlv)}`;
    }),
  ];

  const outPath = path.join(outDir, "remaining_distributions.csv");
  fs.writeFileSync(outPath, csvLines.join("\n"));
  console.log("Wrote %s addresses (no deposits made, should be reimbursed) to %s", notDeposited.length, outPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
