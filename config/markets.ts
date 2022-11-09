export default {
  arbitrum: [],
  avalanche: [],
  hardhat: [
    {
      tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
      reserveFactor: [5, 1],
    },
  ],
  localhost: [
    {
      tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
      reserveFactor: [5, 1],
    },
  ],
};
