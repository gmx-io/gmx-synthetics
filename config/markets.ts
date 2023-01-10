import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { decimalToFloat } from "../utils/math";

export type BaseMarketConfig = {
  reserveFactorLongs: BigNumberish;
  reserveFactorShorts: BigNumberish;

  maxPnlFactorLongs: BigNumberish;
  maxPnlFactorShorts: BigNumberish;

  maxPnlFactorForWithdrawalsLongs: BigNumberish;
  maxPnlFactorForWithdrawalsShorts: BigNumberish;

  positionFeeFactor: BigNumberish;
  positivePositionImpactFactor: BigNumberish;
  negativePositionImpactFactor: BigNumberish;
  positionImpactExponentFactor: BigNumberish;

  positiveMaxPositionImpactFactor: BigNumberish;
  negativeMaxPositionImpactFactor: BigNumberish;

  swapFeeFactor: BigNumberish;
  positiveSwapImpactFactor: BigNumberish;
  negativeSwapImpactFactor: BigNumberish;
  swapImpactExponentFactor: BigNumberish;
};

export type MarketConfig = Partial<BaseMarketConfig> & {
  tokens: [indexToken: string, longToken: string, shortToken: string];
};

const baseMarketConfig: BaseMarketConfig = {
  reserveFactorLongs: decimalToFloat(5, 1), // 50%,
  reserveFactorShorts: decimalToFloat(5, 1), // 50%,

  maxPnlFactorLongs: decimalToFloat(5, 1), // 50%
  maxPnlFactorShorts: decimalToFloat(5, 1), // 50%

  maxPnlFactorForWithdrawalsLongs: decimalToFloat(3, 1), // 30%
  maxPnlFactorForWithdrawalsShorts: decimalToFloat(3, 1), // 30%

  positionFeeFactor: decimalToFloat(5, 4), // 0.05%
  positivePositionImpactFactor: decimalToFloat(2, 7), // 0.00002 %
  negativePositionImpactFactor: decimalToFloat(1, 7), // 0.00001 %
  positionImpactExponentFactor: decimalToFloat(2, 0), // 2

  positiveMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
  negativeMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%

  swapFeeFactor: decimalToFloat(1, 3), // 0.1%,
  positiveSwapImpactFactor: decimalToFloat(2, 5), // 0.002 %
  negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001 %
  swapImpactExponentFactor: decimalToFloat(2, 0), // 2

  minCollateralUsd: decimalToFloat(1, 0), // 1 USD
};

const hardhatBaseMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactorLongs: decimalToFloat(5, 1), // 50%,
  reserveFactorShorts: decimalToFloat(5, 1), // 50%,

  maxPnlFactorLongs: decimalToFloat(5, 1), // 50%
  maxPnlFactorShorts: decimalToFloat(5, 1), // 50%

  maxPnlFactorForWithdrawalsLongs: decimalToFloat(7, 1), // 70%
  maxPnlFactorForWithdrawalsShorts: decimalToFloat(7, 1), // 70%

  positiveMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
  negativeMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
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
    },
    {
      tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
    },
    {
      tokens: ["SOL", "WETH", "USDC"], // indexToken, longToken, shortToken
    },
  ],
  hardhat: [
    {
      tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
    },
    {
      tokens: ["SOL", "WETH", "USDC"],
    },
  ],
  localhost: [
    {
      tokens: ["WETH", "WETH", "USDC"], // indexToken, longToken, shortToken
    },
    {
      tokens: ["SOL", "WETH", "USDC"],
    },
  ],
};

export default async function (hre: HardhatRuntimeEnvironment) {
  const markets = config[hre.network.name];
  const tokens = await hre.gmx.getTokens();
  const defaultMarketConfig = hre.network.name === "hardhat" ? hardhatBaseMarketConfig : baseMarketConfig;
  if (markets) {
    for (const market of markets) {
      for (const tokenSymbol of market.tokens) {
        if (!tokens[tokenSymbol]) {
          throw new Error(`Market ${market.tokens.join(":")} uses token that does not exist: ${tokenSymbol}`);
        }
      }

      for (const key of Object.keys(defaultMarketConfig)) {
        if (market[key] === undefined) {
          market[key] = defaultMarketConfig[key];
        }
      }
    }
  }
  return markets;
}
