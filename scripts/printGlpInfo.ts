import fs from "fs";
import { parse, writeToPath } from "fast-csv";
import { bigNumberify, parseDecimalToUnits, FLOAT_PRECISION, PRECISION } from "../utils/math";

const ETH_GLV_PRICE = parseDecimalToUnits("1.4876");
const BTC_GLV_PRICE = parseDecimalToUnits("1.6269");

async function getSummary(file) {
  const stream = fs.createReadStream(file.path).pipe(parse({ headers: true }));

  let sharesInFile = bigNumberify(0);
  let glpInFile = bigNumberify(0);
  let rowCount = 0;

  const totalEthGlv = parseDecimalToUnits(file.ethGlv);
  const totalBtcGlv = parseDecimalToUnits(file.btcGlv);
  const totalUsdc = parseDecimalToUnits(file.usdc);

  const sharesInTop = {
    100: bigNumberify(0),
    200: bigNumberify(0),
    300: bigNumberify(0),
    400: bigNumberify(0),
    500: bigNumberify(0),
  };

  const outputRowsForFile = [];

  for await (const row of stream) {
    const share = parseDecimalToUnits(row.distribution_share);
    const glpBalance = parseDecimalToUnits(row.balance_before_event);
    sharesInFile = sharesInFile.add(share);
    glpInFile = glpInFile.add(glpBalance);
    rowCount++;

    if (rowCount < 100) {
      sharesInTop["100"] = sharesInTop["100"].add(share);
    }
    if (rowCount < 200) {
      sharesInTop["200"] = sharesInTop["200"].add(share);
    }
    if (rowCount < 300) {
      sharesInTop["300"] = sharesInTop["300"].add(share);
    }
    if (rowCount < 400) {
      sharesInTop["400"] = sharesInTop["400"].add(share);
    }
    if (rowCount < 500) {
      sharesInTop["500"] = sharesInTop["500"].add(share);
    }

    const ethGlv = totalEthGlv.mul(share).div(FLOAT_PRECISION);
    const btcGlv = totalBtcGlv.mul(share).div(FLOAT_PRECISION);
    const usdc = totalUsdc.mul(share).div(FLOAT_PRECISION);

    const ethGlvUsd = ethGlv.mul(ETH_GLV_PRICE).div(FLOAT_PRECISION);
    const btcGlvUsd = btcGlv.mul(BTC_GLV_PRICE).div(FLOAT_PRECISION);
    const distributionUsd = ethGlvUsd.add(btcGlvUsd).add(usdc);

    const outputRow = {
      account: row.account,
      ethGlv: ethers.utils.formatUnits(ethGlv, PRECISION),
      btcGlv: ethers.utils.formatUnits(btcGlv, PRECISION),
      usdc: ethers.utils.formatUnits(usdc, PRECISION),
      distributionUsd: ethers.utils.formatUnits(distributionUsd, PRECISION),
      duneEstimatedDistributionUsd: row.approximate_distribution_usd,
    };

    outputRowsForFile.push(outputRow);

    // console.log(`${outputRow.account}: ${outputRow.distributionUsd}, ${outputRow.duneEstimatedDistributionUsd}`);
  }

  console.log(`${file.path} total shares: ${ethers.utils.formatUnits(sharesInFile, PRECISION)}`);
  console.log(`${file.path} total GLP: ${ethers.utils.formatUnits(glpInFile, PRECISION)}`);
  console.log(`${file.path} total accounts: ${rowCount}`);
  console.log(`${file.path} shares in top 100: ${ethers.utils.formatUnits(sharesInTop["100"], PRECISION)}`);
  console.log(`${file.path} shares in top 200: ${ethers.utils.formatUnits(sharesInTop["200"], PRECISION)}`);
  console.log(`${file.path} shares in top 300: ${ethers.utils.formatUnits(sharesInTop["300"], PRECISION)}`);
  console.log(`${file.path} shares in top 400: ${ethers.utils.formatUnits(sharesInTop["400"], PRECISION)}`);
  console.log(`${file.path} shares in top 500: ${ethers.utils.formatUnits(sharesInTop["500"], PRECISION)}`);

  return { sharesInFile, glpInFile, outputRowsForFile };
}

async function main() {
  const files = [
    {
      path: "./data/GLP_GLV-for-CONTRACT.csv",
      ethGlv: "1120591.39",
      btcGlv: "1030973.33",
      usdc: "0",
    },
    {
      path: "./data/GLP_GLV-for-EOA-and-SAFE.csv",
      ethGlv: "8506066.32",
      btcGlv: "7825803.11",
      usdc: "0",
    },
    {
      path: "./data/GLP_USDC-for-CONTRACT.csv",
      ethGlv: "0",
      btcGlv: "0",
      usdc: "13140880.47",
    },
    {
      path: "./data/GLP_USDC-for-EOA-and-SAFE.csv",
      ethGlv: "0",
      btcGlv: "0",
      usdc: "883940.81",
    },
  ];

  let totalGlp = bigNumberify(0);

  let outputRows = [];
  for (const file of files) {
    const { glpInFile, outputRowsForFile } = await getSummary(file);
    outputRows = outputRows.concat(outputRowsForFile);
    totalGlp = totalGlp.add(glpInFile);
  }

  await new Promise((resolve, reject) => {
    writeToPath("./out/glp-distribution.csv", outputRows, { headers: true }).on("error", reject).on("finish", resolve);
  });

  console.log(`total GLP: ${ethers.utils.formatUnits(totalGlp, PRECISION)}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
