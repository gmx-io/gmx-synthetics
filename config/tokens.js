module.exports = {
  arbitrum: {
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
  },
  avalanche: {},

  // token addresses are retrieved in runtime for hardhat and localhost networks
  hardhat: {
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
  localhost: {
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
}
