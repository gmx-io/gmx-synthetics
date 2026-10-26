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

// a library used only in the constructor cannot be read from the deployed bytecode, so its address comes from the
// record; only such libraries are passed, as a record can also list libraries the contract does not link
async function getConstructorOnlyLibraries(contractFQN: string, recordLibraries: Record<string, string> = {}) {
  const artifact = await hre.artifacts.readArtifact(contractFQN);
  const getLibraryNames = (linkReferences = {}) =>
    Object.values(linkReferences).flatMap((libraries) => Object.keys(libraries));
  const deployedLibraryNames = getLibraryNames(artifact.deployedLinkReferences);

  const libraries: Record<string, string> = {};
  for (const libraryName of getLibraryNames(artifact.linkReferences)) {
    if (!deployedLibraryNames.includes(libraryName) && recordLibraries[libraryName]) {
      libraries[libraryName] = recordLibraries[libraryName];
    }
  }
  return libraries;
}

// one retry after a short pause covers a transient explorer error, e.g. an HTML page instead of JSON
async function verifyWithRetry(params) {
  const attempt = () =>
    withTimeout(hre.run("verify-complex-args", params), 5 * 60_000).catch((error) => ({ success: false, error }));

  let result = await attempt();
  if (!result.success) {
    console.warn(`verification failed, retrying in 10s: ${result.error}`);
    await delay(10_000);
    result = await attempt();
  }
  return result;
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
  const skippedContracts = [];

  let index = 0;
  for (const [name, deployment] of Object.entries(allDeployments)) {
    console.log("Checking contract %s of %s", index + 1, Object.keys(allDeployments).length);
    index++;

    const start = Date.now();
    const { address, args } = deployment;
    const argStr = args.map((arg) => encodeArg(arg)).join(" ");

    const metadata = JSON.parse(deployment.metadata);
    // the compiled contract name, the deployment name can differ from it
    const sourceName = Object.keys(metadata.settings.compilationTarget)[0];
    const contractFQN = `${sourceName}:${metadata.settings.compilationTarget[sourceName]}`;
    const contractArg = `--contract ${contractFQN}`;
    const command = `npx hardhat verify ${contractArg} --network ${verificationNetwork} ${address} ${argStr}`;

    if (process.env.CONTRACT && process.env.CONTRACT !== name) {
      continue;
    }

    // a record whose source left the codebase cannot be verified from this build
    if (!(await hre.artifacts.artifactExists(contractFQN))) {
      console.log(`skipping ${name} ${address}: no artifact for ${contractFQN}`);
      skippedContracts.push({ name, address, contractFQN });
      continue;
    }

    let libraries: Record<string, string> = {};
    try {
      let isContractVerified = cache[address];

      console.log("command", command);

      if (!isContractVerified) {
        await delay(5000);
        console.log(`checking contract verification ${address}`);
        isContractVerified = await getIsContractVerified(apiUrl, address);
      }

      if (isContractVerified) {
        console.log(`${name} already verified: ${address}`);
        console.log(`updating cache ${address}`, cache[address]);
        cache[address] = true;
        writeJsonFile(cacheFilePath, cache);
        continue;
      }

      if (process.env.SKIP_LARGE_CONTRACTS && largeContractsMap[name]) {
        console.log(`skipping large contract: ${name}`);
        largeContracts.push({ name, address, command });
        continue;
      }

      libraries = await getConstructorOnlyLibraries(contractFQN, deployment.libraries);
      console.log("Verifying contract %s %s %s", name, address, argStr);
      if (Object.keys(libraries).length > 0) {
        console.log("libraries", libraries);
      }
      const { success, error } = await verifyWithRetry({
        contract: contractFQN,
        network: verificationNetwork,
        address: address,
        constructorArgsParams: argStr,
        libraries,
      });

      if (!success) {
        throw new Error(error);
      }
      console.log("Verified contract %s %s in %ss", name, address, (Date.now() - start) / 1000);
      cache[address] = true;
    } catch (ex) {
      unverifiedContracts.push({
        name,
        address,
        error: ex,
        command,
        libraries,
      });
      console.error("Failed to verify contract %s in %ss", address, (Date.now() - start) / 1000);
      console.error("error", ex);
    }

    console.log(`updating cache ${address}`, cache[address]);
    writeJsonFile(cacheFilePath, cache);
  }

  if (unverifiedContracts.length > 0) {
    console.log(`${unverifiedContracts.length} contracts were not verified`);
    console.log(`-------`);
    for (let i = 0; i < unverifiedContracts.length; i++) {
      const unverifiedContract = unverifiedContracts[i];
      console.log(`${i + 1}: ${unverifiedContract.address}`);
      if (Object.keys(unverifiedContract.libraries).length > 0) {
        console.log(`Libraries: ${JSON.stringify(unverifiedContract.libraries)}`);
      }
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

  if (skippedContracts.length > 0) {
    console.log(`${skippedContracts.length} records skipped, no artifact in this build`);
    console.log(`-------`);
    for (let i = 0; i < skippedContracts.length; i++) {
      const skippedContract = skippedContracts[i];
      console.log(`${i + 1}: ${skippedContract.name} ${skippedContract.address} ${skippedContract.contractFQN}`);
    }
    console.log(`-------`);
  }

  // repeated at the very end, so a skipped or failed contract is not lost in the output above
  const names = (contracts) => contracts.map((contract) => contract.name).join(", ");
  if (largeContracts.length > 0) {
    console.log(`WARNING: ${largeContracts.length} large contracts skipped: ${names(largeContracts)}`);
  }
  if (skippedContracts.length > 0) {
    console.log(
      `WARNING: ${skippedContracts.length} records skipped, no artifact in this build: ${names(skippedContracts)}`
    );
  }
  if (unverifiedContracts.length > 0) {
    console.log(`ERROR: ${unverifiedContracts.length} contracts not verified: ${names(unverifiedContracts)}`);
  }

  return unverifiedContracts.length;
}

async function main() {
  const networkName = process.env.VERIFICATION_NETWORK ? process.env.VERIFICATION_NETWORK : hre.network.name;
  return verifyForNetwork(networkName);
}

main()
  .then((unverifiedCount) => {
    // non-zero while contracts stay unverified, the deployment pipeline checks it
    process.exit(unverifiedCount > 0 ? 1 : 0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
