import fs from "fs";
import { BigNumber, BigNumberish } from "ethers";

import { globSync } from "glob";
import prompts from "prompts";
import hre from "hardhat";
import { range } from "lodash";
import { bigNumberify, formatAmount } from "../../utils/math";
import path from "path";
import { getChainId, getDistributionTypeName } from "../helpers";
import { setTimeout } from "timers/promises";

/*
Example of usage:

npx hardhat --network arbitrum run scripts/distributions/setClaims.ts
*/

let write = process.env.WRITE === "true";

type DepositFundsParams = [
  string,
  BigNumberish,
  {
    account: string;
    amount: BigNumberish;
  }[]
];

const batchSize = 100;

const simulationAccount = process.env.SIMULATION_ACCOUNT;

async function main() {
  const { data, distributionTypeName, id } = await readDistributionFile();
  const tokens = await hre.gmx.getTokens();
  const tokenConfig = Object.values(tokens).find((token) => token.address.toLowerCase() === data.token.toLowerCase());

  if (!tokenConfig) {
    throw new Error(`Unrecognized token ${data.token}`);
  }
  const tokenDecimals = tokenConfig.decimals;

  const migrations = readMigrations();
  if (migrations[id] && !process.env.SKIP_MIGRATION_VALIDATION) {
    throw new Error(`Distribution ${id} was already sent. Run with SKIP_MIGRATION_VALIDATION=1 if this is expected`);
  }

  const [signer] = await hre.ethers.getSigners();

  if (write) {
    console.warn("WARN: sending real transaction...");
    await setTimeout(5000);
  }

  let totalAmount = bigNumberify(0);
  const accountsAndAmounts = Object.entries(data.amounts).map(([account, amount]) => ({
    account,
    amount: bigNumberify(amount),
  }));

  for (const amount of Object.values(data.amounts)) {
    totalAmount = totalAmount.add(amount);
  }

  console.log("token %s", data.token);
  console.log("total amount %s (%s)", formatAmount(totalAmount, tokenDecimals, 4, true), totalAmount.toString());
  console.log("recipients %s", Object.keys(data.amounts).length);
  console.log("distribution type %s %s", data.distributionTypeId, distributionTypeName);

  const signerAddress = await signer.getAddress();
  console.log("signer address: %s", signerAddress);

  const claimHandler = await hre.ethers.getContract("ClaimHandler");
  const tokenContract = await hre.ethers.getContractAt("MintableToken", data.token);

  const balance = await tokenContract.balanceOf(signerAddress);
  if (balance.lt(totalAmount)) {
    throw new Error(
      `Current balance ${formatAmount(balance, tokenDecimals, 2, true)} is lower than required ${formatAmount(
        totalAmount,
        tokenDecimals,
        2,
        true
      )}`
    );
  }
  console.log("balance is %s", formatAmount(balance, tokenDecimals, 2, true));

  const allowance = await tokenContract.allowance(signerAddress, claimHandler.address);
  console.log("total amount to send: %s", formatAmount(totalAmount, tokenDecimals, 4, true));
  console.log("current allowance is %s", formatAmount(allowance, tokenDecimals, 4, true));
  if (allowance.lt(totalAmount)) {
    console.log(
      "approving token %s amount %s spender %s",
      data.token,
      formatAmount(totalAmount, tokenDecimals, 4),
      claimHandler.address
    );
    const tx = await tokenContract.approve(claimHandler.address, totalAmount);
    console.log("sent approve txn %s, waiting...", tx.hash);
    await tx.wait();
    console.log("done");
  }

  const seenRecipients = new Set();
  for (const recipient of Object.keys(data.amounts)) {
    if (seenRecipients.has(recipient)) {
      throw new Error(`Duplicated recipient ${recipient}`);
    }
    seenRecipients.add(recipient);
  }

  const txHashes = [];
  const batchesInProgress = readBatchesInProgress(id);
  const batchesCount = Math.ceil(accountsAndAmounts.length / batchSize);
  const lastSentBatchIndex = batchesInProgress[id].lastSentBatchIndex;

  const firstRecipientIndex = (lastSentBatchIndex + 1) * batchSize;
  if (lastSentBatchIndex >= 0) {
    const firstRecipientIndex = (lastSentBatchIndex + 1) * batchSize;
    const firstRecipient = accountsAndAmounts[firstRecipientIndex].account;
    console.warn(
      "WARN: lastSentBatchIndex is %s, starting from index %s, first recipient: %s (%s)",
      lastSentBatchIndex,
      lastSentBatchIndex + 1,
      firstRecipientIndex,
      firstRecipient
    );
    await setTimeout(5000);
  }

  const batches: {
    from: number;
    to: number;
    batch: {
      account: string;
      amount: BigNumber;
    }[];
    batchIndex: number;
  }[] = [];
  for (const batchIndex of range(lastSentBatchIndex + 1, batchesCount)) {
    const from = batchIndex * batchSize;
    const to = Math.min(from + batchSize, accountsAndAmounts.length);
    const batch = accountsAndAmounts.slice(from, to);
    batches.push({
      from,
      to,
      batch,
      batchIndex,
    });
  }

  console.log("running simulation");
  for (const [i, { batchIndex, from, to, batch }] of batches.entries()) {
    console.log("simulating sending batch %s-%s token %s typeId %s", from, to, data.token, data.distributionTypeId);

    for (const [j, { account, amount }] of batch.entries()) {
      console.log(
        "%s recipient %s amount %s (%s)",
        firstRecipientIndex + i * batchSize + j,
        account,
        formatAmount(amount, tokenDecimals, 4, true),
        amount
      );
    }

    const params: DepositFundsParams = [data.token, data.distributionTypeId, batch];

    const result = await (simulationAccount
      ? claimHandler.connect(simulationAccount)
      : claimHandler
    ).callStatic.depositFunds(...params);
    console.log("simulation batch %s done, result %s", batchIndex, result);
  }

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transactions?",
    }));
  }

  if (write) {
    for (const [i, { batchIndex, from, to, batch }] of batches.entries()) {
      console.log("sending batch %s-%s token %s typeId %s", from, to, data.token, data.distributionTypeId);

      for (const [j, { account, amount }] of batch.entries()) {
        console.log(
          "%s recipient %s amount %s (%s)",
          firstRecipientIndex + i * batchSize + j,
          account,
          formatAmount(amount, tokenDecimals, 4, true),
          amount
        );
      }

      const params: DepositFundsParams = [data.token, data.distributionTypeId, batch];
      const gasLimit = await claimHandler.estimateGas.depositFunds(...params);

      const tx = await claimHandler.depositFunds(...params, {
        gasLimit: gasLimit.add(1_000_000),
      });
      console.log("sent batch txn %s, waiting...", tx.hash);
      txHashes.push(tx.hash);
      try {
        await tx.wait();
      } catch (ex) {
        console.error(
          "WARN: failed to wait for txn %s. manually check it's status and if it was mined update %s, set %s.lastSentBatchIndex to %s. otherwise deposits will be duplicated on the next run",
          tx.hash,
          getBatchesInProgressFilepath(),
          id,
          batchIndex
        );
        throw ex;
      }
      console.log("batch %s done", batchIndex);

      batchesInProgress[id].lastSentBatchIndex = batchIndex;
      saveBatchesInProgress(batchesInProgress);
    }

    if (txHashes.length) {
      console.log("sent %s transactions:", txHashes.length);
      for (const txHash of txHashes) {
        console.log(txHash);
      }
    }

    migrations[id] = Math.floor(Date.now() / 1000);
    saveMigrations(migrations);
    delete batchesInProgress[id];
    saveBatchesInProgress(batchesInProgress);
  } else {
    console.warn("WARN: read-only mode. skip sending transaction");
  }
}

type Migrations = Record<string, number>;

function getMigrationsFilepath() {
  return path.join(__dirname, ".migrations.json");
}

function saveMigrations(migrations: Migrations) {
  const filepath = getMigrationsFilepath();
  console.log("writing migrations %j to file %s", migrations, filepath);
  fs.writeFileSync(filepath, JSON.stringify(migrations, null, 4));
}

function readMigrations(): Migrations {
  const filepath = getMigrationsFilepath();
  if (!fs.existsSync(filepath)) {
    return {};
  }
  const content = fs.readFileSync(filepath);
  return JSON.parse(content.toString());
}

type BatchesInProgress = Record<string, { lastSentBatchIndex: number }>;

function getBatchesInProgressFilepath(): string {
  return path.join(__dirname, ".batchesInProgress.json");
}

function saveBatchesInProgress(batches: BatchesInProgress) {
  const filepath = getBatchesInProgressFilepath();
  console.log("writing batches in progress %j to file %s", batches, filepath);
  fs.writeFileSync(filepath, JSON.stringify(batches, null, 4));
}

function readBatchesInProgress(dataId: string): BatchesInProgress {
  const filepath = getBatchesInProgressFilepath();
  let ret: BatchesInProgress = {};
  if (fs.existsSync(filepath)) {
    const content = fs.readFileSync(filepath);
    ret = JSON.parse(content.toString());
  }
  if (dataId in ret) {
    if (!("lastSentBatchIndex" in ret[dataId])) {
      throw new Error("`lastSentBatchIndex` is missing");
    }
    if (ret[dataId].lastSentBatchIndex < 0) {
      throw new Error("`lastSentBatchIndex` should be greater or equal to zero");
    }
  } else {
    ret[dataId] = {
      lastSentBatchIndex: -1, // -1 means no batches were sent before
    };
  }
  return ret;
}

async function readDistributionFile() {
  let filepath: string;
  if (process.env.FILENAME) {
    const filename = process.env.FILENAME;
    filepath = filename.startsWith("/") ? filename : path.join(process.cwd(), filename);
  } else {
    const dataDir = path.join(__dirname, "data");
    const files = globSync(`${dataDir}/**/*.json`);
    if (files.length === 0) {
      throw new Error(`No distribution files found in ${dataDir}/ and FILENAME is not set`);
    }
    ({ filepath } = await prompts({
      type: "select",
      name: "filepath",
      message: "Select distribution file",
      choices: files.map((file) => ({ title: file.split("/data/")[1], value: file })),
    }));
  }

  console.log("reading file %s", filepath);
  const data: {
    token: string;
    amounts: Record<string, string>;
    chainId: number;
    distributionTypeId: number;
  } = JSON.parse(fs.readFileSync(filepath).toString());

  if (!data.token) {
    throw new Error("Invalid file format. It should contain `token` string");
  }
  if (!data.amounts || typeof data.amounts !== "object") {
    throw new Error("Invalid file format. It should contain `amounts` object");
  }
  if (!data.distributionTypeId) {
    throw new Error("Invalid file format. It should contain `distributionTypeId` number");
  }
  const distributionTypeName = getDistributionTypeName(data.distributionTypeId);
  if (!distributionTypeName) {
    throw new Error(`Unknown distribution type id ${data.distributionTypeId}`);
  }
  if (!data.chainId) {
    throw new Error("Invalid file format. It should contain `chainId` number");
  }
  if (data.chainId !== getChainId()) {
    throw new Error(`Invalid current chain id: ${getChainId()}, distribution chain id: ${data.chainId}`);
  }

  const id = filepath.split("/").pop().split(".")[0];

  return {
    id,
    data,
    distributionTypeName,
  };
}

if (require.main === module) {
  main()
    .then(() => {
      console.log("done");
      process.exit(0);
    })
    .catch((ex) => {
      console.error(ex);
      process.exit(1);
    });
}
