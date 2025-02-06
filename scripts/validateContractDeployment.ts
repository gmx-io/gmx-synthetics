import hre, { ethers } from "hardhat";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import * as readline from "node:readline";

dotenv.config();

const AUDITED_COMMIT = process.env.AUDITED_COMMIT as string;
const TRANSACTION_HASH = process.env.TRANSACTION_HASH as string;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as string;

async function main() {
  if (!AUDITED_COMMIT || !TRANSACTION_HASH) {
    console.error("Error: Missing AUDITED_COMMIT or TRANSACTION_HASH in environment variables.");
    process.exit(1);
  }

  console.log(`Checking deployment against commit: ${AUDITED_COMMIT}`);
  // compileContracts(AUDITED_COMMIT);

  //Find deployment by hash
  const deploymentsPath = path.join(__dirname, "../deployments/" + hre.network.name);

  const searchContractCreationTx = checkTxHashInFile(TRANSACTION_HASH);
  const deployment = await searchDirectory(deploymentsPath, searchContractCreationTx);
  console.log("Deployment: " + deployment);

  //Extract contractName
  const contractName = path.basename(deployment, path.extname(deployment));
  console.log("ContractName: " + contractName);

  // await compileContract(AUDITED_COMMIT, contractName);

  const Contract = await ethers.getContractFactory(contractName);
  const constructorArgs = extractDeploymentArgs(deployment);
  const encodedArgs = ethers.utils.defaultAbiCoder
    .encode(
      Contract.interface.deploy.inputs.map((i) => i.type), // Get types from ABI
      constructorArgs
    )
    .slice(2); //remove 0x at start

  console.log("Deployment args: " + constructorArgs);
  console.log("Encoded args: " + encodedArgs);

  // console.log(Contract.bytecode);

  const localBytecodeStripped = stripBytecodeIpfsHash(Contract.bytecode);
  // console.log(localBytecodeStripped);

  const provider = hre.ethers.provider;
  //0x2ceef2571ae68395a171d86084466690d736e480f74a0a51286148f74b6d7436
  const tx = await provider.getTransaction(TRANSACTION_HASH);
  const blockchainBytecode = tx.data;
  const blockchainBytecodeWithoutMetadata = stripBytecodeIpfsHash(blockchainBytecode);
  const blockchainDeployBytecode = blockchainBytecodeWithoutMetadata.slice(
    0,
    blockchainBytecodeWithoutMetadata.length - encodedArgs.length
  ); // bytecode without metadata and constructor args

  if (localBytecodeStripped !== blockchainDeployBytecode) {
    console.error("Bytecodes does not match!");
    return;
  }

  // Check deployment args are the same
  const blockchainArgs = blockchainBytecodeWithoutMetadata.slice(
    blockchainBytecodeWithoutMetadata.length - encodedArgs.length
  );
  if (encodedArgs !== blockchainArgs) {
    console.error("Args does not match!");
    return;
  }

  //Check roles are correct

  // 0xff1f9303e1524df59031c2ec85655de663ce8fec69e716d37a2802ea475d9b8e Tx with SignalRoleGranted from EventEmitter

  // await validateRoleGrants(txReceipt);
  //
  // console.log("Verification completed.");
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
  console.log("Found to remove: " + searchResult);
  if (searchResult) {
    fs.rmSync(searchResult, { recursive: true, force: true });
  }

  execSync("npx hardhat compile", { stdio: "inherit" });
}

//Using streaming read cause file can be big
const checkTxHashInFile =
  (txHash: string) =>
  async (filename: string): Promise<boolean> => {
    if (fs.lstatSync(filename).isDirectory()) {
      return false;
    }

    try {
      const fileStream = fs.createReadStream(filename);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (line.includes(txHash)) {
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

async function searchDirectory(dirPath: string, condition: (filename: string) => Promise<boolean>): Promise<string> {
  const contractFiles = fs.readdirSync(dirPath);
  for (const file of contractFiles) {
    const name = path.join(dirPath, file);
    // console.log("Hit: " + name);

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
