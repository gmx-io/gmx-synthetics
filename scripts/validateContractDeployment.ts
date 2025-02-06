import hre, { ethers } from "hardhat";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import * as readline from "node:readline";
import { Result } from "@ethersproject/abi";
import roles from "../config/roles";
import { JsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";

dotenv.config();

const AUDITED_COMMIT = process.env.AUDITED_COMMIT as string;
const TRANSACTION_HASH = process.env.TRANSACTION_HASH as string;

async function main() {
  if (!AUDITED_COMMIT || !TRANSACTION_HASH) {
    console.error("Error: Missing AUDITED_COMMIT or TRANSACTION_HASH in environment variables.");
    process.exit(1);
  }

  const provider = hre.ethers.provider;
  // 0x4808167612ed81195015927c5e7963c1dfbbc5c36499702583ecfb8a254c51f0 Tx with SignalRoleGranted from EventEmitter
  const tx = await provider.getTransactionReceipt(TRANSACTION_HASH);
  if (!tx) {
    console.error("Transaction not found.");
    process.exit(1);
  }

  try {
    const contracts = await validateRoles(tx);
    console.log("Found these contracts with changed roles: " + contracts);
    for (const contract of contracts) {
      await compareContractBytecodes(provider, contract);
    }
  } catch (error) {
    console.error("❌ " + error);
    process.exit(1);
  }

  console.log("✅ Verification completed.");
}

// Roles

interface SignalRoleInfo {
  account: string;
  roleKey: string;
}

//
async function validateRoles(txReceipt: TransactionReceipt): Promise<Set<string>> {
  const contracts = new Set<string>();
  const EventEmitter = await ethers.getContractFactory("EventEmitter");
  const eventEmitterInterface = EventEmitter.interface;

  for (const log of txReceipt.logs) {
    const parsedLog = eventEmitterInterface.parseLog(log);

    if (parsedLog.name == "EventLog1" && parsedLog.args[1] === "SignalGrantRole") {
      const signal = parseSignalGrantRoleEvent(parsedLog.args);
      contracts.add(signal.account);
      if (!(await checkRole(signal))) {
        throw new Error(`Role ${signal.roleKey} is not approved!`);
      }
    }
  }
  console.log("✅ Roles validated");
  return contracts;
}

function parseSignalGrantRoleEvent(eventArg: Result): SignalRoleInfo {
  const account = eventArg[4][0][0][0].value;
  const roleKey = eventArg[4][4][0][0].value;
  return {
    account: account,
    roleKey: roleKey,
  };
}

async function checkRole(signal: SignalRoleInfo): Promise<boolean> {
  const rolesConfig = await roles(hre);
  for (const [role, addresses] of Object.entries(rolesConfig)) {
    if (addresses[signal.account]) {
      const encoded = ethers.utils.defaultAbiCoder.encode(["string"], [role]);
      const keccak = ethers.utils.keccak256(encoded);
      if (keccak === signal.roleKey) {
        return true;
      }
    }
  }
  return false;
}

// Bytecode

async function compareContractBytecodes(provider: JsonRpcProvider, contractAddress: string): Promise<void> {
  console.log(`Checking deployment against commit: ${AUDITED_COMMIT}`);

  //Find deployment by hash
  const deploymentsPath = path.join(__dirname, "../deployments/" + hre.network.name);

  const searchContractDeployment = checkAddressInFile(contractAddress);
  const deployment = await searchDirectory(deploymentsPath, searchContractDeployment);
  if (!deployment) {
    throw new Error(`Could not find deployment ${contractAddress}`);
  }
  console.log("Deployment: " + deployment);

  //Extract contractName
  const contractName = path.basename(deployment, path.extname(deployment));
  console.log("ContractName: " + contractName);

  await compileContract(AUDITED_COMMIT, contractName);

  const Contract = await ethers.getContractFactory(contractName);
  if (!Contract) {
    throw new Error(`Could not find contract ${contractName}`);
  }
  const constructorArgs = extractDeploymentArgs(deployment);
  const encodedArgs = ethers.utils.defaultAbiCoder
    .encode(
      Contract.interface.deploy.inputs.map((i) => i.type), // Get types from ABI
      constructorArgs
    )
    .slice(2); //remove 0x at start

  const localBytecodeStripped = stripBytecodeIpfsHash(Contract.bytecode);

  //0x2ceef2571ae68395a171d86084466690d736e480f74a0a51286148f74b6d7436
  const blockchainBytecode = await provider.getCode(contractAddress);
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

async function compileContract(commit: string, contractName: string) {
  console.log("Compiling contract at commit:", commit);
  execSync(`git checkout ${commit}`, { stdio: "inherit" });

  // Find artifact with our contract and remove it to force recompilation of this contract
  const findContract = findFile(contractName + ".sol");
  const buildPath = path.join(__dirname, "../artifacts/contracts/");
  const searchResult = await searchDirectory(buildPath, findContract);
  if (searchResult) {
    fs.rmSync(searchResult, { recursive: true, force: true });
  }

  execSync("npx hardhat compile", { stdio: "inherit" });
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
