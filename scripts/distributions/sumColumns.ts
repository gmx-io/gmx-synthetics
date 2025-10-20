import fs from "fs";

const data = fs.readFileSync("scripts/distributions/out/archi-lp-distributions.csv", "utf-8");
const lines = data.trim().split("\n");
const headers = lines[0].split(",");

const sums = new Array(headers.length).fill(0);

for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(",");
  for (let j = 1; j < values.length; j++) {
    sums[j] += parseFloat(values[j]) || 0;
  }
}

const prices = {
  BTC: 110139.97,
  ETH: 2693.19,
  STABLE: 1.0,
  fsGLP: 1.45,
};

let totalVsTokensUSD = 0;

console.log("\nColumn Sums:");
for (let i = 1; i < headers.length; i++) {
  let display = sums[i];
  let usdValue = "";

  if (headers[i] === "wbtc_vsTokens") {
    const amount = sums[i] / 1e8;
    const value = amount * prices.BTC;
    totalVsTokensUSD += value;
    display = `${sums[i]} (${amount} WBTC)`;
    usdValue = ` = $${value.toFixed(2)}`;
  } else if (headers[i] === "weth_vsTokens") {
    const amount = sums[i] / 1e18;
    const value = amount * prices.ETH;
    totalVsTokensUSD += value;
    display = `${sums[i]} (${amount} ETH)`;
    usdValue = ` = $${value.toFixed(2)}`;
  } else if (headers[i] === "usdt_vsTokens" || headers[i] === "usdc_vsTokens") {
    const amount = sums[i] / 1e6;
    const value = amount * prices.STABLE;
    totalVsTokensUSD += value;
    usdValue = ` = $${value.toFixed(2)}`;
  } else if (headers[i].endsWith("_fsGLP") || headers[i] === "total_fsGLP") {
    const value = sums[i] * prices.fsGLP;
    usdValue = ` = $${value.toFixed(2)}`;
  }

  console.log(`${headers[i]}: ${display}${usdValue}`);

  if (headers[i] === "total_fsGLP") {
    console.log("\n=========================");
    console.log(`Total vsTokens USD Value: $${totalVsTokensUSD.toFixed(2)}`);
    console.log("=========================");
  }
}
