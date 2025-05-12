import hre from "hardhat";
import axios from "axios";
import { FileCache } from "./cacheUtils";

const CONTRACT_NAME_CACHE_VERSION = 1;
interface ContractName {
  contractName: string | undefined;
  isVerified: boolean;
}
const nameCache = new FileCache<ContractName>("contractName.json", CONTRACT_NAME_CACHE_VERSION);

const CONTRACT_CREATION_CACHE_VERSION = 1;
interface ContractCreation {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  contractFactory: string;
  creationBytecode: string;
}
const creationCache = new FileCache<ContractCreation>("contractCreation.json", CONTRACT_CREATION_CACHE_VERSION);

export async function getContractNameFromEtherscan(contractAddress: string): Promise<ContractName> {
  if (nameCache.has(contractAddress)) {
    return nameCache.get(contractAddress);
  }

  const response = await _requestEtherscan({
    action: "getsourcecode",
    address: contractAddress,
  });
  const sources: string = response.result[0].SourceCode;
  if (sources === "") {
    // source code not verified
    // do not store unverified response in cache cause it may be verified later
    return { contractName: undefined, isVerified: false };
  }
  const info = { contractName: response.result[0].ContractName, isVerified: true };
  nameCache.set(contractAddress, info);
  return info;
}

export async function getContractCreationFromEtherscan(contractAddress: string): Promise<ContractCreation> {
  if (creationCache.has(contractAddress)) {
    return creationCache.get(contractAddress);
  }

  const response = await _requestEtherscan({
    action: "getcontractcreation",
    contractaddresses: contractAddress,
  });
  const data = response.result[0];
  const info = {
    contractAddress: data.contractAddress,
    contractCreator: data.contractCreator,
    txHash: data.txHash,
    blockNumber: Number(data.blockNumber),
    timestamp: Number(data.timestamp),
    contractFactory: data.contractFactory,
    creationBytecode: data.creationBytecode,
  };
  creationCache.set(contractAddress, info);
  return info;
}

async function _requestEtherscan(params: Record<string, any>) {
  const apiKey = hre.network.verify.etherscan.apiKey;
  const baseUrl = hre.network.verify.etherscan.apiUrl + "api";
  const response = await axios.get(baseUrl, {
    params: {
      ...params,
      apikey: apiKey,
      module: "contract",
    },
  });
  return response.data;
}
