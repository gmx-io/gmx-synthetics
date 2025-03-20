import hre, { ethers } from "hardhat";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import * as readline from "node:readline";
import { Result } from "@ethersproject/abi";
import { JsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";
import axios from "axios";

dotenv.config();

const COMMIT_HASH = process.env.COMMIT_HASH as string;
const TRANSACTION_HASH = process.env.TRANSACTION_HASH as string;

const roleLabels = {
  [encodeRole("ROLE_ADMIN")]: "ROLE_ADMIN",
  [encodeRole("TIMELOCK_ADMIN")]: "TIMELOCK_ADMIN",
  [encodeRole("TIMELOCK_MULTISIG")]: "TIMELOCK_MULTISIG",
  [encodeRole("CONFIG_KEEPER")]: "CONFIG_KEEPER",
  [encodeRole("LIMITED_CONFIG_KEEPER")]: "LIMITED_CONFIG_KEEPER",
  [encodeRole("CONTROLLER")]: "CONTROLLER",
  [encodeRole("GOV_TOKEN_CONTROLLER")]: "GOV_TOKEN_CONTROLLER",
  [encodeRole("ROUTER_PLUGIN")]: "ROUTER_PLUGIN",
  [encodeRole("MARKET_KEEPER")]: "MARKET_KEEPER",
  [encodeRole("FEE_KEEPER")]: "FEE_KEEPER",
  [encodeRole("FEE_DISTRIBUTION_KEEPER")]: "FEE_DISTRIBUTION_KEEPER",
  [encodeRole("ORDER_KEEPER")]: "ORDER_KEEPER",
  [encodeRole("FROZEN_ORDER_KEEPER")]: "FROZEN_ORDER_KEEPER",
  [encodeRole("PRICING_KEEPER")]: "PRICING_KEEPER",
  [encodeRole("LIQUIDATION_KEEPER")]: "LIQUIDATION_KEEPER",
  [encodeRole("ADL_KEEPER")]: "ADL_KEEPER",
  [encodeRole("CONTRIBUTOR_KEEPER")]: "CONTRIBUTOR_KEEPER",
};

async function main() {
  if (!COMMIT_HASH || !TRANSACTION_HASH) {
    console.error("Error: Missing COMMIT_HASH or TRANSACTION_HASH in environment variables.");
    process.exit(1);
  }

  const provider = hre.ethers.provider;
  const tx = await provider.getTransactionReceipt(TRANSACTION_HASH);
  if (!tx) {
    console.error("Transaction not found.");
    process.exit(1);
  }

  console.log(`Checking deployment against commit: ${COMMIT_HASH}`);
  execSync(`git checkout ${COMMIT_HASH}`, { stdio: "inherit" });

  try {
    const contractInfos = await extractRolesFromTx(tx);
    console.log("Contracts: ", contractInfos);
    for (const contractInfo of contractInfos) {
      // also extracts contract name
      const isCodeValidated = await validateFromEtherscan(contractInfo);
      // Fallback to bytecode compilation if sources are not verified on etherscan
      if (!isCodeValidated) {
        await compareContractBytecodes(provider, contractInfo);
      }
      await validateRoles(contractInfo);
    }
  } catch (error) {
    console.error("❌ " + error);
    process.exit(1);
  }

  // Restore git to previous state
  execSync(`git checkout -`, { stdio: "inherit" });
  console.log("✅ Verification completed.");
}

// Roles

interface SignalRoleInfo {
  account: string;
  roleKey: string;
}

interface ContractInfo {
  address: string;
  name: string | null;
  isCodeValidated: boolean;
  signalledRoles: string[];
}

async function extractRolesFromTx(txReceipt: TransactionReceipt): Promise<ContractInfo[]> {
  const contractInfos = new Map<string, ContractInfo>();
  const EventEmitter = await ethers.getContractFactory("EventEmitter");
  const eventEmitterInterface = EventEmitter.interface;

  for (const log of txReceipt.logs) {
    const parsedLog = eventEmitterInterface.parseLog(log);

    if (parsedLog.name == "EventLog1" && parsedLog.args[1] === "SignalGrantRole") {
      const signal = parseSignalGrantRoleEvent(parsedLog.args);
      if (contractInfos.has(signal.account)) {
        contractInfos.get(signal.account).signalledRoles.push(signal.roleKey);
      } else {
        contractInfos.set(signal.account, {
          address: signal.account,
          name: null,
          isCodeValidated: false,
          signalledRoles: [signal.roleKey],
        });
      }
    }
  }
  return [...contractInfos].map(([, value]) => value);
}

async function validateRoles(contractInfo: ContractInfo) {
  const { requiredRolesForContracts } = await hre.gmx.getRoles();
  for (const signalledRole of contractInfo.signalledRoles) {
    if (!(await checkRole(contractInfo.name, contractInfo.address, signalledRole, requiredRolesForContracts))) {
      throw new Error(
        `Role ${signalledRole} ${roleLabels[signalledRole]} is not approved for ${contractInfo.name} ${contractInfo.address}!`
      );
    }
  }
  console.log(`✅ Roles for ${contractInfo.name} validated`);
}

function parseSignalGrantRoleEvent(eventArg: Result): SignalRoleInfo {
  const account = eventArg[4][0][0][0].value;
  const roleKey = eventArg[4][4][0][0].value;
  return {
    account: account,
    roleKey: roleKey,
  };
}

function encodeRole(roleKey: string): string {
  const encoded = ethers.utils.defaultAbiCoder.encode(["string"], [roleKey]);
  return ethers.utils.keccak256(encoded);
}

async function checkRole(
  contractName: string,
  contractAddress: string,
  signalledRole: string,
  requiredRolesForContracts: Record<string, string[]>
): Promise<boolean> {
  const rolesConfig = await hre.gmx.getRoles();
  for (const [role, addresses] of Object.entries(rolesConfig.roles)) {
    if (addresses[contractAddress]) {
      if (encodeRole(role) === signalledRole && requiredRolesForContracts[role].includes(contractName)) {
        return true;
      }
    }
  }
  return false;
}

// Verify sources from etherscan
async function validateFromEtherscan(contractInfo: ContractInfo): Promise<boolean> {
  console.log(`Trying to validate ${contractInfo.address} via etherscan`);
  const apiKey = hre.network.verify.etherscan.apiKey;
  const url = hre.network.verify.etherscan.apiUrl + "api";
  try {
    const path =
      url + "?module=contract" + "&action=getsourcecode" + `&address=${contractInfo.address}` + `&apikey=${apiKey}`;
    const response = await axios.get(path);
    const sources: string = response.data.result[0].SourceCode;
    if (sources === "") {
      //Source code not verified
      return false;
    }
    contractInfo.name = response.data.result[0].ContractName;
    console.log(`Resolved as ${contractInfo.name}`);
    // Remove extra brackets
    const data = JSON.parse(sources.slice(1, sources.length - 1));

    for (const source of Object.entries(data.sources)) {
      await validateSourceFile(source[0], source[1]["content"]);
    }
    contractInfo.isCodeValidated = true;
    return true;
  } catch (error) {
    console.error("Error:", error);
    return false;
  }
}

async function validateSourceFile(fullContractName: string, sourceCode: string): Promise<boolean> {
  try {
    let filePath = path.join(__dirname, "../node_modules/" + fullContractName);
    if (!fs.existsSync(filePath)) {
      // if it is not a node_module — consider it local
      filePath = path.join(__dirname, "../" + fullContractName);
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    if (fileContent === sourceCode) {
      return true;
    } else {
      console.error(`❌ Sources mismatch for ${fullContractName}. Resolving diff`);
      await showDiff(filePath, sourceCode);
      return false;
    }
  } catch (error) {
    throw new Error("Error reading file:" + error);
  }
}

async function showDiff(localPath: string, sourceCode: string) {
  const tempFilePath = path.join(__dirname, "../out", "temp_file.txt");
  fs.writeFileSync(tempFilePath, sourceCode, "utf-8");

  try {
    execSync(`git diff --no-index ${localPath} ${tempFilePath}`, { stdio: "inherit", encoding: "utf-8" });
  } catch (error) {
    // git diff works but produce error for some reason
  } finally {
    fs.unlinkSync(tempFilePath);
  }
}

// Bytecode

interface DeploymentInfo {
  contractName: string;
  constructorArgs: string[];
  deploymentTxHash: string;
}

async function extractContractNameAndArgsFromDeployment(contractAddress: string): Promise<DeploymentInfo> {
  const deploymentsPath = path.join(__dirname, "../deployments/" + hre.network.name);
  const searchContractDeployment = checkAddressInFile(contractAddress);
  const deployment = await searchDirectory(deploymentsPath, searchContractDeployment);
  if (!deployment) {
    throw new Error(`Could not find deployment ${contractAddress}`);
  }
  console.log("Deployment: " + deployment);
  const contractName = path.basename(deployment, path.extname(deployment));
  console.log("ContractName: " + contractName);
  const deploymentJson = JSON.parse(fs.readFileSync(deployment, "utf-8"));
  return {
    contractName: contractName,
    constructorArgs: deploymentJson.args,
    deploymentTxHash: deploymentJson.transactionHash,
  };
}

async function getArtifactBytecode(contractName: string): Promise<string> {
  const findContract = findFile(contractName + ".json");
  const buildPath = path.join(__dirname, "../artifacts/contracts/");
  const searchResult = await searchDirectory(buildPath, findContract);
  if (!searchResult) {
    throw new Error("Artifact not found");
  }

  return JSON.parse(fs.readFileSync(searchResult, "utf-8")).bytecode;
}

async function compareContractBytecodes(provider: JsonRpcProvider, contractInfo: ContractInfo): Promise<void> {
  console.log("Comparing bytecodes with compilation artifact");

  const { contractName, constructorArgs, deploymentTxHash } = await extractContractNameAndArgsFromDeployment(
    contractInfo.address
  );
  contractInfo.name = contractName;

  await compileContract(contractName);

  const artifactBytecode = await getArtifactBytecode(contractName);

  const Contract = await ethers.getContract(contractName);
  if (!Contract) {
    throw new Error(`Could not find contract ${contractName}`);
  }
  const encodedArgs = ethers.utils.defaultAbiCoder
    .encode(
      Contract.interface.deploy.inputs.map((i) => i.type), // Get types from ABI
      constructorArgs
    )
    .slice(2); //remove 0x at start

  console.log("Encoded args: " + encodedArgs);

  const localBytecodeStripped = stripBytecodeIpfsHash(artifactBytecode);

  console.log(`Fetching blockchain bytecode from ${contractInfo.address} for ${contractName}`);
  const deploymentTx = await provider.getTransaction(deploymentTxHash);
  const blockchainBytecode = deploymentTx.data;
  const blockchainBytecodeWithoutMetadata = stripBytecodeIpfsHash(blockchainBytecode);
  const blockchainDeployBytecode = blockchainBytecodeWithoutMetadata.slice(
    0,
    blockchainBytecodeWithoutMetadata.length - encodedArgs.length
  ); // bytecode without metadata and constructor args

  if (localBytecodeStripped !== blockchainDeployBytecode) {
    throw new Error("Bytecodes does not match!");
  }

  // Check deployment args are the same
  const blockchainArgs = blockchainBytecodeWithoutMetadata.slice(
    blockchainBytecodeWithoutMetadata.length - encodedArgs.length
  );
  if (encodedArgs !== blockchainArgs) {
    throw new Error("Args does not match!");
  }

  contractInfo.isCodeValidated = true;
  console.log("✅ Bytecodes match");
}

// contract metadata contains ipfs hash which can be different
// i.e. solc compiler binary hash is different
// So we remove this hash, but leave solidity version metadata
function stripBytecodeIpfsHash(bytecode: string): string {
  const ipfsTag = "ea2646970667358221220";
  const solcCompilerTag = "64736f6c6343";
  const storageTagIndex = bytecode.lastIndexOf(ipfsTag); // means ipfs storage location
  const compilerTagIndex = bytecode.lastIndexOf(solcCompilerTag); // means "solc compiler"
  // ipfs hash locate in the middle of storage tag and compiler tags
  return bytecode.slice(0, storageTagIndex + ipfsTag.length) + bytecode.slice(compilerTagIndex);
}

async function compileContract(contractName: string) {
  // Find artifact with our contract and remove it to force recompilation of this contract
  const findContract = findFile(contractName + ".sol");
  const buildPath = path.join(__dirname, "../artifacts/contracts/");
  const searchResult = await searchDirectory(buildPath, findContract);
  if (searchResult) {
    fs.rmSync(searchResult, { recursive: true, force: true });
  }

  execSync("npx hardhat compile", { stdio: "inherit" });
  console.log(`${contractName} compiled successfully.`);
}

//Using streaming read cause file can be big
const checkAddressInFile =
  (address: string) =>
  async (filename: string): Promise<boolean> => {
    if (fs.lstatSync(filename).isDirectory()) {
      return false;
    }

    try {
      const fileStream = fs.createReadStream(filename);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (line.includes(`"address": "${address}",`)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Error reading file:", error);
      return false;
    }
  };

const findFile =
  (searchFile: string) =>
  (filename: string): Promise<boolean> => {
    return Promise.resolve(filename.endsWith(searchFile));
  };

// Search recursively through all files in the `dirPath` and test it with `condition`
// Returns filename when condition is true
async function searchDirectory(dirPath: string, condition: (filename: string) => Promise<boolean>): Promise<string> {
  const contractFiles = fs.readdirSync(dirPath);
  for (const file of contractFiles) {
    const name = path.join(dirPath, file);

    if (await condition(name)) {
      return name;
    }

    if (fs.lstatSync(name).isDirectory()) {
      const result = await searchDirectory(name, condition);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
