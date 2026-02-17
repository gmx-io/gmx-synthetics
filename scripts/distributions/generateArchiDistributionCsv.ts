import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

/*
Usage:
  npx hardhat run scripts/distributions/generateArchiDistributionCsv.ts

Reads archi-farmer-distributions.csv and archi-lp-distributions.csv,
merges addresses across both files, and distributes 259,007.468584440052922745 ETH GLV
proportionally based on each address's fsGLP_distribution share of the total.

  ethGlv_amount = (fsGLP_distribution / totalFsGlp) * TOTAL_ETH_GLV

Outputs a combined CSV showing each address's share and ETH GLV distribution.
*/

const TOTAL_ETH_GLV = BigNumber.from("259007468584440052922745"); // 259,007.468584440052922745

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseNum(val: string): string {
  if (!val || val === "") return "0";
  return val.replace(/,/g, "");
}

function readCsv(filePath: string): { account: string; fsGlp: string }[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = parseCsvLine(lines[0]);

  const accountIdx = headers.indexOf("address");
  const fsGlpIdx = headers.indexOf("fsGLP_distribution");

  if (accountIdx === -1) {
    throw new Error(`CSV missing 'address' column. Headers: ${headers.join(", ")}`);
  }
  if (fsGlpIdx === -1) {
    throw new Error(`CSV missing 'fsGLP_distribution' column. Headers: ${headers.join(", ")}`);
  }

  const rows: { account: string; fsGlp: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const account = fields[accountIdx]?.toLowerCase();
    const fsGlp = parseNum(fields[fsGlpIdx]);
    if (!account || !ethers.utils.isAddress(account)) continue;
    if (fsGlp === "0" || !fsGlp) continue;
    rows.push({ account, fsGlp });
  }
  return rows;
}

async function main() {
  const farmerCsv = path.resolve(__dirname, "archi-farmer-distributions.csv");
  const lpCsv = path.resolve(__dirname, "archi-lp-distributions.csv");

  console.log("Reading farmer CSV: %s", farmerCsv);
  const farmerRows = readCsv(farmerCsv);
  console.log("  %s farmer addresses", farmerRows.length);

  console.log("Reading LP CSV: %s", lpCsv);
  const lpRows = readCsv(lpCsv);
  console.log("  %s LP addresses", lpRows.length);

  // Merge: sum fsGLP_distribution for duplicate addresses across CSVs
  const merged = new Map<string, BigNumber>();
  for (const row of [...farmerRows, ...lpRows]) {
    const amount = ethers.utils.parseEther(row.fsGlp);
    const existing = merged.get(row.account) || BigNumber.from(0);
    merged.set(row.account, existing.add(amount));
  }

  console.log("\nMerged: %s unique addresses", merged.size);

  // Compute total fsGLP
  let totalFsGlp = BigNumber.from(0);
  for (const amount of merged.values()) {
    totalFsGlp = totalFsGlp.add(amount);
  }
  console.log("Total fsGLP_distribution: %s", ethers.utils.formatEther(totalFsGlp));

  // Compute each address's proportional ETH GLV amount
  const distributions: { account: string; fsGlp: BigNumber; amount: BigNumber }[] = [];
  let allocatedTotal = BigNumber.from(0);

  for (const [account, fsGlp] of merged.entries()) {
    const amount = fsGlp.mul(TOTAL_ETH_GLV).div(totalFsGlp);
    if (amount.gt(0)) {
      distributions.push({ account, fsGlp, amount });
      allocatedTotal = allocatedTotal.add(amount);
    }
  }

  // Distribute dust remainder to largest holder
  const dust = TOTAL_ETH_GLV.sub(allocatedTotal);
  if (dust.gt(0)) {
    distributions.sort((a, b) => (b.amount.gt(a.amount) ? 1 : -1));
    distributions[0].amount = distributions[0].amount.add(dust);
    allocatedTotal = allocatedTotal.add(dust);
    console.log("Dust remainder: %s wei (added to %s)", dust.toString(), distributions[0].account);
  }

  // Sort by amount descending
  distributions.sort((a, b) => (b.amount.gt(a.amount) ? 1 : -1));

  console.log("Addresses with non-zero allocation: %s", distributions.length);
  console.log("Total allocated: %s ETH GLV", ethers.utils.formatEther(allocatedTotal));
  console.log("Expected total:  %s ETH GLV", ethers.utils.formatEther(TOTAL_ETH_GLV));
  console.log("Match: %s\n", allocatedTotal.eq(TOTAL_ETH_GLV));

  // Write CSV
  const outDir = path.resolve(__dirname, "out");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const csvLines = ["account,fsGLP_distribution,share,ethGlv_amount,ethGlv_amount_wei"];
  for (const { account, fsGlp, amount } of distributions) {
    const sharePercent = fsGlp.mul(10000).div(totalFsGlp).toNumber() / 100;
    csvLines.push(
      [
        account,
        ethers.utils.formatEther(fsGlp),
        `${sharePercent.toFixed(2)}%`,
        ethers.utils.formatEther(amount),
        amount.toString(),
      ].join(",")
    );
  }

  const outPath = path.resolve(outDir, "archi_redistribution_summary.csv");
  fs.writeFileSync(outPath, csvLines.join("\n"));
  console.log("CSV written to: %s", outPath);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
