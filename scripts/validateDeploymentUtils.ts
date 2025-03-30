import axios from "axios";
import hre, { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getContractCreationFromEtherscan, getIsGmxDeployer } from "./validateRolesUtils";
import { execSync } from "child_process";
import readline from "node:readline";

export interface SignalRoleInfo {
  account: string;
  roleKey: string;
}

export interface ContractInfo {
  address: string;
  name: string | null;
  isCodeValidated: boolean;
  signalledRoles: string[];
  unapprovedRoles: string[];
}

export interface DeploymentInfo {
  contractName: string;
  constructorArgs: string[];
  deploymentTxHash: string;
}

export async function validateSourceCode(provider: JsonRpcProvider, contractInfo: ContractInfo) {
  const { contractCreator } = await getContractCreationFromEtherscan(contractInfo.address);
  if (!getIsGmxDeployer(contractCreator)) {
    throw new Error(`❌ Contract creator for ${contractInfo.address} is not GMX!`);
  }

  try {
    // also extracts contract name
    await validateWithSourcify(contractInfo);
  } catch (error) {
    console.error(`Sourcify validation failed: ${error}.\nFallback to compilation artifact validation`);
    await compareContractBytecodes(provider, contractInfo);
  }
}

// Validate contract using sourcify verified one as reference.
const SOURCIFY_API_ENDPOINT = "https://sourcify.dev/server/v2/contract";

async function validateWithSourcify(contractInfo: ContractInfo): Promise<boolean> {
  console.log(`Trying to validate ${contractInfo.address} via sourcify`);
  const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  const url = `${SOURCIFY_API_ENDPOINT}/${chainId}/${contractInfo.address}`;
  try {
    const path = url + "?fields=sources,compilation";
    const response = await axios.get(path);
    if (response.status != 200) {
      //Source code not verified
      return false;
    }

    contractInfo.name = response.data.compilation.name;
    console.log(`Resolved as ${contractInfo.name}`);

    for (const [filename, data] of Object.entries(response.data.sources)) {
      const result = await validateSourceFile(filename, data["content"]);
      if (!result) {
        return false;
      }
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
      await showDiff(filePath, sourceCode, fullContractName.replaceAll("/", "-"));
      return false;
    }
  } catch (error) {
    throw new Error("Error reading file:" + error);
  }
}

async function showDiff(localPath: string, sourceCode: string, contractName: string) {
  const outDir = path.join(__dirname, "../validation");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }
  const tempFilePath = path.join(outDir, "temp.txt");
  const output = path.join(outDir, contractName + ".txt");
  fs.writeFileSync(tempFilePath, sourceCode, "utf-8");

  try {
    execSync(`git diff --no-index ${localPath} ${tempFilePath} > ${output}`, { stdio: "inherit", encoding: "utf-8" });
  } catch (error) {
    // git diff works but produce error for some reason
  } finally {
    fs.unlinkSync(tempFilePath);
  }
}

async function compareContractBytecodes(provider: JsonRpcProvider, contractInfo: ContractInfo): Promise<void> {
  console.log("Comparing bytecodes with compilation artifact");

  const { contractName, constructorArgs, deploymentTxHash } = await extractContractNameAndArgsFromDeployment(
    contractInfo.address
  );
  contractInfo.name = contractName;

  await compileContract(contractName);

  const artifactBytecode = await getBytecodeWithLinks(contractName);

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
    // Bytecodes does not match
    return;
  }

  // Check deployment args are the same
  const blockchainArgs = blockchainBytecodeWithoutMetadata.slice(
    blockchainBytecodeWithoutMetadata.length - encodedArgs.length
  );
  if (encodedArgs !== blockchainArgs) {
    // Args does not match
    return;
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

async function getArtifact(contractName: string): Promise<any> {
  const findContract = findFile(contractName + ".json");
  const buildPath = path.join(__dirname, "../artifacts/contracts/");
  const searchResult = await searchDirectory(buildPath, findContract);
  if (!searchResult) {
    throw new Error("Artifact not found");
  }

  return JSON.parse(fs.readFileSync(searchResult, "utf-8"));
}

async function getBytecodeWithLinks(contractName: string): Promise<string> {
  const artifact = await getArtifact(contractName);

  // convert string to array for inplace replacement
  const arrayBytecode = artifact.bytecode.split("");

  for (const dependency of Object.values(artifact.linkReferences)) {
    const dependencyName = Object.keys(dependency)[0];
    const dependencyPositions = dependency[dependencyName];

    const deploymentFilename = "./deployments/" + hre.network.name + "/" + dependencyName + ".json";
    // extract deployed dependency address and trim 0x
    const addr = (await getAddressFromDeployment(deploymentFilename)).substring(2);

    for (const position of dependencyPositions) {
      // calculate link index. Each byte is 2 symbols + 0x at the start.
      const idx = 2 + position.start * 2;
      arrayBytecode.splice(idx, 40, addr);
    }
  }

  return arrayBytecode.join("");
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
const getAddressFromDeployment = async (filename: string): Promise<string | null> => {
  if (fs.lstatSync(filename).isDirectory()) {
    return null;
  }

  try {
    const fileStream = fs.createReadStream(filename);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const match = line.match(/"address":\s*"(0x[^"]+)"/);
      if (match) {
        return match[1];
      }
    }
    return null;
  } catch (error) {
    console.error("Error reading file:", error);
    return null;
  }
};

const checkAddressInFile =
  (address: string) =>
  async (filename: string): Promise<boolean> => {
    const deploymentAddress = await getAddressFromDeployment(filename);
    return deploymentAddress === address;
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
