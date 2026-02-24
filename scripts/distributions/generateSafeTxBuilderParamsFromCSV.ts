import fs from "fs";
import path from "path";

/*
Converts a CSV with (address, amount) columns into JSON tuple arrays
that can be pasted into the Safe TX Builder params field.

Output: [["0xaddr","amount"],["0xaddr","amount"],...] per file.
Split into multiple files if rows exceed BATCH_SIZE.

Usage:
  CSV_PATH=path/to/file.csv \
  npx ts-node scripts/distributions/generateSafeTxBuilderParamsFromCSV.ts
  
  Example for ethGlv archi distributions:
  CSV_PATH=out/archi_redistribution_summary.csv ADDRESS_COLUMN=account AMOUNT_COLUMN=ethGlv_amount_wei npx ts-node scripts/distributions/generateSafeTxBuilderParamsFromCSV.ts

Env vars:
  CSV_PATH         - path to input CSV, relative to this script's directory (required)
  BATCH_SIZE       - max items per file (default: 50)
  ADDRESS_COLUMN   - CSV column name for address (default: "address")
  AMOUNT_COLUMN    - CSV column name for amount (default: "amount")
*/

const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 50;

const csvPath = path.resolve(__dirname, process.env.CSV_PATH);
const content = fs.readFileSync(csvPath, "utf-8");
const lines = content.trim().split("\n");
const headers = lines[0].split(",");

const addressIdx = headers.indexOf(process.env.ADDRESS_COLUMN || "address");
const weiIdx = headers.indexOf(process.env.AMOUNT_COLUMN || "amount");

if (addressIdx === -1 || weiIdx === -1) {
  throw new Error(`CSV missing required columns. Headers: ${headers.join(", ")}`);
}

const rows: [string, string][] = [];
for (let i = 1; i < lines.length; i++) {
  const fields = lines[i].split(",");
  const account = fields[addressIdx];
  const amountWei = fields[weiIdx];
  if (!account || !amountWei || amountWei === "0") continue;
  rows.push([account, amountWei]);
}

console.log("Total rows: %s", rows.length);
console.log("Batch size: %s", BATCH_SIZE);

const outDir = path.resolve(__dirname, "out");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const batchCount = Math.ceil(rows.length / BATCH_SIZE);
for (let i = 0; i < batchCount; i++) {
  const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
  const csvBasename = path.basename(csvPath, path.extname(csvPath));
  const outPath = path.resolve(outDir, `${csvBasename}_params_${i}.json`);
  fs.writeFileSync(outPath, JSON.stringify(batch));
  console.log("Batch %s: %s rows -> %s", i, batch.length, outPath);
}

console.log("\nDone. %s file(s) written.", batchCount);
