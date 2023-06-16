import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { expandDecimals, decimalToFloat } from "../utils/math";

export type BaseMarketConfig = {
  reserveFactorLongs: BigNumberish;
  reserveFactorShorts: BigNumberish;

  minCollateralFactor: BigNumberish;

  maxLongTokenPoolAmount: BigNumberish;
  maxShortTokenPoolAmount: BigNumberish;

  maxOpenInterestForLongs: BigNumberish;
  maxOpenInterestForShorts: BigNumberish;

  maxPnlFactorForTradersLongs: BigNumberish;
  maxPnlFactorForTradersShorts: BigNumberish;

  maxPnlFactorForAdlLongs: BigNumberish;
  maxPnlFactorForAdlShorts: BigNumberish;

  minPnlFactorAfterAdlLongs: BigNumberish;
  minPnlFactorAfterAdlShorts: BigNumberish;

  maxPnlFactorForDepositsLongs: BigNumberish;
  maxPnlFactorForDepositsShorts: BigNumberish;

  maxPnlFactorForWithdrawalsLongs: BigNumberish;
  maxPnlFactorForWithdrawalsShorts: BigNumberish;

  positionFeeFactor: BigNumberish;
  positivePositionImpactFactor: BigNumberish;
  negativePositionImpactFactor: BigNumberish;
  positionImpactExponentFactor: BigNumberish;

  positiveMaxPositionImpactFactor: BigNumberish;
  negativeMaxPositionImpactFactor: BigNumberish;
  maxPositionImpactFactorForLiquidations: BigNumberish;

  swapFeeFactor: BigNumberish;
  positiveSwapImpactFactor: BigNumberish;
  negativeSwapImpactFactor: BigNumberish;
  swapImpactExponentFactor: BigNumberish;

  minCollateralUsd: BigNumberish;

  borrowingFactorForLongs: BigNumberish;
  borrowingFactorForShorts: BigNumberish;

  borrowingExponentFactorForLongs: BigNumberish;
  borrowingExponentFactorForShorts: BigNumberish;

  fundingFactor: BigNumberish;
  fundingExponentFactor: BigNumberish;

  virtualMarketId?: string;
};

export type MarketConfig = Partial<BaseMarketConfig> &
  (
    | {
        tokens: {
          indexToken: string;
          longToken: string;
          shortToken: string;
        };
        swapOnly?: never;
      }
    | {
        tokens: {
          longToken: string;
          shortToken: string;
        };
        swapOnly: true;
      }
  );

const baseMarketConfig: BaseMarketConfig = {
  reserveFactorLongs: decimalToFloat(5, 1), // 50%,
  reserveFactorShorts: decimalToFloat(5, 1), // 50%,

  minCollateralFactor: decimalToFloat(1, 2), // 1%

  maxLongTokenPoolAmount: expandDecimals(1 * 1000 * 1000 * 1000, 18),
  maxShortTokenPoolAmount: expandDecimals(1 * 1000 * 1000 * 1000, 18),

  maxOpenInterestForLongs: decimalToFloat(1 * 1000 * 1000 * 1000),
  maxOpenInterestForShorts: decimalToFloat(1 * 1000 * 1000 * 1000),

  maxPnlFactorForTradersLongs: decimalToFloat(5, 1), // 50%
  maxPnlFactorForTradersShorts: decimalToFloat(5, 1), // 50%

  maxPnlFactorForAdlLongs: decimalToFloat(45, 2), // 45%
  maxPnlFactorForAdlShorts: decimalToFloat(45, 2), // 45%

  minPnlFactorAfterAdlLongs: decimalToFloat(4, 1), // 40%
  minPnlFactorAfterAdlShorts: decimalToFloat(4, 1), // 40%

  maxPnlFactorForDepositsLongs: decimalToFloat(6, 1), // 60%
  maxPnlFactorForDepositsShorts: decimalToFloat(6, 1), // 60%

  maxPnlFactorForWithdrawalsLongs: decimalToFloat(3, 1), // 30%
  maxPnlFactorForWithdrawalsShorts: decimalToFloat(3, 1), // 30%

  positionFeeFactor: decimalToFloat(5, 4), // 0.05%
  positivePositionImpactFactor: decimalToFloat(5, 8), // 0.000005 %
  negativePositionImpactFactor: decimalToFloat(1, 7), // 0.00001 %
  positionImpactExponentFactor: decimalToFloat(2, 0), // 2

  positiveMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
  negativeMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
  maxPositionImpactFactorForLiquidations: decimalToFloat(1, 2), // 1%

  swapFeeFactor: decimalToFloat(5, 4), // 0.05%,
  positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005 %
  negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001 %
  swapImpactExponentFactor: decimalToFloat(2, 0), // 2

  minCollateralUsd: decimalToFloat(1, 0), // 1 USD

  borrowingFactorForLongs: decimalToFloat(1, 5), // 0.001% / second
  borrowingFactorForShorts: decimalToFloat(1, 5), // 0.001% / second

  borrowingExponentFactorForLongs: decimalToFloat(1),
  borrowingExponentFactorForShorts: decimalToFloat(1),

  fundingFactor: decimalToFloat(1, 6), // 0.0001% / second
  fundingExponentFactor: decimalToFloat(1),
};

const hardhatBaseMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactorLongs: decimalToFloat(5, 1), // 50%,
  reserveFactorShorts: decimalToFloat(5, 1), // 50%,

  minCollateralFactor: decimalToFloat(1, 2), // 1%

  maxLongTokenPoolAmount: expandDecimals(1 * 1000 * 1000 * 1000, 18),
  maxShortTokenPoolAmount: expandDecimals(1 * 1000 * 1000 * 1000, 18),

  maxOpenInterestForLongs: decimalToFloat(1 * 1000 * 1000 * 1000),
  maxOpenInterestForShorts: decimalToFloat(1 * 1000 * 1000 * 1000),

  maxPnlFactorForTradersLongs: decimalToFloat(5, 1), // 50%
  maxPnlFactorForTradersShorts: decimalToFloat(5, 1), // 50%

  maxPnlFactorForAdlLongs: decimalToFloat(45, 2), // 45%
  maxPnlFactorForAdlShorts: decimalToFloat(45, 2), // 45%

  minPnlFactorAfterAdlLongs: decimalToFloat(4, 1), // 40%
  minPnlFactorAfterAdlShorts: decimalToFloat(4, 1), // 40%

  maxPnlFactorForDepositsLongs: decimalToFloat(6, 1), // 60%
  maxPnlFactorForDepositsShorts: decimalToFloat(6, 1), // 60%

  maxPnlFactorForWithdrawalsLongs: decimalToFloat(3, 1), // 30%
  maxPnlFactorForWithdrawalsShorts: decimalToFloat(3, 1), // 30%

  positiveMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
  negativeMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
  maxPositionImpactFactorForLiquidations: decimalToFloat(1, 2), // 1%
};

const config: {
  [network: string]: MarketConfig[];
} = {
  arbitrum: [],
  arbitrumGoerli: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "DAI" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",
    },
    { tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" } },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "USDC" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "DAI" },
    },
    {
      tokens: { indexToken: "SOL", longToken: "WBTC", shortToken: "USDC" },
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT" },
      swapOnly: true,
    },
    { tokens: { indexToken: "DOGE", longToken: "WBTC", shortToken: "DAI" } },
    { tokens: { indexToken: "LINK", longToken: "WBTC", shortToken: "DAI" } },
    { tokens: { indexToken: "BNB", longToken: "WBTC", shortToken: "DAI" } },
    { tokens: { indexToken: "ADA", longToken: "WBTC", shortToken: "DAI" } },
    { tokens: { indexToken: "TRX", longToken: "WBTC", shortToken: "DAI" } },
    { tokens: { indexToken: "MATIC", longToken: "WBTC", shortToken: "USDC" } },
    { tokens: { indexToken: "DOT", longToken: "WBTC", shortToken: "USDC" } },
    { tokens: { indexToken: "UNI", longToken: "WBTC", shortToken: "USDC" } },
    {
      tokens: {
        indexToken: "TEST",
        longToken: "WBTC",
        shortToken: "USDC",
      },
      positivePositionImpactFactor: decimalToFloat(125, 7), // 0.00125 %
      negativePositionImpactFactor: decimalToFloat(25, 6), // 0.0025 %
      positionImpactExponentFactor: decimalToFloat(2, 0), // 2
      positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005 %
      negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001 %
      swapImpactExponentFactor: decimalToFloat(2, 0), // 2
    },
  ],
  avalanche: [],
  avalancheFuji: [
    { tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "USDC" } },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "DAI" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",
    },
    { tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" } },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "USDC" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "DAI" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",
    },
    {
      tokens: { indexToken: "SOL", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT" },
      swapOnly: true,
    },
    { tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "DAI" } },
    { tokens: { indexToken: "LINK", longToken: "WETH", shortToken: "DAI" } },
    { tokens: { indexToken: "BNB", longToken: "WETH", shortToken: "DAI" } },
    { tokens: { indexToken: "ADA", longToken: "WETH", shortToken: "DAI" } },
    { tokens: { indexToken: "TRX", longToken: "WETH", shortToken: "DAI" } },
    { tokens: { indexToken: "MATIC", longToken: "WETH", shortToken: "USDC" } },
    { tokens: { indexToken: "DOT", longToken: "WETH", shortToken: "USDC" } },
    { tokens: { indexToken: "UNI", longToken: "WETH", shortToken: "USDC" } },
    {
      tokens: {
        indexToken: "TEST",
        longToken: "WETH",
        shortToken: "USDC",
      },
      positivePositionImpactFactor: decimalToFloat(125, 7), // 0.00125 %
      negativePositionImpactFactor: decimalToFloat(25, 6), // 0.0025 %
      positionImpactExponentFactor: decimalToFloat(2, 0), // 2
      positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005 %
      negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001 %
      swapImpactExponentFactor: decimalToFloat(2, 0), // 2
    },
  ],
  hardhat: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDT" },
    },
    {
      tokens: { longToken: "WETH", shortToken: "USDC" },
      swapOnly: true,
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "USDC" },
    },
    {
      tokens: { indexToken: "SOL", longToken: "WETH", shortToken: "USDC" },
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
    },
  ],
  localhost: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
    },
    {
      tokens: { longToken: "WETH", shortToken: "USDC" },
      swapOnly: true,
    },
    {
      tokens: { indexToken: "SOL", longToken: "WETH", shortToken: "USDC" },
    },
  ],
};

export default async function (hre: HardhatRuntimeEnvironment) {
  const markets = config[hre.network.name];
  const tokens = await hre.gmx.getTokens();
  const defaultMarketConfig = hre.network.name === "hardhat" ? hardhatBaseMarketConfig : baseMarketConfig;
  if (markets) {
    const seen = new Set<string>();
    for (const market of markets) {
      const tokenSymbols = Object.values(market.tokens);
      const tokenSymbolsKey = tokenSymbols.join(":");
      if (seen.has(tokenSymbolsKey)) {
        throw new Error(`Duplicate market: ${tokenSymbolsKey}`);
      }
      seen.add(tokenSymbolsKey);
      for (const tokenSymbol of tokenSymbols) {
        if (!tokens[tokenSymbol]) {
          throw new Error(`Market ${tokenSymbols.join(":")} uses token that does not exist: ${tokenSymbol}`);
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
