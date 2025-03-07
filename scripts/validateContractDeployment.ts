import hre, { ethers } from "hardhat";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import * as readline from "node:readline";
import { Result } from "@ethersproject/abi";
import roles from "../config/roles";
import { JsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";
import axios from "axios";

dotenv.config();

const AUDITED_COMMIT = process.env.AUDITED_COMMIT as string;
const TRANSACTION_HASH = process.env.TRANSACTION_HASH as string;

async function main() {
  if (!AUDITED_COMMIT || !TRANSACTION_HASH) {
    console.error("Error: Missing AUDITED_COMMIT or TRANSACTION_HASH in environment variables.");
    process.exit(1);
  }

  const provider = hre.ethers.provider;
  const tx = await provider.getTransactionReceipt(TRANSACTION_HASH);
  if (!tx) {
    console.error("Transaction not found.");
    process.exit(1);
  }

  console.log(`Checking deployment against commit: ${AUDITED_COMMIT}`);
  // execSync(`git checkout ${AUDITED_COMMIT}`, { stdio: "inherit" });

  try {
    // const contractInfos = await extractRolesFromTx(tx);
    const contractInfos = [
      {
        address: "0x393053B58f9678C9c28c2cE941fF6cac49C3F8f9",
        name: "GlvVault",
        isCodeValidated: false,
        signalledRoles: [],
      },
    ];
    console.log("Contracts: ", contractInfos);
    for (const contractInfo of contractInfos) {
      // also extracts contract name
      // const isCodeValidated = await validateFromEtherscan(contractInfo);
      // Fallback to bytecode compilation if sources are not verified on etherscan
      // if (!isCodeValidated) {
      await compareContractBytecodes(provider, contractInfo);
      // }
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

const expectedRoles = {
  CONFIG_KEEPER: ["ConfigSyncer"],
  ROLE_ADMIN: ["Timelock"],
  ROUTER_PLUGIN: ["ExchangeRouter", "SubaccountRouter", "GlvRouter"],
  CONTROLLER: [
    "OracleStore",
    "MarketFactory",
    "GlvFactory",
    "Config",
    "ConfigSyncer",
    "Timelock",
    "Oracle",
    "SwapHandler",
    "AdlHandler",
    "DepositHandler",
    "WithdrawalHandler",
    "OrderHandler",
    "ExchangeRouter",
    "LiquidationHandler",
    "SubaccountRouter",
    "ShiftHandler",
    "GlvHandler",
    "GlvRouter",
  ],
};

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
  for (const signalledRole of contractInfo.signalledRoles) {
    if (!(await checkRole(contractInfo.name, contractInfo.address, signalledRole))) {
      throw new Error(`Role ${signalledRole} is not approved for ${contractInfo.name}!`);
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

async function checkRole(contractName: string, contractAddress: string, signalledRole: string): Promise<boolean> {
  const rolesConfig = await roles(hre);
  for (const [role, addresses] of Object.entries(rolesConfig)) {
    if (addresses[contractAddress]) {
      if (encodeRole(role) === signalledRole && expectedRoles[role].includes(contractName)) {
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
  const tempFilePath = path.join(__dirname, "temp_file.txt");
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
  const constructorArgs = extractDeploymentArgs(deployment);
  return {
    contractName: contractName,
    constructorArgs: constructorArgs,
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

  const { contractName, constructorArgs } = await extractContractNameAndArgsFromDeployment(contractInfo.address);
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
  const blockchainBytecode = await provider.getCode(contractInfo.address);
  const blockchainBytecodeWithoutMetadata = stripBytecodeIpfsHash(blockchainBytecode);
  const blockchainDeployBytecode = blockchainBytecodeWithoutMetadata.slice(
    0,
    blockchainBytecodeWithoutMetadata.length - encodedArgs.length
  ); // bytecode without metadata and constructor args

  console.log("Local: ", localBytecodeStripped);
  console.log("External: ", blockchainDeployBytecode);
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

function extractDeploymentArgs(deploymentFile: string): string[] {
  const js = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  return js.args;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
