import { setTimeout as sleep } from "timers/promises";
import hre from "hardhat";
import { getExplorerUrl } from "../hardhat.config";
import got from "got";

const { ethers } = hre;

const ERC1820_REGISTRY = "0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24";
const ERC1820_ABI = [
  "function getInterfaceImplementer(address account, bytes32 interfaceHash) external view returns (address)",
];
// Hash of "ERC777Token" per ERC-1820 spec
const ERC777_INTERFACE_HASH = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ERC777Token"));

const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
// const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"; // admin-based behavior isn’t  different for callback detection and ERC777 check, so no need to take different actions based on proxy type
const BEACON_SLOT = "0xa3f0ad74e5424f2d3d81c7cdd48ab208b5bfa6d06c18a42f3b72a1f3eab72c36";

const callbackFunctionNames = [
  "onTokenReceived",
  "onTransferReceived",
  "tokensReceived",
  "tokensToSend",
  "transferAndCall",
  "approveAndCall",
];

async function fetchAbi(address) {
  const apiUrl = getExplorerUrl(hre.network.name);
  const apiKey = hre.network.config.verify.etherscan.apiKey;
  const res: any = await got
    .get(`${apiUrl}api`, {
      searchParams: {
        module: "contract",
        action: "getabi",
        address,
        apikey: apiKey,
      },
    })
    .json();

  if (res.status !== "1") {
    throw new Error("Failed to fetch ABI from Etherscan.");
  }

  await sleep(200);
  return JSON.parse(res.result);
}

async function detectCallbackFunctions(address) {
  const abi = await fetchAbi(address);
  const iface = new ethers.utils.Interface(abi);
  const functions = Object.keys(iface.functions);

  return functions.filter((fn) => callbackFunctionNames.some((name) => fn.includes(name)));
}

export async function isErc777Token(tokenAddress) {
  const provider = ethers.provider;
  const registry = new ethers.Contract(ERC1820_REGISTRY, ERC1820_ABI, provider);

  const implementer = await registry.getInterfaceImplementer(tokenAddress, ERC777_INTERFACE_HASH);

  return implementer !== ethers.constants.AddressZero;
}

function parseAddress(slot) {
  return ethers.utils.getAddress(`0x${slot.slice(-40)}`);
}

async function getBeaconImplementation(beaconAddress) {
  try {
    const beacon = new ethers.Contract(
      beaconAddress,
      ["function implementation() view returns (address)"],
      ethers.provider
    );
    return await beacon.implementation();
  } catch {
    return null;
  }
}

export async function validateTokens() {
  const tokens = await hre.gmx.getTokens();
  console.log(`validating ${Object.entries(tokens).length} tokens ...`);

  const errors = [];

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    let upgradeability = null;
    let implementationAddress = null;

    console.log("");

    if (!token.decimals) {
      throw new Error(`token ${tokenSymbol} has no decimals`);
    }

    if (token.synthetic) {
      console.log(`skipping ${tokenSymbol} as it is synthetic`);
      continue;
    }

    console.log(`checking ${tokenSymbol}`);

    const tokenContract = await ethers.getContractAt("MarketToken", token.address);

    const decimals = await tokenContract.decimals();

    if (decimals !== token.decimals) {
      throw new Error(
        `invalid token decimals for ${tokenSymbol}, configuration: ${token.decimals}, fetched: ${decimals}`
      );
    }

    const isErc777 = await isErc777Token(token.address);
    console.log(`isErc777: ${isErc777}`);
    if (isErc777) {
      errors.push(`${tokenSymbol} is an ERC777 token`);
    }

    const callbacks = await detectCallbackFunctions(token.address);
    console.log(`hasCallbacks: ${callbacks.length > 0}`);

    if (callbacks.length > 0) {
      errors.push(`${tokenSymbol} hasCallbacks: ${callbacks.join(",")}`);
    }

    const implSlot = await ethers.provider.getStorageAt(token.address, IMPLEMENTATION_SLOT);
    const beaconSlot = await ethers.provider.getStorageAt(token.address, BEACON_SLOT);

    if (beaconSlot !== ethers.constants.HashZero) {
      upgradeability = "beacon";
      implementationAddress = await getBeaconImplementation(parseAddress(beaconSlot));
    } else if (implSlot !== ethers.constants.HashZero) {
      upgradeability = "transparent or uups";
      implementationAddress = parseAddress(implSlot);
    }

    if (implementationAddress) {
      console.log(`upgradeable: ${upgradeability}`);
      console.log(`implementation: ${implementationAddress}`);

      const implCallbacks = await detectCallbackFunctions(implementationAddress);
      console.log(`implHasCallbacks: ${implCallbacks.length > 0}`);
      if (implCallbacks.length > 0) {
        errors.push(`${tokenSymbol} implHasCallbacks: ${implCallbacks.join(",")}`);
      }
    }
  }
  console.log(`\n... validated ${Object.entries(tokens).length} tokens`);
  console.log(`\nerrors: ${errors.length}`);
  for (const error of errors) {
    console.log(`error: ${error}`);
  }
}

async function main() {
  await validateTokens();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
