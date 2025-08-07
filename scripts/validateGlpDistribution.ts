import fs from "fs";
import { parse } from "fast-csv";
import { bigNumberify, parseDecimalToUnits, FLOAT_PRECISION, PRECISION } from "../utils/math";

function summarize(values) {
  if (values.length === 0) {
    throw new Error("Array is empty");
  }

  // Sort (clone array first to avoid mutating original)
  const sorted = [...values].sort((a, b) => (a.lt(b) ? -1 : a.gt(b) ? 1 : 0));

  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? sorted[mid - 1].add(sorted[mid]).div(2) : sorted[mid];

  const sum = values.reduce((acc, val) => acc.add(val), bigNumberify(0));
  const avg = sum.div(values.length); // Integer division

  return { min, max, median, avg, sum };
}

function printDiffs(usdDiffs) {
  const { min, max, median, avg } = summarize(usdDiffs);

  console.log(`    min: ${ethers.utils.formatUnits(min, PRECISION)}`);
  console.log(`    max: ${ethers.utils.formatUnits(max, PRECISION)}`);
  console.log(`    median: ${ethers.utils.formatUnits(median, PRECISION)}`);
  console.log(`    avg: ${ethers.utils.formatUnits(avg, PRECISION)}`);
}

async function main() {
  let rowCount = 0;
  let totalEthGlv = bigNumberify(0);
  let totalBtcGlv = bigNumberify(0);
  let totalUsdc = bigNumberify(0);

  const stream = fs.createReadStream("./out/glp-distribution.csv").pipe(parse({ headers: true }));

  const usdDiffs = [];
  const percentageDiffs = [];

  for await (const row of stream) {
    console.log(`${row.account}: ${row.ethGlv}, ${row.btcGlv}, ${row.usdc}`);
    totalEthGlv = totalEthGlv.add(parseDecimalToUnits(row.ethGlv));
    totalBtcGlv = totalBtcGlv.add(parseDecimalToUnits(row.btcGlv));
    totalUsdc = totalUsdc.add(parseDecimalToUnits(row.usdc));
    const usdDiff = parseDecimalToUnits(row.distributionUsd).sub(parseDecimalToUnits(row.duneEstimatedDistributionUsd));
    const percentageDiff = usdDiff
      .mul(FLOAT_PRECISION)
      .mul(100)
      .div(parseDecimalToUnits(row.duneEstimatedDistributionUsd));
    usdDiffs.push(usdDiff);
    percentageDiffs.push(percentageDiff);
    rowCount++;
  }

  console.log(`total rows: ${rowCount}`);
  console.log(`totalEthGlv: ${ethers.utils.formatUnits(totalEthGlv, PRECISION)}`);
  console.log(`totalBtcGlv: ${ethers.utils.formatUnits(totalBtcGlv, PRECISION)}`);
  console.log(`totalUsdc: ${ethers.utils.formatUnits(totalUsdc, PRECISION)}`);

  console.log(`distributionUsd - duneEstimatedDistributionUsd:`);
  printDiffs(usdDiffs);

  console.log(`distributionUsd - duneEstimatedDistributionUsd (%):`);
  printDiffs(percentageDiffs);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
