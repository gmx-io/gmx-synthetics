import { BigNumber } from "ethers";
import { formatUnits } from "ethers/lib/utils";
import { parse } from "fast-csv";
import fs from "fs";
import { applyFactor, bigNumberify, expandDecimals, parseDecimalToUnits } from "../../utils/math";
import { GLV_V1_3_MONTHS_BONUS_DISTRIBUTION_ID } from "../helpers";

const utils = ethers.utils;
const { getAddress } = utils;

type Row = {
  // account: string;
  // glv: string;
  // is_eligible_per_market: "TRUE" | "FALSE";
  // is_eligible_label: string;
  // glv_eligible_for_claim: string;
  // glv_eligible_for_claim_raw: string;
  // share: string;
  // "Share in USD": string;

  account: string;
  token: string;
  tokenName: string;
  shareFactor_beforeExcluding: BigNumber;
  shareFactor: BigNumber;
  shareUsd: BigNumber;

  amount: BigNumber;
};

const displayCount = process.env.DISPLAY ? parseInt(process.env.DISPLAY) : 0;

const ETH_GLV_ADDRESS = getAddress("0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9");
const BTC_GLV_ADDRESS = getAddress("0xdf03eed325b82bc1d4db8b49c30ecc9e05104b96");
// const USDC_ADDRESS = getAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");

const TOTAL_ETH_GLV_USD = parseDecimalToUnits("250_000");
const TOTAL_BTC_GLV_USD = parseDecimalToUnits("250_000");

const TOTAL_ETH_GLV_AMOUNT = expandDecimals(186_567, 18);
const TOTAL_BTC_GLV_AMOUNT = expandDecimals(177_116, 18);

const chainId = 42161;

const MIN_SHARE_USD = parseDecimalToUnits("0.50");

const tokenToTokenType = {
  [ETH_GLV_ADDRESS]: "ethGlv",
  [BTC_GLV_ADDRESS]: "btcGlv",
};

async function processFile({
  filePath,
  token,
  outputFile,
  totalUsd,
  totalAmount,
}: {
  filePath: string;
  token: { address: string; type: string; name: string };
  outputFile: string;
  totalUsd: BigNumber;
  totalAmount: BigNumber;
}) {
  console.log(`Processing ${token.name}`);

  const stream = fs.createReadStream(filePath).pipe(parse({ headers: true }));

  const rows: Row[] = [];

  const skips = {
    notEligible: 0,
    sizeTooSmall: 0,
  };

  for await (const rowRaw of stream) {
    if (rowRaw.is_eligible_per_market !== "TRUE" && rowRaw.is_eligible_per_market !== "FALSE") {
      throw new Error(`Invalid is_eligible_per_market: ${JSON.stringify(rowRaw)}`);
    }

    if (rowRaw.is_eligible_per_market === "FALSE") {
      // console.log("skipping non-eligible row", rowRaw.account, rowRaw.claimable_amount);
      skips.notEligible++;
      continue;
    }

    const newRow: Row = {
      account: getAddress(rowRaw.account),
      token: getAddress(rowRaw.glv),
      tokenName: tokenToTokenType[getAddress(rowRaw.glv)],
      shareFactor_beforeExcluding: parseDecimalToUnits(rowRaw.share),
      shareFactor: BigNumber.from(0),
      shareUsd: parseDecimalToUnits(rowRaw["Share in USD"].slice(1).replace(/,/g, "")),
      amount: BigNumber.from(0),
    };

    if (newRow.shareUsd.lt(MIN_SHARE_USD)) {
      skips.sizeTooSmall++;
      continue;
    }

    if (newRow.token !== token.address) {
      continue;
    }

    rows.push(newRow);
  }

  let sumUsd = bigNumberify(0);
  let sumFactor_beforeExcluding = bigNumberify(0);

  for (const row of rows) {
    sumUsd = sumUsd.add(row.shareUsd);
    sumFactor_beforeExcluding = sumFactor_beforeExcluding.add(row.shareFactor_beforeExcluding);
  }

  const amounts: Record<string, string> = {};

  const precision = expandDecimals(1, 30);
  let sumFactor = bigNumberify(0);
  for (const row of rows) {
    row.shareFactor = row.shareFactor_beforeExcluding.mul(precision).div(sumFactor_beforeExcluding);
    sumFactor = sumFactor.add(row.shareFactor);
  }

  for (const row of rows) {
    if (amounts[row.account]) {
      throw new Error(`Duplicate account: ${row.account}`);
    }

    row.amount = applyFactor(totalAmount, row.shareFactor);
    amounts[row.account] = row.amount.toString();
  }

  console.log(`total claims: ${rows.length}`);
  console.log(`total skips: ${skips.notEligible + skips.sizeTooSmall}`);
  console.log(`skips (not eligible): ${skips.notEligible}`);
  console.log(`skips (size too small): ${skips.sizeTooSmall}`);
  console.log("======");
  console.log("");

  console.log(`sum USD: ${formatUnits(sumUsd, 30)}`);
  console.log(`total USD: ${formatUnits(totalUsd, 30)}`);
  console.log(`sum factor (before excluding): ${formatUnits(sumFactor_beforeExcluding, 28)}%`);
  console.log(`sum factor: ${formatUnits(sumFactor, 28)}%`);
  console.log(`total amount: ${formatUnits(totalAmount, 18)} ${token.name}`);
  console.log("======");

  const output = {
    chainId,
    distributionTypeId: GLV_V1_3_MONTHS_BONUS_DISTRIBUTION_ID,
    token: token.address,
    amounts,
  };

  for (let i = 0; i < displayCount; i++) {
    console.log(formatRow(rows[i]));
  }

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
}

async function main() {
  await processFile({
    filePath: `scripts/distributions/data/glp/bonusGlvBtcDistribution.csv`,
    token: { address: BTC_GLV_ADDRESS, type: "btcGlv", name: "BTC GLV" },
    outputFile: `scripts/distributions/data/glp/GLP_GLV_3month-bonus_btcGlv.json`,
    totalUsd: TOTAL_BTC_GLV_USD,
    totalAmount: TOTAL_BTC_GLV_AMOUNT,
  });
  console.log();
  console.log("============================");
  console.log();
  await processFile({
    filePath: `scripts/distributions/data/glp/bonusGlvEthDistribution.csv`,
    token: { address: ETH_GLV_ADDRESS, type: "ethGlv", name: "ETH GLV" },
    outputFile: `scripts/distributions/data/glp/GLP_GLV_3month-bonus_ethGlv.json`,
    totalUsd: TOTAL_ETH_GLV_USD,
    totalAmount: TOTAL_ETH_GLV_AMOUNT,
  });
}

function formatRow(row: Row) {
  return `${row.account} | ${row.tokenName} | ${formatUnits(row.shareFactor_beforeExcluding, 28)}% | ${formatUnits(
    row.shareFactor,
    28
  )}% | ${formatUnits(row.amount, 18)} GLV`;
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
