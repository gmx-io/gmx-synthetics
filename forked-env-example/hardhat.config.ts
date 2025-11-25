import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import { subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";

// Filter out Foundry-specific files that import forge-std
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, __, runSuper) => {
  const paths = await runSuper();
  // Exclude GmxForkHelpers.sol which is Foundry-only
  return paths.filter((p: string) => !p.includes("GmxForkHelpers.sol"));
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris", // Arbitrum uses Paris EVM version
    },
  },
  networks: {
    anvil: {
      url: "http://127.0.0.1:8545",
      chainId: 42161, // Arbitrum mainnet chain ID (preserved in fork)
      accounts: [
        // Anvil's default accounts (first 3)
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
      ],
      timeout: 60000,
    },
    hardhat: {
      chainId: 42161,
      forking: {
        url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
        blockNumber: 392496384,
        enabled: true,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./scripts", // TypeScript tests are in scripts/ not test/
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v5",
  },
};

export default config;
