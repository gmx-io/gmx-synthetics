import { setTimeout as delay } from "timers/promises";
import { readJsonFile, writeJsonFile } from "../utils/file";
import { getExplorerUrl } from "../hardhat.config";
import { sendExplorerRequest } from "../utils/explorer";

import hre from "hardhat";

const largeContractsMap = {
  AdlHandler: true,
  DepositHandler: true,
  ExecuteDepositUtils: true,
  ExecuteGlvDepositUtils: true,
  ExecuteOrderUtils: true,
  ExecuteWithdrawalUtils: true,
  GlvDepositHandler: true,
  GlvShiftHandler: true,
  GlvShiftUtils: true,
  GlvWithdrawalHandler: true,
  GlvWithdrawalUtils: true,
  LiquidationHandler: true,
  OrderHandler: true,
  Reader: true,
  ReaderUtils: true,
  WithdrawalHandler: true,
  SubaccountGelatoRelayRouter: true,
};

function withTimeout(promise, timeoutMs, timeoutMessage = "Timed out") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)),
  ]);
}

// a custom argument file may be needed for complex arguments
// https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify#complex-arguments
//
// example:
// ARBISCAN_API_KEY=<api key> npx hardhat --network arbitrum verify --constructor-args ./verification/gov/govTimelockController.js --contract contracts/gov/GovTimelockController.sol:GovTimelockController 0x99Ff4D52e97813A1784bC4A1b37554DC3499D67e
async function getIsContractVerified(apiUrl: string, address: string) {
  try {
    const res: any = await sendExplorerRequest({ action: "getabi", address });

    if (res.status !== "1") {
      if (res.result?.includes("rate limit reached")) {
        throw new Error("Rate limit reached");
      }
      if (res.result?.includes("Invalid API URL endpoint")) {
        throw new Error("Invalid API URL endpoint");
      }

      if (!res.result?.includes("Contract source code not verified")) {
        console.warn("%s: %s", res.message, res.result);
      }
    }

    return res.status === "1";
  } catch (e) {
    console.warn(`getIsContractVerified error: ${e}`);
    return false;
  }
}

function encodeArg(arg) {
  if (Array.isArray(arg)) {
    return `[${arg.map((item) => encodeArg(item))}]`;
  }

  if (typeof arg === "object") {
    return `${JSON.stringify(arg)}`;
  }

  if (typeof arg !== "string") {
    return arg;
  }

  return `"${arg}"`;
}

async function verifyForNetwork(verificationNetwork) {
  const apiUrl = getExplorerUrl(verificationNetwork);
  const apiHost = new URL(apiUrl).host;
  const cacheFilePath = `./scripts/cache/verification/${verificationNetwork}-${apiHost}.json`;
  console.log("cacheFilePath", cacheFilePath);
  console.log("apiUrl", apiUrl);

  let cache: Record<string, boolean> = readJsonFile(cacheFilePath);
  if (cache === undefined) {
    cache = {};
  }

  const allDeployments = await hre.deployments.all();
  console.log("Verifying %s contracts", Object.keys(allDeployments).length);

  const unverifiedContracts = [];
  const largeContracts = [];

  let index = 0;
  for (const [name, deployment] of Object.entries(allDeployments)) {
    console.log("Checking contract %s of %s", index + 1, Object.keys(allDeployments).length);
    index++;

    const start = Date.now();
    const { address, args } = deployment;
    const argStr = args.map((arg) => encodeArg(arg)).join(" ");

    const metadata = JSON.parse(deployment.metadata);
    const contractFQN = `${Object.keys(metadata.settings.compilationTarget)[0]}:${name}`;
    const contractArg = `--contract ${contractFQN}`;
    const command = `npx hardhat verify ${contractArg} --network ${verificationNetwork} ${address} ${argStr}`;

    if (process.env.CONTRACT && process.env.CONTRACT !== name) {
      continue;
    }

    try {
      let isContractVerified = cache[address];

      console.log("command", command);

      if (!isContractVerified) {
        await delay(200);
        console.log(`checking contract verification ${address}`);
        isContractVerified = await getIsContractVerified(apiUrl, address);
      }

      if (isContractVerified) {
        console.log(`${name} already verified: ${address}`);
        continue;
      }

      if (process.env.SKIP_LARGE_CONTRACTS && largeContractsMap[name]) {
        console.log(`skipping large contract: ${name}`);
        largeContracts.push({ address, command });
        continue;
      }

      console.log("Verifying contract %s %s %s", name, address, argStr);
      const { success, error } = await withTimeout(
        hre.run("verify-complex-args", {
          contract: contractFQN,
          network: verificationNetwork,
          address: address,
          constructorArgsParams: argStr,
        }),
        5 * 60_000
      );

      if (!success) {
        throw new Error(error);
      }
      console.log("Verified contract %s %s in %ss", name, address, (Date.now() - start) / 1000);
      cache[address] = true;
    } catch (ex) {
      unverifiedContracts.push({
        address,
        error: ex,
        command,
      });
      console.error("Failed to verify contract %s in %ss", address, (Date.now() - start) / 1000);
      console.error("error", ex);
    }
  }

  writeJsonFile(cacheFilePath, cache);

  if (unverifiedContracts.length > 0) {
    console.log(`${unverifiedContracts.length} contracts were not verified`);
    console.log(`-------`);
    for (let i = 0; i < unverifiedContracts.length; i++) {
      const unverifiedContract = unverifiedContracts[i];
      console.log(`${i + 1}: ${unverifiedContract.address}`);
      console.log(`Command: ${unverifiedContract.command}\n`);
    }
    console.log(`-------`);
    for (let i = 0; i < unverifiedContracts.length; i++) {
      const unverifiedContract = unverifiedContracts[i];
      console.log(`${i + 1}: ${unverifiedContract.address}`);
      console.log(`Error: ${unverifiedContract.error}\n`);
    }
    console.log(`-------`);
  }

  if (largeContracts.length > 0) {
    console.log(`${largeContracts.length} large contracts skipped`);
    console.log(`-------`);

    for (let i = 0; i < largeContracts.length; i++) {
      const largeContract = largeContracts[i];
      console.log(`${i + 1}: ${largeContract.address}`);
      console.log(`Command: ${largeContract.command}\n`);
    }
    console.log(`-------`);
  }
}

async function main() {
  const networkName = process.env.VERIFICATION_NETWORK ? process.env.VERIFICATION_NETWORK : hre.network.name;

  if (networkName === "avalanche") {
    await verifyForNetwork("avalanche");
    // await verifyForNetwork("snowscan");
  } else {
    await verifyForNetwork(networkName);
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
