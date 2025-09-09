import { Interface } from "ethers/lib/utils";
import fs from "fs";
import hre from "hardhat";

const traceFileName = process.env.TRACE ?? "trace.json";

type Call = {
  from: string;
  gas: string;
  gasUsed: string;
  to: string;
  input: string;
  output: string;
  value: string;
  type: string;
  calls?: Call[];
  error?: string;
};

type AddressToInfo = Record<string, { name: string; abi?: any }>;

async function main() {
  const tokenContract = await hre.ethers.getContractAt("MintableToken", "0x0000000000000000000000000000000000000000");
  const allDeployments = await hre.deployments.all();
  const addressToInfo: AddressToInfo = Object.fromEntries(
    Object.entries(allDeployments).map(([name, deployment]) => [deployment.address, { name, abi: deployment.abi }])
  );

  const tokens = await hre.gmx.getTokens();
  Object.entries(tokens).forEach(([symbol, token]) => {
    if (token.address) {
      addressToInfo[token.address] = {
        name: symbol,
        abi: symbol === "pBTC" ? pBTC_ABI : tokenContract.abi,
      };
    }
  });
  addressToInfo["0x61aCe8fBA7B80AEf8ED67f37CB60bE00180872aD"] = {
    name: "Gelato_RelayProxy",
  };
  addressToInfo["0xDA1b841A21FEF1ad1fcd5E19C1a9D682FB675258"] = {
    name: "GMX_RelayFeeHolder",
  };

  for (const [address, info] of Object.entries(addressToInfo)) {
    const lowerAddress = address.toLocaleLowerCase();
    if (!addressToInfo[lowerAddress]) {
      addressToInfo[lowerAddress] = info;
      delete addressToInfo[address];
    }
  }

  const trace = JSON.parse(fs.readFileSync(traceFileName, "utf8")).result as Call;
  printCall(trace, addressToInfo);
  console.log("OK");
}

function printCall(call: Call, addressToInfo: AddressToInfo, indent = 0) {
  const functionData = getFunctionData(call.to, call.input, call.output, addressToInfo);
  console.log(
    `${"  ".repeat(indent)}${getName(call.from, addressToInfo, true)} -> ${getName(call.to, addressToInfo, true)}.${
      functionData.name
    }(${functionData.args}) = ${functionData.result}`
  );
  if (call.calls) {
    for (const innerCall of call.calls) {
      printCall(innerCall, addressToInfo, indent + 1);
    }
  }
}

function getInfo(address: string, addressToInfo: AddressToInfo) {
  return addressToInfo[address?.toLocaleLowerCase?.()];
}

function getName(address: string, addressToInfo: AddressToInfo, keepAddress = false) {
  const info = getInfo(address, addressToInfo);
  if (info) {
    if (keepAddress) {
      return `${info.name} (${address})`;
    }
    return info.name;
  }
  return address;
}

function getFunctionData(address: string, input: string, output: string, addressToInfo: AddressToInfo) {
  const info = getInfo(address, addressToInfo);
  const selector = input.slice(0, 10);
  if (info?.abi) {
    try {
      const iface = new Interface(info.abi);
      const fragment = iface.getFunction(selector);
      const decoded = iface.decodeFunctionData(fragment, input);
      const isArray = decoded.length === Object.keys(decoded).length;
      const argsString = isArray
        ? decoded.map((value) => getName(value.toString(), addressToInfo))
        : Object.entries(decoded)
            .filter(([key]) => isNaN(Number(key)))
            .map(([key, value]) => {
              return `${key}: ${getInfo(value, addressToInfo)?.name ?? value}`;
            })
            .join(", ");
      const functionResult = iface
        .decodeFunctionResult(fragment.name, output)
        .map((value) => getName(value.toString(), addressToInfo) ?? value.toString());
      return { name: fragment.name, args: argsString, result: functionResult };
    } catch (error) {
      console.warn("can't find function", address, selector, error.toString());
    }
  }
  return {
    name: selector,
    args: "0x" + input.slice(10),
    result: output,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const pBTC_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "src",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "guy",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "wad",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "dst",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "wad",
        type: "uint256",
      },
    ],
    name: "Deposit",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "src",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "dst",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "wad",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "src",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "wad",
        type: "uint256",
      },
    ],
    name: "Withdrawal",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "allowance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "guy",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "wad",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "dst",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "wad",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "src",
        type: "address",
      },
      {
        internalType: "address",
        name: "dst",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "wad",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "wad",
        type: "uint256",
      },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
];
