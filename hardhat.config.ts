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

const getNetworkFromCLI = () => {
  if (process.env.HARDHAT_NETWORK) return process.env.HARDHAT_NETWORK;
  const i = process.argv.indexOf("--network");
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : "hardhat";
};

const HARDHAT_NETWORK = getNetworkFromCLI();

const getRpcUrl = (network) => {
  const defaultRpcs = {
    arbitrum: "https://arb1.arbitrum.io/rpc",
    avalanche: "https://api.avax.network/ext/bc/C/rpc",
    botanix: "https://rpc.botanixlabs.com",
    megaEth: "https://mainnet.megaeth.com/rpc",
    ethereum: "https://mainnet.gateway.tenderly.co",
    base: "https://base.gateway.tenderly.co",
    bsc: "https://bsc-dataseed.binance.org",
    bera: "https://rpc.berachain.com",
    arbitrumGoerli: "https://goerli-rollup.arbitrum.io/rpc",
    arbitrumSepolia: "https://sepolia-rollup.arbitrum.io/rpc",
    sepolia: "https://ethereum-sepolia-rpc.publicnode.com",
    avalancheFuji: "https://api.avax-test.network/ext/bc/C/rpc",
    baseSepolia: "https://sepolia.base.org",
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
    megaEth: "https://megaeth.blockscout.com/api",
    snowscan: "https://api.snowscan.xyz/",
    arbitrumGoerli: "https://api-goerli.arbiscan.io/",
    arbitrumSepolia: "https://api.etherscan.io/v2/api?chainid=421614",
    baseSepolia: "https://api.etherscan.io/v2/api?chainid=84532",
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
    megaEth: "https://megaeth.blockscout.com",
    arbitrumSepolia: "https://sepolia.arbiscan.io",
    baseSepolia: "https://sepolia.basescan.io",
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
  if (["arbitrum", "arbitrumSepolia"].includes(HARDHAT_NETWORK)) {
    return process.env.ARBISCAN_API_KEY;
  }

  return {
    // hardhat-verify plugin uses "avalancheFujiTestnet" name
    arbitrumOne: process.env.ARBISCAN_API_KEY,
    avalanche: process.env.SNOWTRACE_API_KEY,
    arbitrumGoerli: process.env.ARBISCAN_API_KEY,
    sepolia: process.env.ETHERSCAN_API_KEY,
    arbitrumSepolia: process.env.ARBISCAN_API_KEY,
    baseSepolia: process.env.BASESCAN_API_KEY,
    avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY,
    snowtrace: "snowtrace", // apiKey is not required, just set a placeholder
    arbitrumBlockscout: "arbitrumBlockscout",
    botanix: process.env.BOTANIX_SCAN_API_KEY,
    megaEth: process.env.MEGA_ETH_EXPLORER_API_KEY,
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
    anvil: {
      url: "http://127.0.0.1:8545",
      chainId: Number(process.env.FORK_ID) || 42161, // default to Arbitrum One
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
    // for MegaETH, note that the "Gas forwarding rule" and "Gas model" is
    // slightly different (https://docs.megaeth.com/megaevm)
    // this should be noted as it can lead to some inaccuracy in gas calculations
    megaEth: {
      url: getRpcUrl("megaEth"),
      chainId: 4326,
      accounts: getEnvAccounts(),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("megaEth"),
          apiKey: process.env.MEGA_ETH_EXPLORER_API_KEY,
        },
      },
      blockGasLimit: 20_000_000,
    },
    ethereum: {
      url: getRpcUrl("ethereum"),
      chainId: 1,
      accounts: getEnvAccounts(),
    },
    base: {
      url: getRpcUrl("base"),
      chainId: 8453,
      accounts: getEnvAccounts(),
    },
    bsc: {
      url: getRpcUrl("bsc"),
      chainId: 56,
      accounts: getEnvAccounts(),
    },
    bera: {
      url: getRpcUrl("bera"),
      chainId: 80094,
      accounts: getEnvAccounts(),
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
    baseSepolia: {
      url: getRpcUrl("baseSepolia"),
      chainId: 84532,
      accounts: getEnvAccounts("baseSepolia"),
      verify: {
        etherscan: {
          apiUrl: getExplorerUrl("baseSepolia"),
          apiKey: process.env.BASESCAN_API_KEY,
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
    apiKey: getEtherscanApiKey(),
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
      {
        network: "megaEth",
        chainId: 4326,
        urls: {
          apiURL: "https://megaeth.blockscout.com/api",
          browserURL: "https://megaeth.blockscout.com/",
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
    console.log(JSON.stringify(dependencies, null, 2));
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

task("deploy:dry-run", "Preview what contracts would be deployed without broadcasting transactions")
  .addOptionalParam("tags", "Deploy script tags", undefined, types.string)
  .setAction(async (taskArgs: any, hre) => {
    const report: { name: string; action: string; address?: string }[] = [];
    const dryRunDeployments = new Map<string, any>();

    // Back up .migrations.json — the deploy pipeline writes migration IDs for scripts
    // that return true (all scripts with `id`), which would "burn" the ID and cause
    // a subsequent real deploy to skip them
    const deploymentsNetworkDir = path.join(__dirname, "deployments", hre.network.name);
    const migrationsPath = path.join(deploymentsNetworkDir, ".migrations.json");
    const migrationsBackup = fs.existsSync(migrationsPath) ? fs.readFileSync(migrationsPath, "utf8") : null;

    // The deploy task requires SKIP_AUTO_HANDLER_REDEPLOYMENT to be set for non-hardhat networks;
    // default to "true" for dry-runs so the task doesn't abort with an empty report
    const origSkipEnv = process.env.SKIP_AUTO_HANDLER_REDEPLOYMENT;
    if (origSkipEnv === undefined) {
      process.env.SKIP_AUTO_HANDLER_REDEPLOYMENT = "true";
    }

    const originalDeploy = hre.deployments.deploy;
    const originalExecute = hre.deployments.execute;
    const originalGet = hre.deployments.get;
    const originalGetOrNull = hre.deployments.getOrNull;

    // Patch get/getOrNull to resolve contracts that would be newly deployed
    hre.deployments.get = async (name: string) => {
      try {
        return await originalGet.call(hre.deployments, name);
      } catch (e) {
        const stub = dryRunDeployments.get(name);
        if (stub) return stub;
        throw e;
      }
    };

    hre.deployments.getOrNull = async (name: string) => {
      const result = await originalGetOrNull.call(hre.deployments, name);
      if (result) return result;
      return dryRunDeployments.get(name) || null;
    };

    hre.deployments.deploy = async (name: string, options: any): Promise<any> => {
      try {
        const diff = await hre.deployments.fetchIfDifferent(name, options);
        const existing = await originalGetOrNull.call(hre.deployments, name);

        if (diff.differences) {
          if (existing) {
            report.push({ name, action: "REDEPLOY", address: existing.address });
          } else {
            report.push({ name, action: "NEW" });
          }
        } else {
          report.push({ name, action: "SKIP", address: diff.address || existing?.address });
        }

        if (existing) {
          return { ...existing, newlyDeployed: false };
        }
        // New contract — store a stub so downstream scripts can resolve this dependency
        const stub = {
          address: ethers.constants.AddressZero,
          abi: [],
          newlyDeployed: false,
          receipt: { transactionHash: ethers.constants.HashZero },
        };
        dryRunDeployments.set(name, stub);
        return stub;
      } catch (e) {
        report.push({ name, action: "ERROR", address: String(e) });
        const existing = await originalGetOrNull.call(hre.deployments, name);
        if (existing) return { ...existing, newlyDeployed: false };
        throw e;
      }
    };

    hre.deployments.execute = async (name: string, opts: any, methodName: string, ...args: any[]): Promise<any> => {
      report.push({ name, action: `WOULD CALL ${methodName}` });
      return { events: [], status: 1 } as any;
    };

    // Intercept state-changing RPC calls so direct ethers contract calls
    // (e.g. ethers.getContractAt(...).setKeeper(...)) become no-ops.
    // View calls (eth_call) pass through to the real network.
    const fakeTransactionHashes = new Set<string>();
    let fakeTxCounter = 0;
    const originalRequest = hre.network.provider.request.bind(hre.network.provider);
    hre.network.provider.request = async (args: { method: string; params?: any[] }) => {
      if (args.method === "eth_estimateGas") {
        return "0x100000";
      }
      if (args.method === "eth_sendTransaction" || args.method === "eth_sendRawTransaction") {
        const fakeHash = ethers.utils.hexZeroPad(ethers.utils.hexlify(++fakeTxCounter), 32);
        fakeTransactionHashes.add(fakeHash);
        return fakeHash;
      }
      if (args.method === "eth_getTransactionReceipt" && fakeTransactionHashes.has(args.params?.[0])) {
        return {
          transactionHash: args.params[0],
          blockHash: ethers.constants.HashZero,
          blockNumber: "0x1",
          contractAddress: null,
          cumulativeGasUsed: "0x100000",
          gasUsed: "0x100000",
          logs: [],
          logsBloom: "0x" + "0".repeat(512),
          status: "0x1",
          from: ethers.constants.AddressZero,
          to: ethers.constants.AddressZero,
          transactionIndex: "0x0",
        };
      }
      if (args.method === "eth_getTransactionByHash" && fakeTransactionHashes.has(args.params?.[0])) {
        return {
          hash: args.params[0],
          blockHash: ethers.constants.HashZero,
          blockNumber: "0x1",
          from: ethers.constants.AddressZero,
          gas: "0x100000",
          gasPrice: "0x0",
          input: "0x",
          nonce: "0x0",
          to: ethers.constants.AddressZero,
          transactionIndex: "0x0",
          value: "0x0",
        };
      }
      return originalRequest(args);
    };

    let exitedEarly = false;
    try {
      await hre.run("deploy", { tags: taskArgs.tags });
    } catch (e) {
      exitedEarly = true;
      console.log(`\nNote: deploy flow exited early: ${e.message}\n`);
    } finally {
      hre.deployments.deploy = originalDeploy;
      hre.deployments.execute = originalExecute;
      hre.deployments.get = originalGet;
      hre.deployments.getOrNull = originalGetOrNull;
      hre.network.provider.request = originalRequest;

      // Restore .migrations.json to its pre-dry-run state
      if (migrationsBackup !== null) {
        fs.writeFileSync(migrationsPath, migrationsBackup);
      } else if (fs.existsSync(migrationsPath)) {
        fs.unlinkSync(migrationsPath);
      }

      // Restore env var
      if (origSkipEnv === undefined) {
        delete process.env.SKIP_AUTO_HANDLER_REDEPLOYMENT;
      }
    }

    console.log("\n════════════════════════════════════════════");
    console.log(`  Deploy Dry-Run Report (${hre.network.name})`);
    console.log("════════════════════════════════════════════\n");

    const redeploys = report.filter((r) => r.action === "REDEPLOY" || r.action === "NEW");
    const skips = report.filter((r) => r.action === "SKIP");
    const calls = report.filter((r) => r.action.startsWith("WOULD CALL"));
    const errors = report.filter((r) => r.action === "ERROR");

    if (redeploys.length > 0) {
      console.log(`WILL BE DEPLOYED (${redeploys.length}):`);
      for (const r of redeploys) {
        const detail = r.action === "REDEPLOY" ? `(replacing ${r.address})` : "(new)";
        console.log(`  ● ${r.name} ${detail}`);
      }
      console.log();
    }

    if (skips.length > 0) {
      console.log(`UNCHANGED (${skips.length} will be skipped):`);
      for (const r of skips) {
        console.log(`  ○ ${r.name} at ${r.address}`);
      }
      console.log();
    }

    if (calls.length > 0) {
      console.log("STATE-CHANGING CALLS:");
      for (const r of calls) {
        console.log(`  --> ${r.name}.${r.action.replace("WOULD CALL ", "")}()`);
      }
      console.log();
    }

    if (errors.length > 0) {
      console.log("ERRORS:");
      for (const r of errors) {
        console.log(`  ✗ ${r.name}: ${r.address}`);
      }
      console.log();
    }

    if (redeploys.length === 0) {
      console.log("Nothing to deploy — all contracts are up to date.\n");
    }

    // Cross-reference against all deployment files on disk
    const deploymentsDir = path.join(__dirname, "deployments", hre.network.name);
    if (fs.existsSync(deploymentsDir)) {
      const allDeploymentFiles = fs.readdirSync(deploymentsDir).filter((f) => {
        return f.endsWith(".json") && !f.startsWith(".") && f !== "solcInputs";
      });
      const allDeployedNames = allDeploymentFiles.map((f) => f.replace(".json", ""));
      const reportedNames = new Set(report.filter((r) => !r.action.startsWith("WOULD CALL")).map((r) => r.name));
      const notReached = allDeployedNames.filter((name) => !reportedNames.has(name));

      // Read .migrations.json to distinguish migration-skipped vs skip()-skipped
      const migrationsPath = path.join(deploymentsDir, ".migrations.json");
      const migrationNames = new Set<string>();
      if (fs.existsSync(migrationsPath)) {
        const migrations = JSON.parse(fs.readFileSync(migrationsPath, "utf8"));
        for (const id of Object.keys(migrations)) {
          migrationNames.add(id.replace(/_\d+$/, ""));
        }
      }

      const deployScriptsDir = path.join(__dirname, "deploy");
      const hasDeployScript = (name: string) => fs.existsSync(path.join(deployScriptsDir, `deploy${name}.ts`));

      const migrationSkipped = notReached.filter((name) => migrationNames.has(name));
      const nonMigration = notReached.filter((name) => !migrationNames.has(name));
      const skipFnSkipped = nonMigration.filter((name) => hasDeployScript(name));
      const noDeployScript = nonMigration.filter((name) => !hasDeployScript(name));

      if (migrationSkipped.length > 0) {
        console.log(`MIGRATION ID SKIPPED (${migrationSkipped.length} — id already in .migrations.json):`);
        for (const name of migrationSkipped.sort()) {
          console.log(`  - ${name}`);
        }
        console.log();
      }

      if (skipFnSkipped.length > 0) {
        if (exitedEarly) {
          console.log(`NOT REACHED (${skipFnSkipped.length} — deploy flow exited early, may deploy in a real run):`);
        } else {
          console.log(`SKIP FUNCTION SKIPPED (${skipFnSkipped.length} — skip() returned true):`);
        }
        for (const name of skipFnSkipped.sort()) {
          console.log(`  - ${name}`);
        }
        console.log();
      }

      if (noDeployScript.length > 0) {
        console.log(`NO DEPLOY SCRIPT (${noDeployScript.length} — no deploy/deploy{Name}.ts found):`);
        for (const name of noDeployScript.sort()) {
          console.log(`  - ${name}`);
        }
        console.log();
      }

      const newContracts = redeploys.filter((r) => r.action === "NEW").length;
      const redeployContracts = redeploys.length - newContracts;
      const total =
        redeploys.length + skips.length + migrationSkipped.length + skipFnSkipped.length + noDeployScript.length;
      console.log("────────────────────────────────────────────");
      console.log(
        `  Total: ${total} | Deploy: ${
          redeploys.length
        } (${redeployContracts} redeploy, ${newContracts} new) | Unchanged: ${skips.length} | Migration-skipped: ${
          migrationSkipped.length
        } | ${exitedEarly ? "Not reached" : "skip()-skipped"}: ${skipFnSkipped.length} | No script: ${
          noDeployScript.length
        }`
      );
      console.log("────────────────────────────────────────────\n");
    }
  });

task("collect-deployments", "Collect current deployments into the docs folder").setAction(collectDeployments);

task("generate-deployment-docs", "Generate deployment documentation for all networks")
  .addOptionalParam("networks", "Comma-separated list of networks to update", undefined, types.string)
  .setAction(async (taskArgs) => {
    const networks = taskArgs.networks ? taskArgs.networks.split(",") : undefined;
    await generateDeploymentDocs(networks);
    await collectDeployments();
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
