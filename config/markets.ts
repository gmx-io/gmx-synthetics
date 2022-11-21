export type MarketConfig = {
  tokens: [indexToken: string, longToken: string, shortToken: string];
  reserveFactor: [number, number];
};

const config: {
  [network: string]: MarketConfig[];
} = {
  arbitrum: [],
  arbitrumGoerli: [],
  avalanche: [],
  avalancheFuji: [
    {
      tokens: ["WAVAX", "WAVAX", "USDT"], // indexToken, longToken, shortToken
      reserveFactor: [2, 1],
    },
    {
      tokens: ["WETH", "WETH", "USDT"], // indexToken, longToken, shortToken
      reserveFactor: [1, 1],
    },
    {
      tokens: ["SOL", "WETH", "USDT"], // indexToken, longToken, shortToken
      reserveFactor: [5, 1],
    },
  ],
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
    {
      tokens: ["SOL", "WETH", "USDC"],
      reserveFactor: [5, 1],
    },
  ],
};

export default config;
