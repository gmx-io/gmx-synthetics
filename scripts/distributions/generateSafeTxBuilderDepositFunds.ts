import fs from "fs";
import path from "path";
import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { chunk } from "lodash";
import { GLV_V1_DISTRIBUTION_ID } from "../helpers";

/*
Reads a CSV and generates a Safe TX Builder JSON for depositing tokens via ClaimHandler.

Usage:
  CSV_PATH=path/to/file.csv \
  TOKEN_ADDRESS=token-to-distribute \
  npx hardhat --network arbitrum run scripts/distributions/generateSafeTxBuilderDepositFunds.ts

  Example for ethGlv archi distributions:
  ADDRESS_COLUMN=account AMOUNT_COLUMN=ethGlv_amount_wei CSV_PATH=out/archi_redistribution.csv TOKEN_ADDRESS=0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9 \
  npx hardhat --network arbitrum run scripts/distributions/generateSafeTxBuilderDepositFunds.ts

Env vars:
  DISTRIBUTION_ID  - distribution ID to use (default: GLV_V1_DISTRIBUTION_ID)
  CSV_PATH         - path to input CSV, relative to this script's directory (required)
  TOKEN_ADDRESS    - token address to distribute (required)
  BATCH_SIZE       - max items per batch (default: 50)
  ADDRESS_COLUMN   - CSV column name for address (default: "account")
  AMOUNT_COLUMN    - CSV column name for wei amount (default: "amount")
  MAX_BATCHES_PER_TX - max depositFunds batches per Safe TX file (default: 8)
*/

if (!process.env.CSV_PATH) throw new Error("CSV_PATH env var is required");
if (!process.env.TOKEN_ADDRESS) throw new Error("TOKEN_ADDRESS env var is required");

const DISTRIBUTION_ID = process.env.DISTRIBUTION_ID || GLV_V1_DISTRIBUTION_ID;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 50;
const ADDRESS_COLUMN = process.env.ADDRESS_COLUMN || "account";
const AMOUNT_COLUMN = process.env.AMOUNT_COLUMN || "amount";
const MAX_BATCHES_PER_TX = process.env.MAX_BATCHES_PER_TX ? parseInt(process.env.MAX_BATCHES_PER_TX) : 8;

async function main() {
  const CHAIN_ID = hre.network.config.chainId!;
  const csvPath = path.resolve(__dirname, process.env.CSV_PATH!);
  const csvBasename = path.basename(csvPath, path.extname(csvPath)) + `_${AMOUNT_COLUMN}`;
  console.log("Reading CSV: %s", csvPath);

  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");

  const addressIdx = headers.indexOf(ADDRESS_COLUMN);
  const weiIdx = headers.indexOf(AMOUNT_COLUMN);

  if (addressIdx === -1 || weiIdx === -1) {
    throw new Error(`CSV missing required columns. Headers: ${headers.join(", ")}`);
  }

  const distributions: { account: string; amount: BigNumber }[] = [];
  let totalAmount = BigNumber.from(0);

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(",");
    const account = fields[addressIdx];
    const amount = BigNumber.from(fields[weiIdx]);
    if (!account || !ethers.utils.isAddress(account)) continue;
    if (amount.lte(0)) continue;
    distributions.push({ account, amount });
    totalAmount = totalAmount.add(amount);
  }

  console.log("Addresses: %s", distributions.length);
  console.log("Total amount: %s (%s wei)\n", ethers.utils.formatEther(totalAmount), totalAmount.toString());

  const claimHandler = await hre.ethers.getContract("ClaimHandler");
  const batches = chunk(distributions, BATCH_SIZE);

  // Save Safe TX Builder JSON(s)
  const maxPerTx = MAX_BATCHES_PER_TX > 0 ? MAX_BATCHES_PER_TX : batches.length;
  const batchGroups = chunk(batches, maxPerTx);

  for (const [groupIdx, group] of batchGroups.entries()) {
    const groupTotal = group.flat().reduce((acc: BigNumber, { amount }) => acc.add(amount), BigNumber.from(0));
    const safeTxs: Record<string, unknown>[] = [];

    // 1. Approve ClaimHandler to spend token (for this group's total)
    safeTxs.push({
      to: TOKEN_ADDRESS,
      value: "0",
      data: null,
      contractMethod: {
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        name: "approve",
        payable: false,
      },
      contractInputsValues: {
        spender: claimHandler.address,
        amount: groupTotal.toString(),
      },
    });

    // 2. depositFunds for each batch in this group
    for (const batch of group) {
      safeTxs.push({
        to: claimHandler.address,
        value: "0",
        data: null,
        contractMethod: {
          inputs: [
            { name: "token", type: "address" },
            { name: "distributionId", type: "uint256" },
            {
              name: "params",
              type: "tuple[]",
              components: [
                { name: "account", type: "address" },
                { name: "amount", type: "uint256" },
              ],
            },
          ],
          name: "depositFunds",
          payable: false,
        },
        contractInputsValues: {
          token: TOKEN_ADDRESS,
          distributionId: DISTRIBUTION_ID,
          params: JSON.stringify(batch.map(({ account, amount }) => [account, amount.toString()])),
        },
      });
    }

    const suffix = batchGroups.length > 1 ? `_${groupIdx + 1}` : "";
    const safeTxPath = path.resolve(__dirname, `out/${csvBasename}_safeTx${suffix}.json`);
    fs.writeFileSync(
      safeTxPath,
      JSON.stringify(
        {
          version: "1.0",
          chainId: String(CHAIN_ID),
          meta: { name: `${csvBasename}${suffix}` },
          transactions: safeTxs,
        },
        null,
        2
      )
    );
    console.log("Safe TX Builder JSON written to: %s (%s transactions)", safeTxPath, safeTxs.length);
  }

  console.log("\nClaimHandler: %s", claimHandler.address);
  console.log("Distribution ID: %s", DISTRIBUTION_ID);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
