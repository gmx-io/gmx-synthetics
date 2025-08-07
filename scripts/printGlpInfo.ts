import fs from "fs";
import { parse } from "fast-csv";
import { bigNumberify, parseDecimalToUnits, PRECISION } from "../utils/math";

async function getSummary(filePath) {
  const stream = fs.createReadStream(filePath).pipe(parse({ headers: true }));

  let sharesInFile = bigNumberify(0);
  let glpInFile = bigNumberify(0);
  let rowCount = 0;

  const sharesInTop = {
    100: bigNumberify(0),
    200: bigNumberify(0),
    300: bigNumberify(0),
    400: bigNumberify(0),
    500: bigNumberify(0),
  };

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
  }

  console.log(`${filePath} total shares: ${ethers.utils.formatUnits(sharesInFile, PRECISION)}`);
  console.log(`${filePath} total GLP: ${ethers.utils.formatUnits(glpInFile, PRECISION)}`);
  console.log(`${filePath} total accounts: ${rowCount}`);
  console.log(`${filePath} shares in top 100: ${ethers.utils.formatUnits(sharesInTop["100"], PRECISION)}`);
  console.log(`${filePath} shares in top 200: ${ethers.utils.formatUnits(sharesInTop["200"], PRECISION)}`);
  console.log(`${filePath} shares in top 300: ${ethers.utils.formatUnits(sharesInTop["300"], PRECISION)}`);
  console.log(`${filePath} shares in top 400: ${ethers.utils.formatUnits(sharesInTop["400"], PRECISION)}`);
  console.log(`${filePath} shares in top 500: ${ethers.utils.formatUnits(sharesInTop["500"], PRECISION)}`);

  return { sharesInFile, glpInFile };
}

async function main() {
  const filePaths = [
    "./data/GLP_GLV-for-CONTRACT.csv",
    "./data/GLP_GLV-for-EOA-and-SAFE.csv",
    "./data/GLP_USDC-for-CONTRACT.csv",
    "./data/GLP_USDC-for-EOA-and-SAFE.csv",
  ];

  let totalGlp = bigNumberify(0);

  for (const filePath of filePaths) {
    console.log(filePath);
    const { glpInFile } = await getSummary(filePath);
    totalGlp = totalGlp.add(glpInFile);
  }

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
