import axios from "axios";
import hre, { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getIsGmxDeployer } from "./validateRolesUtils";
import { execSync } from "child_process";
import { getContractCreationFromEtherscan } from "../utils/explorer";
import { FileCache } from "./cacheUtils";
import { hashString } from "../utils/hash";
import { getExplorerUrl } from "../hardhat.config";
import got from "got";

const externalContractsAllowedForRoles = {
  [hashString("TIMELOCK_ADMIN")]: true,
  [hashString("TIMELOCK_MULTISIG")]: true,
  [hashString("CONFIG_KEEPER")]: true,
  [hashString("LIMITED_CONFIG_KEEPER")]: true,
  [hashString("MARKET_KEEPER")]: true,
  [hashString("FEE_KEEPER")]: true,
  [hashString("FEE_DISTRIBUTION_KEEPER")]: true,
  [hashString("ORDER_KEEPER")]: true,
  [hashString("FROZEN_ORDER_KEEPER")]: true,
  [hashString("LIQUIDATION_KEEPER")]: true,
  [hashString("ADL_KEEPER")]: true,
  [hashString("CONTRIBUTOR_KEEPER")]: true,
  [hashString("CONTRIBUTOR_DISTRIBUTOR")]: true,
  [hashString("CLAIM_ADMIN")]: true,
};

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
  approvedRoles: string[];
}

export interface DeploymentInfo {
  contractName: string;
  constructorArgs: string[];
  deploymentTxHash: string;
}

export interface Artifact {
  contractName: string;
  sourceName: string;
  abi: string;
  bytecode: string;
  deployedBytecode: string;
  linkReferences: Record<
    string,
    Record<
      string,
      {
        length: number;
        start: number;
      }[]
    >
  >;
}

export interface SourcifyResponse {
  compilation: {
    name: string;
  };
  // keys are contract names and values are source codes
  sources: Record<
    string,
    {
      content: string;
    }
  >;
  verifiedAt: string;
  creationMatch: string;
  match: string;
  address: string;
  chainId: number;
}

export async function validateSourceCode(provider: JsonRpcProvider, contractInfo: ContractInfo) {
  if (contractInfo.isCodeValidated) {
    console.log(`${contractInfo.name} already validated`);
    return;
  }
  // isExternalContractAllowed would be true if signalledRoles is empty
  const isExternalContractAllowed = contractInfo.signalledRoles.every(
    (roleKey) => externalContractsAllowedForRoles[roleKey]
  );

  if (isExternalContractAllowed) {
    contractInfo.isCodeValidated = true;
    return;
  }

  const { contractCreator } = await getContractCreationFromEtherscan(contractInfo.address);

  if (!getIsGmxDeployer(contractCreator)) {
    throw new Error(`❌ Contract creator for ${contractInfo.address} is not GMX!`);
  }

  try {
    // also extracts contract name
    await validateWithExplorer(contractInfo);
  } catch (error) {
    console.error(`Sourcify validation failed: ${error}.\nFallback to compilation artifact validation`);
    await compareContractBytecodes(provider, contractInfo);
  }
}

// Validate contract using sourcify verified one as reference.
const SOURCIFY_API_ENDPOINT = "https://sourcify.dev/server/v2/contract";

const SOURCIFY_CACHE_VERSION = 1;
const sourcifyCache = new FileCache<SourcifyResponse>("sourcifyInfo.json", SOURCIFY_CACHE_VERSION);

async function getSourcifyData(contractAddress: string): Promise<SourcifyResponse> {
  const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  if (sourcifyCache.has(`${contractAddress}-${chainId}`)) {
    return sourcifyCache.get(`${contractAddress}-${chainId}`);
  }
  const url = `${SOURCIFY_API_ENDPOINT}/${chainId}/${contractAddress}`;

  const fields = "sources,compilation";
  const response = await axios.get(url, {
    params: {
      fields,
    },
  });
  if (response.status != 200) {
    throw new Error("sources are not validated");
  }
  sourcifyCache.set(`${contractAddress}-${chainId}`, response.data);
  return response.data;
}

async function getSourcesFromRoutescan(contractAddress: string): Promise<SourcifyResponse> {
  const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  if (sourcifyCache.has(`${contractAddress}-${chainId}`)) {
    return sourcifyCache.get(`${contractAddress}-${chainId}`);
  }

  const apiUrl = getExplorerUrl(hre.network.name);
  const apiKey = hre.network.config.verify.etherscan.apiKey;
  const response: any = await got
    .get(`${apiUrl}api`, {
      searchParams: {
        module: "contract",
        action: "getsourcecode",
        address: contractAddress,
        apikey: apiKey,
      },
    })
    .json();

  if (response.status != 1) {
    throw new Error("sources are not validated");
  }

  //convert to sourcify response
  const sources = response.result[0].SourceCode;
  const parsedSources = JSON.parse(sources.slice(1, -1));

  const sourcifyResponse = {
    address: contractAddress,
    chainId: chainId,
    compilation: {
      name: response.result[0].ContractName,
    },
    sources: parsedSources.sources,
    verifiedAt: "",
    match: "EXACT",
    creationMatch: "EXACT",
  };
  sourcifyCache.set(`${contractAddress}-${chainId}`, sourcifyResponse);
  return sourcifyResponse;
}

async function validateWithExplorer(contractInfo: ContractInfo): Promise<boolean> {
  let sourcifyData: SourcifyResponse;
  const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  if (chainId === 3637) {
    //botanix
    console.log(`Trying to validate ${contractInfo.address} via routescan`);
    sourcifyData = await getSourcesFromRoutescan(contractInfo.address);
  } else {
    console.log(`Trying to validate ${contractInfo.address} via sourcify`);
    sourcifyData = await getSourcifyData(contractInfo.address);
  }

  contractInfo.name = sourcifyData.compilation.name;
  console.log(`Resolved as ${contractInfo.name}`);

  for (const [filename, data] of Object.entries(sourcifyData.sources)) {
    const result = validateSourceFile(filename, data["content"]);
    if (!result) {
      return false;
    }
  }
  contractInfo.isCodeValidated = true;
  return true;
}

function validateSourceFile(fullContractName: string, sourceCode: string): boolean {
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
      showDiff(filePath, sourceCode, fullContractName.replaceAll("/", "-"));
      return false;
    }
  } catch (error) {
    throw new Error("Error reading file:" + error);
  }
}

function showDiff(localPath: string, sourceCode: string, contractName: string) {
  const outDir = path.join(__dirname, `../validation/${hre.network.name}`);
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

  const { contractName, constructorArgs, deploymentTxHash } = extractContractNameAndArgsFromDeployment(
    contractInfo.address
  );
  contractInfo.name = contractName;

  compileContract(contractName);

  const artifactBytecode = getBytecodeWithLinks(contractName);

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

function extractContractNameAndArgsFromDeployment(contractAddress: string): DeploymentInfo {
  const deploymentsPath = path.join(__dirname, "../deployments/" + hre.network.name);
  const searchContractDeployment = checkAddressInFile(contractAddress);
  const deployment = searchDirectory(deploymentsPath, searchContractDeployment);
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

function getArtifact(contractName: string): Artifact {
  const findContract = findFile(contractName + ".json");
  const buildPath = path.join(__dirname, "../artifacts/contracts/");
  const searchResult = searchDirectory(buildPath, findContract);
  if (!searchResult) {
    throw new Error("Artifact not found");
  }

  return JSON.parse(fs.readFileSync(searchResult, "utf-8"));
}

function getBytecodeWithLinks(contractName: string): string {
  const artifact = getArtifact(contractName);

  // convert string to array for inplace replacement
  const arrayBytecode = artifact.bytecode.split("");

  for (const dependency of Object.values(artifact.linkReferences)) {
    const dependencyName = Object.keys(dependency)[0];
    const dependencyPositions = dependency[dependencyName];

    const deploymentFilename = "./deployments/" + hre.network.name + "/" + dependencyName + ".json";
    // extract deployed dependency address and trim 0x
    const addr = getAddressFromDeployment(deploymentFilename).substring(2);

    for (const position of dependencyPositions) {
      // calculate link index. Each byte is 2 symbols + 0x at the start.
      const idx = 2 + position.start * 2;
      arrayBytecode.splice(idx, 40, addr);
    }
  }

  return arrayBytecode.join("");
}

function compileContract(contractName: string) {
  // Find artifact with our contract and remove it to force recompilation of this contract
  const findContract = findFile(contractName + ".sol");
  const buildPath = path.join(__dirname, "../artifacts/contracts/");
  const searchResult = searchDirectory(buildPath, findContract);
  if (searchResult) {
    fs.rmSync(searchResult, { recursive: true, force: true });
  }

  execSync("npx hardhat compile", { stdio: "inherit" });
  console.log(`${contractName} compiled successfully.`);
}

//Using streaming read cause file can be big
const getAddressFromDeployment = (filename: string): string | null => {
  if (fs.lstatSync(filename).isDirectory()) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filename, "utf-8")).address ?? null;
  } catch (error) {
    console.error("Error reading file:", error);
    return null;
  }
};

const checkAddressInFile =
  (address: string) =>
  (filename: string): boolean => {
    const deploymentAddress = getAddressFromDeployment(filename);
    return deploymentAddress === address;
  };

const findFile =
  (searchFile: string) =>
  (filename: string): boolean => {
    return filename.endsWith(searchFile);
  };

// Search recursively through all files in the `dirPath` and test it with `condition`
// Returns filename when condition is true
function searchDirectory(dirPath: string, condition: (filename: string) => boolean): string {
  const contractFiles = fs.readdirSync(dirPath);
  for (const file of contractFiles) {
    const name = path.join(dirPath, file);

    if (condition(name)) {
      return name;
    }

    if (fs.lstatSync(name).isDirectory()) {
      const result = searchDirectory(name, condition);
      if (result) {
        return result;
      }
    }
  }
  return null;
}
