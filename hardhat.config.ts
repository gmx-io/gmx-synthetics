import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { ethers } from "ethers";

import { HardhatUserConfig, task, types } from "hardhat/config";
import "@nomicfoundation/hardhat-verify";
import "hardhat-contract-sizer";
import "solidity-coverage";
import "hardhat-gas-reporter";
import "hardhat-deploy";
import "@nomicfoundation/hardhat-chai-matchers";

import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "hardhat-abi-exporter";

// extends hre with gmx domain data
import "./config";

// add test helper methods
import "./utils/test";
import { updateGlvConfig } from "./scripts/updateGlvConfigUtils";
import { updateMarketConfig } from "./scripts/updateMarketConfigUtils";
import { collectDeployments } from "./scripts/collectDeployments";
import { generateDeploymentDocs } from "./scripts/generateDeploymentDocs";
import { TASK_FLATTEN_GET_DEPENDENCY_GRAPH } from "hardhat/builtin-tasks/task-names";
import { DependencyGraph } from "hardhat/types";
import { checkContractsSizing } from "./scripts/contractSizes";
import { collectDependents } from "./utils/dependencies";
import { deleteFile, writeJsonFile } from "./utils/file";
import { TASK_VERIFY } from "@nomicfoundation/hardhat-verify/internal/task-names";

const getRpcUrl = (network) => {
  const defaultRpcs = {
    arbitrum: "https://arb1.arbitrum.io/rpc",
    avalanche: "https://api.avax.network/ext/bc/C/rpc",
    botanix: "https://rpc.botanixlabs.com",
    arbitrumGoerli: "https://goerli-rollup.arbitrum.io/rpc",
    arbitrumSepolia: "https://sepolia-rollup.arbitrum.io/rpc",
    sepolia: "https://ethereum-sepolia-rpc.publicnode.com",
    avalancheFuji: "https://api.avax-test.network/ext/bc/C/rpc",
    snowtrace: "https://api.avax.network/ext/bc/C/rpc",
    arbitrumBlockscout: "https://arb1.arbitrum.io/rpc",
  };

  let rpc = defaultRpcs[network];

  const filepath = path.join("./.rpcs.json");
  if (fs.existsSync(filepath)) {
    const data = JSON.parse(fs.readFileSync(filepath).toString());
    if (data[network]) {
      rpc = data[network];
    }
  }

  return rpc;
};

export const getExplorerUrl = (network) => {
  const urls = {
    arbitrum: "https://api.etherscan.io/v2/api?chainid=42161",
    // avalanche: "https://api.snowtrace.io/",
    avalanche: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/",
    botanix: "https://api.routescan.io/v2/network/mainnet/evm/3637/etherscan/",
    snowscan: "https://api.snowscan.xyz/",
    arbitrumGoerli: "https://api-goerli.arbiscan.io/",
    arbitrumSepolia: "https://api.etherscan.io/v2/api?chainid=421614",
    sepolia: "https://api.etherscan.io/v2/api?chainid=11155111",
    avalancheFuji: "https://api-testnet.snowtrace.io/",
    arbitrumBlockscout: "https://arbitrum.blockscout.com/api",
  };

  const url = urls[network];
  if (!url) {
    throw new Error(`Empty explorer url for ${network}`);
  }

  return url;
};

export const getBlockExplorerUrl = (network) => {
  const urls = {
    arbitrum: "https://arbiscan.io",
    avalanche: "https://snowtrace.io",
    botanix: "https://botanixscan.io",
    arbitrumSepolia: "https://sepolia.arbiscan.io",
    avalancheFuji: "https://testnet.snowtrace.io",
  };

  const url = urls[network];
  if (!url) {
    throw new Error(`No block explorer URL configured for network: ${network}`);
  }

  return url;
};

// for etherscan, a single string is expected to be returned
// for other networks / explorers, an object is needed
const getEtherscanApiKey = () => {
  if (process.env.HARDHAT_NETWORK === "arbitrum") {
    return process.env.ARBISCAN_API_KEY;
  }

  return {
    // hardhat-verify plugin uses "avalancheFujiTestnet" name
    arbitrumOne: process.env.ARBISCAN_API_KEY,
    avalanche: process.env.SNOWTRACE_API_KEY,
    arbitrumGoerli: process.env.ARBISCAN_API_KEY,
    sepolia: process.env.ETHERSCAN_API_KEY,
    arbitrumSepolia: process.env.ARBISCAN_API_KEY,
    avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY,
    snowtrace: "snowtrace", // apiKey is not required, just set a placeholder
    arbitrumBlockscout: "arbitrumBlockscout",
    botanix: process.env.BOTANIX_SCAN_API_KEY,
  };
};

const getEnvAccounts = (chainName?: string) => {
  const { ACCOUNT_KEY, ACCOUNT_KEY_FILE, ARBITRUM_SEPOLIA_ACCOUNT_KEY, ARBITRUM_ACCOUNT_KEY } = process.env;

  if (chainName === "arbitrumSepolia" && ARBITRUM_SEPOLIA_ACCOUNT_KEY) {
    return [ARBITRUM_SEPOLIA_ACCOUNT_KEY];
  }

  if (chainName === "arbitrum" && ARBITRUM_ACCOUNT_KEY) {
    return [ARBITRUM_ACCOUNT_KEY];
  }

  if (ACCOUNT_KEY) {
    return [ACCOUNT_KEY];
  }

  if (ACCOUNT_KEY_FILE) {
    const filepath = path.join("./keys/", ACCOUNT_KEY_FILE);
    const data = JSON.parse(fs.readFileSync(filepath).toString());
    if (!data) {
      throw new Error("Invalid key file");
    }

    if (data.key) {
      return [data.key];
    }

    if (!data.mnemonic) {
      throw new Error("Invalid mnemonic");
    }

    const wallet = ethers.Wallet.fromMnemonic(data.mnemonic);
    return [wallet.privateKey];
  }

  return [];
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.29",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10,
            details: {
              constantOptimizer: true,
            },
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      saveDeployments: true,
      allowUnlimitedContractSize: true,
      // forking: {
      //   url: getRpcUrl("arbitrum"),
      //   blockNumber: 370370866,
      // },
    },
    localhost: {
      saveDeployments: true,
    },
    arbitrum: {
      url: getRpcUrl("arbitrum"),
      chainId: 42161,
      accounts: getEnvAccounts(),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("arbitrum"),
          apiKey: process.env.ARBISCAN_API_KEY,
        },
      },
      blockGasLimit: 20_000_000,
    },
    avalanche: {
      url: getRpcUrl("avalanche"),
      chainId: 43114,
      accounts: getEnvAccounts(),
      gasPrice: 200000000000,
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("avalanche"),
          apiKey: process.env.SNOWTRACE_API_KEY,
        },
      },
      blockGasLimit: 15_000_000,
    },
    botanix: {
      url: getRpcUrl("botanix"),
      chainId: 3637,
      accounts: getEnvAccounts(),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("botanix"),
          apiKey: process.env.BOTANIX_SCAN_API_KEY,
        },
      },
      blockGasLimit: 20_000_000,
    },
    snowscan: {
      url: getRpcUrl("avalanche"),
      chainId: 43114,
      accounts: getEnvAccounts(),
      gasPrice: 200000000000,
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("snowscan"),
          apiKey: process.env.SNOWTRACE_API_KEY,
        },
      },
      blockGasLimit: 15_000_000,
    },
    snowtrace: {
      url: getRpcUrl("snowtrace"),
      accounts: getEnvAccounts(),
    },
    arbitrumBlockscout: {
      url: getRpcUrl("arbitrumBlockscout"),
      accounts: getEnvAccounts(),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("arbitrumBlockscout"),
          apiKey: "arbitrumBlockscout",
        },
      },
    },
    arbitrumGoerli: {
      url: getRpcUrl("arbitrumGoerli"),
      chainId: 421613,
      accounts: getEnvAccounts(),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("arbitrumGoerli"),
          apiKey: process.env.ARBISCAN_API_KEY,
        },
      },
      blockGasLimit: 10000000,
    },
    arbitrumSepolia: {
      url: getRpcUrl("arbitrumSepolia"),
      chainId: 421614,
      accounts: getEnvAccounts("arbitrumSepolia"),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("arbitrumSepolia"),
          apiKey: process.env.ARBISCAN_API_KEY,
        },
      },
      blockGasLimit: 10000000,
    },
    sepolia: {
      url: getRpcUrl("sepolia"),
      chainId: 11155111,
      accounts: getEnvAccounts("sepolia"),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("sepolia"),
          apiKey: process.env.ETHERSCAN_API_KEY,
        },
      },
      blockGasLimit: 10000000,
    },
    avalancheFuji: {
      url: getRpcUrl("avalancheFuji"),
      chainId: 43113,
      accounts: getEnvAccounts(),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("avalancheFuji"),
          apiKey: process.env.SNOWTRACE_API_KEY,
        },
      },
      blockGasLimit: 2500000,
      // gasPrice: 50000000000,
    },
  },
  // hardhat-deploy has issues with some contracts
  // https://github.com/wighawag/hardhat-deploy/issues/264
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY, // etherscan v2 uses a single apiKey for all networks
    customChains: [
      {
        network: "snowtrace",
        chainId: 43114,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/",
          browserURL: "https://avalanche.routescan.io",
        },
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://sepolia.arbiscan.io/",
        },
      },
      {
        network: "botanix",
        chainId: 3637,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/mainnet/evm/3637/etherscan",
          browserURL: "https://botanixscan.io",
        },
      },
      {
        network: "avalanche",
        chainId: 43114,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api",
          browserURL: "https://snowtrace.io",
        },
      },
      // {
      //   network: "arbitrumBlockscout",
      //   chainId: 42161,
      //   urls: {
      //     apiURL: "https://arbitrum.blockscout.com/api",
      //     browserURL: "https://arbitrum.blockscout.com",
      //   },
      // },
    ],
  },
  sourcify: {
    enabled: false,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
  namedAccounts: {
    deployer: 0,
  },
  mocha: {
    timeout: 100000000,
  },
  abiExporter: {
    flat: true,
  },
};

task("update-glv-config", "Update GLV config")
  .addParam("write", "Write to the config", false, types.boolean)
  .setAction(updateGlvConfig);

task("update-market-config", "Update market config")
  .addParam("write", "Write to the config", false, types.boolean)
  .addOptionalParam("market", "Market address", undefined, types.string)
  .setAction(updateMarketConfig);

task("dependencies", "Print dependencies for a contract")
  .addPositionalParam("file", "Contract", undefined, types.string)
  .setAction(async ({ file }: { file: string }, { run }) => {
    const graph: DependencyGraph = await run(TASK_FLATTEN_GET_DEPENDENCY_GRAPH, { files: [file] });
    const dependencies = graph.getResolvedFiles().map((value) => {
      return value.sourceName;
    });
    console.log(dependencies);
    return graph;
  });

task("deploy", "Deploy contracts", async (taskArgs: any, env, runSuper) => {
  env.deployTags = taskArgs.tags ?? "";
  if (
    !(process.env.SKIP_AUTO_HANDLER_REDEPLOYMENT == "true" || process.env.SKIP_AUTO_HANDLER_REDEPLOYMENT == "false") &&
    env.network.name != "hardhat"
  ) {
    throw new Error("SKIP_AUTO_HANDLER_REDEPLOYMENT flag is mandatory");
  }
  await runSuper();
});

task("collect-deployments", "Collect current deployments into the docs folder").setAction(collectDeployments);

task("generate-deployment-docs", "Generate deployment documentation for all networks")
  .addOptionalParam("networks", "Comma-separated list of networks to update", undefined, types.string)
  .setAction(async (taskArgs) => {
    const networks = taskArgs.networks ? taskArgs.networks.split(",") : undefined;
    await generateDeploymentDocs(networks);
  });

task("measure-contract-sizes", "Check if contract characters count hit 900k limit").setAction(async (taskArgs, env) => {
  await checkContractsSizing(env);
});

task("reverse-dependencies", "Print dependent contracts")
  .addPositionalParam("file", "Contract", undefined, types.string)
  .setAction(async ({ file }: { file: string }, { run }) => {
    const graph: DependencyGraph = await run(TASK_FLATTEN_GET_DEPENDENCY_GRAPH, {});
    const reversed = await collectDependents(graph, file);
    console.log(`Contract ${file} dependents are:\n`);
    console.log([...reversed].map((l) => `${l}`).join("\n"));
    return reversed;
  });

function parseInputArgs(input: string): string[] | string {
  if (input.startsWith("{")) return JSON.parse(input);
  if (input.startsWith('"')) return input.substring(1, input.length - 1);
  if (!input.startsWith("[") || !input.endsWith("]")) return input;

  return JSON.parse(input);
}

// Override default verify task to work with array arguments.
// Create temporary arguments file and pass it to the hardhat-verify task
// THIS TASK SHOULD BE USED ONLY WITH verifyFallback.ts script!
task("verify-complex-args", "Verify contract with complex args", async (taskArgs: any, env) => {
  try {
    const cacheFilePath = `./cache/verifications-args-${taskArgs.address}.json`;
    let args = [];
    if (taskArgs.constructorArgsParams != undefined && taskArgs.constructorArgsParams != "") {
      // split args string with spaces, but do not split quoted strings
      // "A B C" D E => ["A B C", "D", "E"]
      args = taskArgs.constructorArgsParams.match(/"[^"]*"|\[[^\]]*\]|\S+/g);
    }

    const parsed = args.map(parseInputArgs);
    writeJsonFile(cacheFilePath, parsed);
    taskArgs.constructorArgsParams = undefined;
    taskArgs.constructorArgs = cacheFilePath;

    await env.run(TASK_VERIFY, taskArgs);

    deleteFile(cacheFilePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
});

export default config;
