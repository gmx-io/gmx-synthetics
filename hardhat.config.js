require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-deploy");

extendEnvironment((hre) => {
  // extend hre context with gmx domain data
  hre.gmx = {
    tokens: require("./config/tokens")[hre.network.name] || {},
    markets: require("./config/markets")[hre.network.name] || []
  }
})

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
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
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
  namedAccounts: {
    deployer: 0,

    oracleSigner0: "0xFb11f15f206bdA02c224EDC744b0E50E46137046" // G
  }
};
