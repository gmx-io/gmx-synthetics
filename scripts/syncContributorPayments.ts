// scripts/sync.ts
import hre from "hardhat";
import fs from "fs";
import path from "path";
import { parse as fastParse } from "@fast-csv/parse";
import { signExternally } from "../utils/signer";
import { bigNumberify } from "../utils/math";
import * as keys from "../utils/keys";

type Row = Record<string, string>;

const TOKENS = ["GMX", "USDC"];

const sanitizeNumeric = (s?: string) =>
  String(s ?? "0")
    .replace(/,/g, "")
    .trim() || "0";

// fast-csv reader (streaming)
function readCsvFile(filePath: string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    fs.createReadStream(filePath)
      .pipe(
        fastParse<Row, Row>({
          headers: true,
          ignoreEmpty: true,
          trim: true,
        })
      )
      .on("error", reject)
      .on("data", (row: Row) => rows.push(row))
      .on("end", () => resolve(rows));
  });
}

async function main() {
  if (!TOKENS.length) throw new Error("TOKENS is empty.");

  const [signer] = await hre.ethers.getSigners();

  // Contracts via hardhat-deploy
  const contributorHandler = await hre.ethers.getContract("ContributorHandler", signer);
  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3"); // ← added

  // Token metadata via hre.gmx.getTokens()
  const tokensMeta = await (hre as any).gmx.getTokens();
  const tokenAddressesBySymbol: Record<string, string> = {};
  const tokenDecimalsBySymbol: Record<string, number> = {};
  for (const symbol of TOKENS) {
    const meta = tokensMeta[symbol];
    if (!meta?.address || meta.decimals == null) throw new Error(`Token ${symbol} missing in hre.gmx.getTokens()`);
    tokenAddressesBySymbol[symbol] = meta.address;
    tokenDecimalsBySymbol[symbol] = Number(meta.decimals);
  }

  // Read all CSVs in data/payments
  const csvDirectory = path.resolve("data/payments");
  const csvFiles = fs
    .readdirSync(csvDirectory)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(csvDirectory, f));
  if (!csvFiles.length) throw new Error("No CSV files in data/payments/");

  // Aggregate per account per token
  const desiredAmountsByAccount: Record<string, Record<string, any>> = {};
  const csvAccountsSet = new Set<string>();

  for (const csvFilePath of csvFiles) {
    const rows = await readCsvFile(csvFilePath);
    for (const row of rows) {
      const account = row.Address.trim().toLowerCase();
      if (!account) continue;
      if (account === "-") continue;
      if (!ethers.utils.isAddress(account)) {
        throw new Error(`Invalid address: ${account}`);
      }

      csvAccountsSet.add(account);
      desiredAmountsByAccount[account] ||= {};

      for (const symbol of TOKENS) {
        const cell = row[symbol];
        if (!cell) continue;
        const decimals = tokenDecimalsBySymbol[symbol];
        const parsedAmount = hre.ethers.utils.parseUnits(sanitizeNumeric(cell), decimals);
        console.log(`${account}: ${parsedAmount.toString()} ${symbol}`);
        desiredAmountsByAccount[account][symbol] = (desiredAmountsByAccount[account][symbol] ?? bigNumberify(0)).add(
          parsedAmount
        );
      }
    }
  }

  // On-chain account list (diff using keys.CONTRIBUTOR_ACCOUNT_LIST)
  const onchainAddressList: string[] = await dataStore.getAddressValuesAt(keys.CONTRIBUTOR_ACCOUNT_LIST, 0, 1000);
  const onchainAccountSet = new Set(onchainAddressList.map((a) => a.toLowerCase()));

  // ------------------------------------------------------------
  // NEW: bulk read current values via Multicall3 and DataStore.getUint
  // ------------------------------------------------------------
  type Pair = { account: string; tokenAddr: string; desired: any };
  const accountTokenPairs: Pair[] = [];
  for (const [account, tokenMap] of Object.entries(desiredAmountsByAccount)) {
    for (const symbol of TOKENS) {
      const desired = tokenMap[symbol] ?? bigNumberify(0);
      accountTokenPairs.push({ account, tokenAddr: tokenAddressesBySymbol[symbol], desired });
    }
  }

  const dataStoreInterface = dataStore.interface;
  const readCalls = accountTokenPairs.map((p) => ({
    target: dataStore.address,
    callData: dataStoreInterface.encodeFunctionData("getUint", [
      keys.contributorTokenAmountKey(p.account, p.tokenAddr),
    ]),
  }));

  const currentValuesByAccountToken: Record<string, Record<string, any>> = {};
  if (readCalls.length) {
    const result = await multicall.callStatic.aggregate3(readCalls);
    for (let i = 0; i < result.length; i++) {
      const p = accountTokenPairs[i];
      const [val] = dataStoreInterface.decodeFunctionResult("getUint", result[i].returnData) as [any];
      (currentValuesByAccountToken[p.account] ||= {})[p.tokenAddr] = val;
    }
  }
  // ------------------------------------------------------------

  // Build calls
  const encodedFunctionCalls: string[] = [];

  // add/remove accounts
  for (const account of csvAccountsSet) {
    if (!onchainAccountSet.has(account)) {
      console.log(`add ${account}`);
      encodedFunctionCalls.push(contributorHandler.interface.encodeFunctionData("addContributorAccount", [account]));
    }
  }
  for (const account of onchainAccountSet) {
    if (!csvAccountsSet.has(account)) {
      console.log(`remove ${account}`);
      encodedFunctionCalls.push(contributorHandler.interface.encodeFunctionData("removeContributorAccount", [account]));
    }
  }

  // setContributorAmount per account — ONLY IF NEEDED (diff vs on-chain)
  const totalsBySymbol: Record<string, any> = {};
  for (const [account, tokenMap] of Object.entries(desiredAmountsByAccount)) {
    const tokenAddressesToSet: string[] = [];
    const amountsToSet: any[] = [];
    for (const symbol of TOKENS) {
      const desired = tokenMap[symbol] ?? bigNumberify(0);
      const tokenAddr = tokenAddressesBySymbol[symbol];
      const current = currentValuesByAccountToken[account]?.[tokenAddr] ?? bigNumberify(0);
      totalsBySymbol[symbol] = (totalsBySymbol[symbol] ?? bigNumberify(0)).add(desired);
      if (!current.eq(desired)) {
        tokenAddressesToSet.push(tokenAddr);
        amountsToSet.push(desired);
      }
    }
    if (tokenAddressesToSet.length) {
      for (let i = 0; i < tokenAddressesToSet.length; i++) {
        console.log("set", account, tokenAddressesToSet[i], amountsToSet[i].toString());
      }

      encodedFunctionCalls.push(
        contributorHandler.interface.encodeFunctionData("setContributorAmount", [
          account,
          tokenAddressesToSet,
          amountsToSet,
        ])
      );
    }
  }

  // Totals (with commas / without)
  const formatAmountWithCommas = (x: any, decimals: number) => {
    const s = hre.ethers.utils.formatUnits(x, decimals);
    return `${Number(s).toLocaleString("en-US")}`;
  };

  console.log("CSV files:", csvFiles.length);
  console.log("Unique CSV accounts:", csvAccountsSet.size);
  for (const symbol of TOKENS) {
    console.log(
      `${symbol} total: ${formatAmountWithCommas(
        totalsBySymbol[symbol] ?? bigNumberify(0),
        tokenDecimalsBySymbol[symbol]
      )}`
    );
  }
  console.log("Encoded calls:", encodedFunctionCalls.length);

  const shouldWrite = process.env.WRITE === "true";
  if (shouldWrite) {
    await signExternally(await contributorHandler.populateTransaction.multicall(encodedFunctionCalls));
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
