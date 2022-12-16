import { HardhatRuntimeEnvironment } from "hardhat/types";

export type MarketConfig = {
  tokens: [indexToken: string, longToken: string, shortToken: string];
  reserveFactor: [number, number];

  positionFeeFactor?: number | string;
  positivePositionImpactFactor?: number | string;
  negativePositionImpactFactor?: number | string;
  positionImpactExponentFactor?: number | string;

  swapFeeFactor?: number | string;
  positiveSwapImpactFactor?: number | string;
  negativeSwapImpactFactor?: number | string;
  swapImpactExponentFactor?: number | string;
};

const config: {
  [network: string]: MarketConfig[];
} = {
  arbitrum: [],
  arbitrumGoerli: [],
  avalanche: [],
  avalancheFuji: [
    {
      tokens: ["WAVAX", "WAVAX", "USDC"], // indexToken, longToken, shortToken
      reserveFactor: [2, 1],

      positionFeeFactor: 100,
      positivePositionImpactFactor: 200,
      negativePositionImpactFactor: 100,
      positionImpactExponentFactor: 300,

      swapFeeFactor: 100,
      positiveSwapImpactFactor: 200,
      negativeSwapImpactFactor: 100,
      swapImpactExponentFactor: 300,
    },
    {
      tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
      reserveFactor: [1, 1],
    },
    {
      tokens: ["SOL", "WETH", "USDC"], // indexToken, longToken, shortToken
      reserveFactor: [5, 1],
    },
  ],
  hardhat: [
    {
      tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
      reserveFactor: [5, 1],
    },
    {
      tokens: ["SOL", "WETH", "USDC"],
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

export default async function (hre: HardhatRuntimeEnvironment) {
  const markets = config[hre.network.name];
  const tokens = await hre.gmx.getTokens();
  if (markets) {
    for (const market of markets) {
      for (const tokenSymbol of market.tokens) {
        if (!tokens[tokenSymbol]) {
          throw new Error(`Market ${market.tokens.join(":")} uses token that does not exist: ${tokenSymbol}`);
        }
      }
    }
  }
  return markets;
}
