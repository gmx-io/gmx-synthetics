import fs from "fs";
import { parse } from "fast-csv";
import { bigNumberify, parseDecimalToUnits, PRECISION } from "../utils/math";

async function getSummary(filePath) {
  const stream = fs.createReadStream(filePath).pipe(parse({ headers: true }));

  let sharesInFile = bigNumberify(0);
  let glpInFile = bigNumberify(0);
  let rowCount = 0;

  for await (const row of stream) {
    const share = parseDecimalToUnits(row.distribution_share);
    const glpBalance = parseDecimalToUnits(row.balance_before_event);
    sharesInFile = sharesInFile.add(share);
    glpInFile = glpInFile.add(glpBalance);
    rowCount++;
  }
  console.log(`${filePath} total shares: ${ethers.utils.formatUnits(sharesInFile, PRECISION)}`);
  console.log(`${filePath} total GLP: ${ethers.utils.formatUnits(glpInFile, PRECISION)}`);
  console.log(`${filePath} total accounts: ${rowCount}`);

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
