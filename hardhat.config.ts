import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";
import "solidity-coverage";
import "hardhat-gas-reporter";
import "hardhat-deploy";

import allTokens from "./config/tokens";
import allMarkets from "./config/markets";

extendEnvironment((hre) => {
  // extend hre context with gmx domain data
  hre.gmx = {
    tokens: allTokens[hre.network.name] || {},
    markets: allMarkets[hre.network.name] || [],
  };
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.16",
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
  networks: {
    hardhat: {
      saveDeployments: true,
    },
    arbitrum: {
      url: "https://arb1.arbitrum.io/rpc",
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
  namedAccounts: {
    deployer: 0,
    oracleSigner0: "0xFb11f15f206bdA02c224EDC744b0E50E46137046", // G
  },
};

export default config;
