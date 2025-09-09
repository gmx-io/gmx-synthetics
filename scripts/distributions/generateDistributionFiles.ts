import fs from "fs";
import { parse, writeToPath } from "fast-csv";
import { bigNumberify, parseDecimalToUnits, expandDecimals, FLOAT_PRECISION, PRECISION } from "../../utils/math";
import { chunk } from "lodash";

const ETH_GLV_PRICE = parseDecimalToUnits("1.4876");
const BTC_GLV_PRICE = parseDecimalToUnits("1.6269");

const ETH_GLV_ADDRESS = "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9";
const BTC_GLV_ADDRESS = "0xdf03eed325b82bc1d4db8b49c30ecc9e05104b96";
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

const maxBatches = process.env.MAX_TXN_BATCHES ? parseInt(process.env.MAX_TXN_BATCHES) : 10;

async function saveCsvFile(filePath, outputRows) {
  await new Promise((resolve, reject) => {
    writeToPath(filePath, outputRows, { headers: true }).on("error", reject).on("finish", resolve);
  });
}

const distributionId = "11802763389053472339483616176459046875189472617101418668457790595837638713068";
const chainId = 42161;

async function getSummary(file) {
  const filePath = `${__dirname}/data/${file.name}.csv`;
  const stream = fs.createReadStream(filePath).pipe(parse({ headers: true }));

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

  const infoRows = [];
  const distributionRows = {
    ethGlv: [],
    btcGlv: [],
    usdc: [],
  };

  for await (const row of stream) {
    const { account } = row;
    const share = parseDecimalToUnits(row.distribution_share);
    const glpBalance = parseDecimalToUnits(row.balance_before_event);
    sharesInFile = sharesInFile.add(share);
    glpInFile = glpInFile.add(glpBalance);
    rowCount++;

    if (rowCount <= 100) {
      sharesInTop["100"] = sharesInTop["100"].add(share);
    }
    if (rowCount <= 200) {
      sharesInTop["200"] = sharesInTop["200"].add(share);
    }
    if (rowCount <= 300) {
      sharesInTop["300"] = sharesInTop["300"].add(share);
    }
    if (rowCount <= 400) {
      sharesInTop["400"] = sharesInTop["400"].add(share);
    }
    if (rowCount <= 500) {
      sharesInTop["500"] = sharesInTop["500"].add(share);
    }

    const ethGlvAmount = totalEthGlv.mul(share).div(FLOAT_PRECISION);
    const btcGlvAmount = totalBtcGlv.mul(share).div(FLOAT_PRECISION);
    const usdcAmount = totalUsdc.mul(share).div(FLOAT_PRECISION);

    const ethGlvUsd = ethGlvAmount.mul(ETH_GLV_PRICE).div(FLOAT_PRECISION);
    const btcGlvUsd = btcGlvAmount.mul(BTC_GLV_PRICE).div(FLOAT_PRECISION);
    const distributionUsd = ethGlvUsd.add(btcGlvUsd).add(usdcAmount);

    const infoRow = {
      account,
      ethGlv: ethers.utils.formatUnits(ethGlvAmount, PRECISION),
      btcGlv: ethers.utils.formatUnits(btcGlvAmount, PRECISION),
      usdc: ethers.utils.formatUnits(usdcAmount, PRECISION),
      distributionUsd: ethers.utils.formatUnits(distributionUsd, PRECISION),
      duneEstimatedDistributionUsd: row.approximate_distribution_usd,
    };

    infoRows.push(infoRow);
    if (ethGlvAmount.gt(0)) {
      distributionRows.ethGlv.push({
        account,
        token: ETH_GLV_ADDRESS,
        amount: ethGlvAmount.div(expandDecimals(1, PRECISION - 18)).toString(),
      });
    }

    if (btcGlvAmount.gt(0)) {
      distributionRows.btcGlv.push({
        account,
        token: BTC_GLV_ADDRESS,
        amount: btcGlvAmount.div(expandDecimals(1, PRECISION - 18)).toString(),
      });
    }

    if (usdcAmount.gt(0)) {
      distributionRows.usdc.push({
        account,
        token: BTC_GLV_ADDRESS,
        amount: usdcAmount.div(expandDecimals(1, PRECISION - 6)).toString(),
      });
    }

    // console.log(`${outputRow.account}: ${outputRow.distributionUsd}, ${outputRow.duneEstimatedDistributionUsd}`);
  }

  console.log(`${file.name} total shares: ${ethers.utils.formatUnits(sharesInFile, PRECISION)}`);
  console.log(`${file.name} total GLP: ${ethers.utils.formatUnits(glpInFile, PRECISION)}`);
  console.log(`${file.name} total accounts: ${rowCount}`);
  console.log(`${file.name} shares in top 100: ${ethers.utils.formatUnits(sharesInTop["100"], PRECISION)}`);
  console.log(`${file.name} shares in top 200: ${ethers.utils.formatUnits(sharesInTop["200"], PRECISION)}`);
  console.log(`${file.name} shares in top 300: ${ethers.utils.formatUnits(sharesInTop["300"], PRECISION)}`);
  console.log(`${file.name} shares in top 400: ${ethers.utils.formatUnits(sharesInTop["400"], PRECISION)}`);
  console.log(`${file.name} shares in top 500: ${ethers.utils.formatUnits(sharesInTop["500"], PRECISION)}`);

  await saveCsvFile(`${__dirname}/out/${file.name}.csv`, infoRows);

  return { sharesInFile, glpInFile, infoRows, distributionRows };
}

async function main() {
  const files = [
    {
      name: "GLP_GLV-for-CONTRACT",
      ethGlv: "1120591.39",
      btcGlv: "1030973.33",
      usdc: "0",
      filterBySmartWallet: true,
    },
    {
      name: "GLP_GLV-for-EOA-and-SAFE",
      ethGlv: "8506066.32",
      btcGlv: "7825803.11",
      usdc: "0",
    },
    // {
    //   name: "GLP_USDC-for-CONTRACT",
    //   ethGlv: "0",
    //   btcGlv: "0",
    //   usdc: "13140880.47",
    // },
    {
      name: "GLP_USDC-for-EOA-and-SAFE",
      ethGlv: "0",
      btcGlv: "0",
      usdc: "883940.81",
    },
  ];

  let totalGlp = bigNumberify(0);
  const claimHandler = await hre.ethers.getContract("ClaimHandler");

  let allInfoRows = [];
  for (const file of files) {
    const { glpInFile, infoRows, distributionRows } = await getSummary(file);
    const smartWallets = file.filterBySmartWallet ? await getSmartWallet(file.name) : [];
    allInfoRows = allInfoRows.concat(infoRows);
    totalGlp = totalGlp.add(glpInFile);

    let distributionRowsForDistribution = distributionRows;
    let name = file.name;
    if (file.filterBySmartWallet) {
      distributionRowsForDistribution = {
        ethGlv: distributionRows.ethGlv.filter((row) => smartWallets.includes(row.account.toLowerCase())),
        btcGlv: distributionRows.btcGlv.filter((row) => smartWallets.includes(row.account.toLowerCase())),
        usdc: distributionRows.usdc.filter((row) => smartWallets.includes(row.account.toLowerCase())),
      };
      name = `${name}_smart-wallets`;
    }
    await saveTxnPayload(claimHandler, name, distributionRowsForDistribution);
    await saveDistribution(name, distributionRowsForDistribution);
  }

  await saveCsvFile(`${__dirname}/out/glp-distribution.csv`, allInfoRows);

  console.log(`total GLP: ${ethers.utils.formatUnits(totalGlp, PRECISION)}`);
}

const tokenTypeToToken = {
  ethGlv: ETH_GLV_ADDRESS,
  btcGlv: BTC_GLV_ADDRESS,
  usdc: USDC_ADDRESS,
};

async function saveDistribution(
  name: string,
  distributionRows: Record<string, { account: string; token: string; amount: string }[]>
) {
  for (const tokenType of ["ethGlv", "btcGlv", "usdc"]) {
    const rows = distributionRows[tokenType];
    if (!rows) {
      throw new Error(`No rows for token type ${tokenType}`);
    }
    if (rows.length === 0) {
      continue;
    }

    const token = tokenTypeToToken[tokenType];
    if (!token) {
      throw new Error(`Unknown token type ${tokenType}`);
    }

    const distributionDir = `${__dirname}/data/glp`;
    if (!fs.existsSync(distributionDir)) {
      fs.mkdirSync(distributionDir, { recursive: true });
    }
    const distributionPath = `${distributionDir}/${name}_${tokenType}.json`;
    fs.writeFileSync(
      distributionPath,
      JSON.stringify(
        {
          chainId,
          distributionTypeId: distributionId,
          token,
          totalAmount: rows.reduce((acc, { amount }) => acc.add(amount), bigNumberify(0)).toString(),
          amounts: rows.reduce((acc, { account, amount }) => {
            acc[account] = amount.toString();
            return acc;
          }, {} as Record<string, string>),
        },
        null,
        2
      )
    );
    console.log(`${name} ${tokenType} distribution saved to ${distributionPath}`);
  }
}

async function getSmartWallet(name: string) {
  const excludedAccounts = [
    // funds for these accounts were already distributed
    "0xb81a869025fa244a9841d86630996368857a6e86",
  ].map((account) => account.toLowerCase());

  const filePath = `${__dirname}/out/${name}-analyzed.csv`;
  const stream = fs.createReadStream(filePath).pipe(parse({ headers: true }));

  const smartWallets = [];
  for await (const row of stream) {
    const { account } = row;
    if (excludedAccounts.includes(account.toLowerCase())) {
      console.warn(`Skipping excluded account: ${account}`);
      continue;
    }
    if (row.isSmartContractWallet === "yes") {
      smartWallets.push(account);
    }
  }
  return smartWallets;
}

async function saveTxnPayload(
  claimHandler: any,
  name: string,
  distributionRows: Record<string, { account: string; token: string; amount: string }[]>
) {
  for (const tokenType of ["ethGlv", "btcGlv", "usdc"]) {
    const rows = distributionRows[tokenType];
    if (!rows) {
      throw new Error(`No rows for token type ${tokenType}`);
    }
    if (rows.length === 0) {
      continue;
    }
    const token = tokenTypeToToken[tokenType];
    if (!token) {
      throw new Error(`Unknown token type ${tokenType}`);
    }

    const txnPayloadDir = `${__dirname}/out/glp-distribution-txn-payload/${name}/${tokenType}`;
    if (!fs.existsSync(txnPayloadDir)) {
      fs.mkdirSync(txnPayloadDir, { recursive: true });
    }

    const batches = chunk(rows, 50);

    for (const [i, batch] of (
      batches.slice(0, maxBatches) as { account: string; token: string; amount: string }[][]
    ).entries()) {
      const params = [token, distributionId, batch.map(({ account, amount }) => ({ account, amount }))];
      const txnPayload = claimHandler.interface.encodeFunctionData("depositFunds", params);
      const totalAmount = batch.reduce((acc, { amount }) => acc.add(amount), bigNumberify(0));

      fs.writeFileSync(
        `${txnPayloadDir}/${i}.json`,
        JSON.stringify(
          { chainId, totalAmount: totalAmount.toString(), tokenAddress: token, batchIndex: i, params, txnPayload },
          null,
          2
        )
      );
    }
    const savedBatchesCount = Math.min(maxBatches, batches.length);
    console.log(
      `${name} ${tokenType} txn payload saved to ${txnPayloadDir}/ (${savedBatchesCount} of ${batches.length} batches)`
    );
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
