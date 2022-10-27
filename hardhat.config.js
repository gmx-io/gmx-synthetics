require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-deploy");

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
      tokens: {
        WETH: {
          oraclePrecision: 8
        },
        WBTC: {
          oraclePrecision: 20
        },
        USDC: {
          oraclePrecision: 18
        },
      },
      markets: [
        {
          tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
          reserveFactor: [5, 1],
        }
      ]
    },
    localhost: {
      tokens: {
        WETH: {
          oraclePrecision: 8
        },
        WBTC: {
          oraclePrecision: 20
        },
        USDC: {
          oraclePrecision: 18
        },
      },
      markets: [
        {
          tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
          reserveFactor: [5, 1],
        }
      ]
    },
    arbitrum: {
      url: "https://arb1.arbitrum.io/rpc",
      tokens: {
        WETH: {
          oraclePrecision: 8,
          address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
        },
        WBTC: {
          oraclePrecision: 20,
          address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"
        },
        USDC: {
          oraclePrecision: 18,
          address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8"
        },
      }
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
