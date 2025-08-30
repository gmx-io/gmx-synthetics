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

allow top up from safe:
TOP_UP_FROM_SAFE=1 npx hardhat --network arbitrum run scripts/distributions/setClaims.ts

limit top up from safe:
TOP_UP_FROM_SAFE=1 MAX_TOP_UP_FROM_SAFE=123 npx hardhat --network arbitrum run scripts/distributions/setClaims.ts
*/

type DepositFundsParams = [
  string,
  BigNumberish,
  {
    account: string;
    amount: BigNumberish;
  }[]
];

const additionalTokensDecimals = {
  "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9": 18, // ETH GLV
  "0xdf03eed325b82bc1d4db8b49c30ecc9e05104b96": 18, // BTC GLV
};

const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 100;

const simulationAccount = process.env.SIMULATION_ACCOUNT;
const skipEmptyClaimableAmountValidation = process.env.SKIP_EMPTY_CLAIMABLE_AMOUNT_VALIDATION === "1";
const skipMigrationValidation = process.env.SKIP_MIGRATION_VALIDATION === "1";
const skipSimulation = process.env.SKIP_SIMULATION === "1";

// top up from safe was used for GLP distribution
const topUpFromSafe = process.env.TOP_UP_FROM_SAFE === "1";
const maxTopUpFromSafe = process.env.MAX_TOP_UP_FROM_SAFE ? bigNumberify(process.env.MAX_TOP_UP_FROM_SAFE) : undefined;
const SAFE_ADDRESS = "0xD2E217d800C41c86De1e01FD72009d4Eafc539a3";

// for testing only
const skipConfirmations = process.env.SKIP_CONFIRMATIONS === "1";

async function main() {
  const migrations = readMigrations();

  const { data, distributionTypeName, id } = await readDistributionFile(migrations);
  const tokens = await hre.gmx.getTokens();
  const tokenConfig = Object.values(tokens).find((token) => token.address.toLowerCase() === data.token.toLowerCase());
  const multicall = await hre.ethers.getContract("Multicall3");

  let tokenDecimals: number;
  if (tokenConfig) {
    tokenDecimals = tokenConfig.decimals;
  } else if (data.token in additionalTokensDecimals) {
    tokenDecimals = additionalTokensDecimals[data.token];
  } else {
    throw new Error(`Unrecognized token ${data.token}`);
  }

  if (migrations[id] && !skipMigrationValidation) {
    throw new Error(`Distribution ${id} was already sent. Run with SKIP_MIGRATION_VALIDATION=1 if this is expected`);
  }

  const [signer] = await hre.ethers.getSigners();

  let totalAmount = bigNumberify(0);
  let accountsAndAmounts = Object.entries(data.amounts)
    .map(([account, amount]) => ({
      account,
      amount: bigNumberify(amount),
    }))
    .sort((a, b) => {
      // sort to make the order stable
      // NOTE. distribution files should never be updated during a distribution
      if (a.amount.eq(b.amount)) {
        return 0;
      }
      return a.amount.lt(b.amount) ? 1 : -1;
    });

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

  await transferFundsFromSafe(tokenContract, signerAddress, totalAmount, tokenDecimals);
  await checkBalance(tokenContract, signerAddress, totalAmount, tokenDecimals);
  await checkAllowance(tokenContract, claimHandler, data, signerAddress, totalAmount, tokenDecimals);
  validateDuplicatedRecipients(data);

  const batchesInProgress = readBatchesInProgress(id);
  const lastSentRecipientIndex = batchesInProgress[id].lastSentRecipientIndex;
  const startRecipientIndex = lastSentRecipientIndex + 1;

  if (lastSentRecipientIndex >= 0) {
    const startRecipientAccount = accountsAndAmounts[startRecipientIndex].account;
    if (!startRecipientAccount) {
      throw new Error("startRecipientAccount is undefined");
    }

    console.warn(
      "WARN: lastSentRecipientIndex is %s, starting from index recipient: %s (%s), %s of %s recipients left",
      lastSentRecipientIndex,
      startRecipientIndex,
      startRecipientAccount,
      accountsAndAmounts.length - startRecipientIndex,
      accountsAndAmounts.length
    );
    accountsAndAmounts = accountsAndAmounts.slice(startRecipientIndex);
    await confirmProceed();
  }
  const batchesCount = Math.ceil(accountsAndAmounts.length / batchSize);

  const batches: Batches = [];
  for (const batchIndex of range(0, batchesCount)) {
    const from = batchIndex * batchSize;
    const batch = accountsAndAmounts.slice(from, from + batchSize).map((item, i) => ({
      ...item,
      globalIndex: startRecipientIndex + batchIndex * batchSize + i,
    }));
    const totalBatchAmount = batch.reduce((acc, { amount }) => acc.add(amount), bigNumberify(0));
    batches.push({ batch, totalBatchAmount });
  }

  await runSimulation(claimHandler, multicall, batches, data, tokenDecimals);
  await confirmProceed("Do you want to execute the transactions?");

  const txHashes = [];
  for (const { batch, totalBatchAmount } of batches) {
    await validateEmptyClaimableAmount(claimHandler, multicall, data, batch, tokenDecimals);

    const from = batch[0].globalIndex;
    const to = batch[batch.length - 1].globalIndex;
    console.log("sending batch %s-%s token %s typeId %s", from, to, data.token, data.distributionTypeId);

    for (const { account, amount, globalIndex } of batch) {
      console.log(
        "%s recipient %s amount %s (%s)",
        globalIndex,
        account,
        formatAmount(amount, tokenDecimals, 4, true),
        amount
      );
    }

    const balance = await tokenContract.balanceOf(signerAddress);
    if (balance.lt(totalBatchAmount)) {
      console.warn(
        "WARN: current balance %s is lower than required %s for batch %s-%s",
        formatAmount(balance, tokenDecimals, 2, true),
        formatAmount(totalBatchAmount, tokenDecimals, 2, true),
        from,
        to
      );
      throw new Error("Not enough balance to send batch");
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
        "ERROR. txn %s failed. manually check if it was mined and, if it was, update %s, set %s.lastSentRecipientIndex to %s. otherwise deposits will be duplicated on the next run",
        tx.hash,
        getBatchesInProgressFilepath(),
        id,
        batch[batch.length - 1].globalIndex
      );
      throw ex;
    }
    console.log("batch %s-%s done", from, to);

    batchesInProgress[id].lastSentRecipientIndex = batch[batch.length - 1].globalIndex;
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
}

type Batches = {
  batch: {
    account: string;
    amount: BigNumber;
    globalIndex: number;
  }[];
  totalBatchAmount: BigNumber;
}[];

async function runSimulation(
  claimHandler: any,
  multicall: any,
  batches: Batches,
  data: { token: string; distributionTypeId: number | string },
  tokenDecimals: number
) {
  if (skipSimulation) {
    console.warn("WARN: skipping simulation");
    await setTimeout(1000);
    return;
  }

  console.log("running simulation. pass SKIP_SIMULATION=1 to skip");
  for (const { batch, totalBatchAmount } of batches) {
    await validateEmptyClaimableAmount(claimHandler, multicall, data, batch, tokenDecimals);
    const from = batch[0].globalIndex;
    const to = batch[batch.length - 1].globalIndex;
    console.log(
      "simulating sending batch %s-%s token %s total amount %s typeId %s",
      from,
      to,
      data.token,
      formatAmount(totalBatchAmount, tokenDecimals),
      data.distributionTypeId
    );

    for (const { account, amount, globalIndex } of batch) {
      console.log(
        "%s recipient %s amount %s (%s)",
        globalIndex,
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
    console.log("simulation batch %s-%s done, result %s", from, to, result);
  }
}

function validateDuplicatedRecipients(data: { amounts: Record<string, string> }) {
  // objects can't have duplicate keys, but addresses can be in different cases
  const seenRecipients = new Set();
  for (const recipient of Object.keys(data.amounts)) {
    const normalizedAddress = recipient.toLowerCase().trim();
    if (seenRecipients.has(normalizedAddress)) {
      throw new Error(`Duplicated recipient ${normalizedAddress}`);
    }
    seenRecipients.add(normalizedAddress);
  }
}

async function checkAllowance(
  tokenContract: any,
  claimHandler: any,
  data: {
    token: string;
    distributionTypeId: number | string;
  },
  signerAddress: string,
  totalAmount: BigNumber,
  tokenDecimals: number
) {
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
    console.log("approval done");
  }
}

async function transferFundsFromSafe(
  tokenContract: any,
  signerAddress: string,
  totalAmount: BigNumber,
  tokenDecimals: number
) {
  if (!topUpFromSafe) {
    return;
  }
  if (hre.network.name !== "arbitrum") {
    throw new Error("transferFundsFromSafe is only supported on Arbitrum");
  }

  const allowance = await tokenContract.allowance(SAFE_ADDRESS, signerAddress);
  if (allowance.eq(0)) {
    console.warn("WARN: safe %s allowance for %s is 0. skip top up", SAFE_ADDRESS, signerAddress);
    return;
  }

  let amount = totalAmount.lt(allowance) ? totalAmount : allowance;
  if (maxTopUpFromSafe && maxTopUpFromSafe.lt(amount)) {
    amount = maxTopUpFromSafe;
  }

  console.log(
    "WARN: transferring %s (%s) from safe %s to %s",
    formatAmount(amount, tokenDecimals, 4, true),
    amount,
    SAFE_ADDRESS,
    signerAddress
  );
  await confirmProceed("do you want to proceed with the top up?");

  const tx = await tokenContract.transferFrom(SAFE_ADDRESS, signerAddress, amount);
  console.log("sent transferFrom txn %s, waiting...", tx.hash);
  await tx.wait();
  console.log("transferFrom done");
}

async function checkBalance(tokenContract: any, signerAddress: string, totalAmount: BigNumber, tokenDecimals: number) {
  const balance = await tokenContract.balanceOf(signerAddress);
  if (balance.lt(totalAmount)) {
    console.warn(
      "WARN: current balance %s is lower than the total amount %s",
      formatAmount(balance, tokenDecimals, 2, true),
      formatAmount(totalAmount, tokenDecimals, 2, true)
    );
    await confirmProceed();
  }
  console.log("balance is %s", formatAmount(balance, tokenDecimals, 2, true));
}

type Migrations = Record<string, number>;

async function confirmProceed(message = "Do you want to proceed?") {
  if (skipConfirmations) {
    return;
  }
  const { proceed } = await prompts({
    type: "confirm",
    name: "proceed",
    message,
  });
  if (!proceed) {
    process.exit(0);
  }
}

async function validateEmptyClaimableAmount(
  claimHandler: any,
  multicall: any,
  data: {
    token: string;
    distributionTypeId: number | string;
  },
  batch: { account: string; amount: BigNumber }[],
  tokenDecimals: number
) {
  const accounts = batch.map(({ account }) => account);
  const payload = accounts.map((account) => ({
    target: claimHandler.address,
    callData: claimHandler.interface.encodeFunctionData("getClaimableAmount", [
      account,
      data.token,
      [data.distributionTypeId],
    ]),
  }));
  const result = await multicall.callStatic.aggregate3(payload);
  const claimableAmounts = result.map(({ returnData }) => {
    const decoded = claimHandler.interface.decodeFunctionResult("getClaimableAmount", returnData);
    return decoded[0];
  });

  let isValid = true;
  for (const [i, account] of accounts.entries()) {
    const claimableAmount = claimableAmounts[i];
    if (claimableAmount.gt(0)) {
      isValid = false;
      console.warn(
        "WARN: account %s already has claimable amount %s (%s)",
        account,
        formatAmount(claimableAmount, tokenDecimals, 4, true),
        claimableAmount
      );
    }
  }

  if (!isValid && !skipEmptyClaimableAmountValidation) {
    throw new Error(
      "Some accounts already have claimable amount. pass SKIP_EMPTY_CLAIMABLE_AMOUNT_VALIDATION=1 to skip this check"
    );
  }

  console.log("claimable amounts are valid");
}

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

type BatchesInProgress = Record<string, { lastSentRecipientIndex: number }>;

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
    if (!("lastSentRecipientIndex" in ret[dataId])) {
      throw new Error("`lastSentRecipientIndex` is missing");
    }
    if (ret[dataId].lastSentRecipientIndex < 0) {
      throw new Error("`lastSentRecipientIndex` should be greater or equal to zero");
    }
  } else {
    ret[dataId] = {
      lastSentRecipientIndex: -1, // -1 means no batches were sent before
    };
  }
  return ret;
}

async function readDistributionFile(migrations: Migrations) {
  let filepath: string;
  if (process.env.FILENAME) {
    const filename = process.env.FILENAME;
    filepath = filename.startsWith("/") ? filename : path.join(process.cwd(), filename);
  } else {
    const dataDir = path.join(__dirname, "data");
    console.log("looking for distribution files in %s", dataDir);
    const files = globSync(`${dataDir}/**/*.json`);
    if (files.length === 0) {
      throw new Error(`No distribution files found in ${dataDir}/ and FILENAME is not set`);
    }
    ({ filepath } = await prompts({
      type: "select",
      name: "filepath",
      message: "Select distribution file",
      choices: files
        .map((file) => {
          const id = getIdFromPath(file);
          const processed = id in migrations;
          const title =
            file.split("/data/")[1] +
            (processed ? ` (processed on ${new Date(migrations[id] * 1000).toISOString().substring(0, 10)})` : "");
          return {
            title,
            value: file,
            disabled: processed,
          };
        })
        .sort((a, b) => {
          const aId = getIdFromPath(a.value);
          const bId = getIdFromPath(b.value);
          if (migrations[aId] && !migrations[bId]) {
            return 1;
          }
          if (!migrations[aId] && migrations[bId]) {
            return -1;
          }
          return 0;
        }),
    }));
  }

  if (!filepath) {
    throw new Error("No distribution file selected");
  }

  console.log("reading file %s", filepath);
  const data: {
    token: string;
    amounts: Record<string, string>;
    chainId: number;
    distributionTypeId: number | string;
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

  const id = getIdFromPath(filepath);

  return {
    id,
    data,
    distributionTypeName,
  };
}

function getIdFromPath(filepath: string) {
  return filepath.split("/").pop().split(".")[0];
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
