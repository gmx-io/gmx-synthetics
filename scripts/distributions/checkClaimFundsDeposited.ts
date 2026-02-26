import fs from "fs";
import path from "path";
import hre, { ethers } from "hardhat";
import { formatAmount } from "../../utils/math";
import { GLV_V1_DISTRIBUTION_ID } from "../helpers";

/*
Checks the GLV distribution status for every address in the input CSV, classifying each into one of three states:
  - Claimed:      funds deposited and claimed (getClaimableAmount == 0, deposit event exists)
  - Unclaimed:    funds deposited but not yet claimed (getClaimableAmount > 0)
  - Unreimbursed: funds were never deposited (getClaimableAmount == 0, no deposit event)

The input CSV is exported from the GLP_GLV-for-CONTRACT spreadsheet.
Checks on-chain via multicall (ClaimHandler.getClaimableAmount) and ClaimFundsDeposited events.
Outputs a summary and writes out/unreimbursed.csv with addresses still owed funds.

CSV format: #,account,fsGLP_distribution,ethGlv,btcGlv, ...

Usage:
CSV_PATH=scripts/distributions/data/GLP_GLV-for-CONTRACT.csv npx hardhat --network arbitrum run scripts/distributions/checkClaimFundsDeposited.ts

*/

const ETH_GLV = "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9";
const BTC_GLV = "0xdf03eed325b82bc1d4db8b49c30ecc9e05104b96";

const BATCH_SIZE = 100;

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

// Parse a CSV line respecting quoted fields (handles "710,379.63" style values)
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
function toWei(val: string): string {
  const cleaned = (val || "0").replace(/,/g, "");
  if (!cleaned || cleaned === "0") return "0";
  return ethers.utils.parseUnits(cleaned, 18).toString();
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = parseCsvLine(lines[0]);

  //
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

// Query ClaimFundsDeposited events from EventEmitter to find addresses
// that had funds deposited but have since claimed (getClaimableAmount == 0)
async function getDepositedAccounts(eventEmitterContract: any, tokenAddresses: string[]): Promise<Set<string>> {
  const depositedAccounts = new Set<string>();

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

  return depositedAccounts;
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

  const claimHandler = await hre.ethers.getContract("ClaimHandler");
  const multicall = await hre.ethers.getContract("Multicall3");
  const eventEmitter = await hre.ethers.getContract("EventEmitter");

  const tokens = [
    { address: ETH_GLV, name: "ETH GLV", decimals: 18 },
    { address: BTC_GLV, name: "BTC GLV", decimals: 18 },
  ];

  const distributionId = GLV_V1_DISTRIBUTION_ID;

  // Step 1: Check getClaimableAmount via multicall
  console.log("Checking getClaimableAmount via multicall...");
  const accounts = rows.map((r) => r.account);
  const unclaimed: Map<string, { ethGlv: string; btcGlv: string }> = new Map();

  const totalBatches = Math.ceil(accounts.length / BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const from = batchIdx * BATCH_SIZE;
    const batch = accounts.slice(from, from + BATCH_SIZE);

    // Each account gets 2 calls (one per token)
    const payload = batch.flatMap((account) =>
      tokens.map((token) => ({
        target: claimHandler.address,
        callData: claimHandler.interface.encodeFunctionData("getClaimableAmount", [
          account,
          token.address,
          [distributionId],
        ]),
      }))
    );

    const result = await multicall.callStatic.aggregate3(payload);

    for (let i = 0; i < batch.length; i++) {
      const account = batch[i];
      const ethGlvResult = claimHandler.interface.decodeFunctionResult(
        "getClaimableAmount",
        result[i * 2].returnData
      )[0];
      const btcGlvResult = claimHandler.interface.decodeFunctionResult(
        "getClaimableAmount",
        result[i * 2 + 1].returnData
      )[0];

      if (ethGlvResult.gt(0) || btcGlvResult.gt(0)) {
        unclaimed.set(account.toLowerCase(), {
          ethGlv: formatAmount(ethGlvResult, 18, 4, true),
          btcGlv: formatAmount(btcGlvResult, 18, 4, true),
        });
      }
    }

    process.stdout.write(`\rChecked ${Math.min(from + BATCH_SIZE, accounts.length)}/${accounts.length} addresses...`);
  }

  console.log("\n");

  // Step 2: Check ClaimFundsDeposited events for addresses with getClaimableAmount == 0
  // This catches addresses that were deposited but have since claimed
  console.log("Checking ClaimFundsDeposited events for already-claimed addresses...");
  const allDeposited = await getDepositedAccounts(eventEmitter, [ETH_GLV, BTC_GLV]);

  // Classify addresses into three categories
  const claimed = new Set<string>();
  for (const row of rows) {
    const addr = row.account.toLowerCase();
    if (!unclaimed.has(addr) && allDeposited.has(addr)) {
      claimed.add(addr);
    }
  }

  const unreimbursed = rows.filter((r) => {
    const addr = r.account.toLowerCase();
    return !unclaimed.has(addr) && !claimed.has(addr);
  });
  const unclaimedRows = rows.filter((r) => unclaimed.has(r.account.toLowerCase()));
  const claimedRows = rows.filter((r) => claimed.has(r.account.toLowerCase()));

  // Print results — single list in CSV order with status icons
  console.log("=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log("Total addresses:    %s", accounts.length);
  console.log("✅  Claimed:        %s", claimed.size);
  console.log("⚠️  Unclaimed:      %s", unclaimed.size);
  console.log("🛑  Unreimbursed:   %s", unreimbursed.length);
  console.log();

  for (const row of rows) {
    const addr = row.account.toLowerCase();
    if (unclaimed.has(addr)) {
      const amounts = unclaimed.get(addr)!;
      console.log("⚠️  %s  ETH GLV: %s  BTC GLV: %s", row.account, amounts.ethGlv, amounts.btcGlv);
    } else if (claimed.has(addr)) {
      console.log("✅  %s", row.account);
    } else {
      console.log("🛑  %s  ETH GLV: %s  BTC GLV: %s", row.account, row.ethGlv, row.btcGlv);
    }
  }
  console.log();

  // Print totals
  const allTotals = sumAmounts(rows);
  const unreimbursedTotals = sumAmounts(unreimbursed);
  const unclaimedTotals = sumAmounts(unclaimedRows);
  const claimedTotals = sumAmounts(claimedRows);

  console.log("=".repeat(60));
  console.log("TOTALS");
  console.log("=".repeat(60));
  console.log(
    "All addresses:       ETH GLV: %s  BTC GLV: %s",
    allTotals.totalEthGlv.toFixed(2),
    allTotals.totalBtcGlv.toFixed(2)
  );
  console.log(
    "✅  Claimed:          ETH GLV: %s  BTC GLV: %s",
    claimedTotals.totalEthGlv.toFixed(2),
    claimedTotals.totalBtcGlv.toFixed(2)
  );
  console.log(
    "⚠️  Unclaimed:        ETH GLV: %s  BTC GLV: %s",
    unclaimedTotals.totalEthGlv.toFixed(2),
    unclaimedTotals.totalBtcGlv.toFixed(2)
  );
  console.log(
    "🛑  To be reimbursed: ETH GLV: %s  BTC GLV: %s",
    unreimbursedTotals.totalEthGlv.toFixed(2),
    unreimbursedTotals.totalBtcGlv.toFixed(2)
  );
  console.log();

  // Write filtered CSV (addresses that are truly unreimbursed)
  const outDir = path.join(__dirname, "out");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const csvLines = [
    "account,ethGlv,btcGlv,ethGlv_amount_wei,btcGlv_amount_wei",
    ...unreimbursed.map((r) => {
      const ethGlv = r.ethGlv.replace(/,/g, "");
      const btcGlv = r.btcGlv.replace(/,/g, "");
      return `${r.account},${ethGlv},${btcGlv},${toWei(r.ethGlv)},${toWei(r.btcGlv)}`;
    }),
  ];

  const outPath = path.join(outDir, "remaining_distributions.csv");
  fs.writeFileSync(outPath, csvLines.join("\n"));
  console.log("Wrote %s unreimbursed addresses to %s", unreimbursed.length, outPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
