import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { expandDecimals, decimalToFloat } from "../utils/math";
import { hashString } from "../utils/hash";

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
  negativePositionImpactFactor: BigNumberish;
  positivePositionImpactFactor: BigNumberish;
  positionImpactExponentFactor: BigNumberish;

  negativeMaxPositionImpactFactor: BigNumberish;
  positiveMaxPositionImpactFactor: BigNumberish;
  maxPositionImpactFactorForLiquidations: BigNumberish;

  swapFeeFactor: BigNumberish;
  negativeSwapImpactFactor: BigNumberish;
  positiveSwapImpactFactor: BigNumberish;
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
  minCollateralFactor: decimalToFloat(1, 2), // 1%

  maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 18),
  maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 18),

  maxOpenInterestForLongs: decimalToFloat(1_000_000_000),
  maxOpenInterestForShorts: decimalToFloat(1_000_000_000),

  reserveFactorLongs: decimalToFloat(7, 1), // 70%,
  reserveFactorShorts: decimalToFloat(7, 1), // 70%,

  maxPnlFactorForTradersLongs: decimalToFloat(7, 1), // 70%
  maxPnlFactorForTradersShorts: decimalToFloat(7, 1), // 70%

  maxPnlFactorForAdlLongs: decimalToFloat(7, 1), // 70%, no ADL until normal operation
  maxPnlFactorForAdlShorts: decimalToFloat(7, 1), // 70%, no ADL until normal operation

  minPnlFactorAfterAdlLongs: decimalToFloat(7, 1), // 70%, no ADL until normal operation
  minPnlFactorAfterAdlShorts: decimalToFloat(7, 1), // 70%, no ADL until normal operation

  maxPnlFactorForDepositsLongs: decimalToFloat(7, 1), // 70%
  maxPnlFactorForDepositsShorts: decimalToFloat(7, 1), // 70%

  maxPnlFactorForWithdrawalsLongs: decimalToFloat(7, 1), // 70%
  maxPnlFactorForWithdrawalsShorts: decimalToFloat(7, 1), // 70%

  positionFeeFactor: decimalToFloat(5, 4), // 0.05%
  negativePositionImpactFactor: decimalToFloat(1, 7), // 0.00001%
  positivePositionImpactFactor: decimalToFloat(5, 8), // 0.000005%
  positionImpactExponentFactor: decimalToFloat(2, 0), // 2

  negativeMaxPositionImpactFactor: decimalToFloat(1, 2), // 1%
  positiveMaxPositionImpactFactor: decimalToFloat(1, 2), // 1%
  maxPositionImpactFactorForLiquidations: decimalToFloat(1, 2), // 1%

  swapFeeFactor: decimalToFloat(5, 4), // 0.05%,
  negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001%
  positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005%
  swapImpactExponentFactor: decimalToFloat(2, 0), // 2

  minCollateralUsd: decimalToFloat(1, 0), // 1 USD

  borrowingFactorForLongs: decimalToFloat(3, 9), // 0.000000003, 0.0000003% / second, 9.462% per year if the pool is 100% utilized
  borrowingFactorForShorts: decimalToFloat(3, 9), // 0.000000003, 0.0000003% / second, 9.462% per year if the pool is 100% utilized

  borrowingExponentFactorForLongs: decimalToFloat(1),
  borrowingExponentFactorForShorts: decimalToFloat(1),

  fundingFactor: decimalToFloat(1, 6), // 0.0001% / second
  fundingExponentFactor: decimalToFloat(1),
};

const synthethicMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactorLongs: decimalToFloat(7, 1), // 50%,
  reserveFactorShorts: decimalToFloat(7, 1), // 50%,

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
  arbitrum: [
    {
      tokens: { indexToken: "BTC", longToken: "WBTC", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:BTC/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(350, 8),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      negativePositionImpactFactor: expandDecimals(5, 11), // 0.3% for 60,000,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(25, 12), // 0.15% for 60,000,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(5, 11), // 0.3% for 60,000,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(25, 12), // 0.15% for 60,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 16), // 1% per year for 1,000,000 USD of imbalance
    },
    {
      tokens: { indexToken: "ETH", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:ETH/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(5000, 18),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      negativePositionImpactFactor: expandDecimals(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(6, 11), // 0.15% for 25,000,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(6, 11), // 0.15% for 25,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 16), // 1% per year for 1,000,000 USD of imbalance
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:DOGE/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(500, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(3, 9), // 0.3% for 1,000,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(15, 10), // 0.15% for 1,000,000 USD of imbalance

      // use the swap impact factor for WETH
      negativeSwapImpactFactor: expandDecimals(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(6, 11), // 0.15% for 25,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:SOL/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(50_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(375, 11), // 0.3% for 800,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(1875, 12), // 0.15% for 800,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(375, 11), // 0.3% for 800,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(1875, 12), // 0.15% for 800,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
    {
      tokens: { indexToken: "LTC", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:LTC/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(500, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(15, 10), // 0.3% for 2,000,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(75, 11), // 0.15% for 2,000,000 USD of imbalance

      // use the swap impact factor for WETH
      negativeSwapImpactFactor: expandDecimals(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(6, 11), // 0.15% for 25,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
    {
      tokens: { indexToken: "UNI", longToken: "UNI", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:UNI/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(200_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(2, 8), // 0.3% for 150,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(1, 8), // 0.15% for 150,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(2, 8), // 0.3% for 150,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(1, 8), // 0.15% for 150,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
    {
      tokens: { indexToken: "LINK", longToken: "LINK", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:LINK/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(200_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(6, 9), // 0.3% for 500,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(6, 9), // 0.15% for 500,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(6, 9), // 0.3% for 500,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(6, 9), // 0.15% for 500,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
    {
      tokens: { indexToken: "ARB", longToken: "ARB", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:ARB/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(1_000_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(6, 9), // 0.3% for 500,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(6, 9), // 0.15% for 500,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(6, 9), // 0.3% for 500,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(6, 9), // 0.15% for 500,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
  ],
  avalanche: [
    {
      tokens: { indexToken: "BTC", longToken: "BTC.b", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:BTC/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(350, 8),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      negativePositionImpactFactor: expandDecimals(5, 11), // 0.3% for 60,000,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(25, 12), // 0.15% for 60,000,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(5, 11), // 0.3% for 60,000,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(25, 12), // 0.15% for 60,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 16), // 1% per year for 1,000,000 USD of imbalance
    },
    {
      tokens: { indexToken: "ETH", longToken: "WETH.e", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:ETH/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(5000, 18),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      negativePositionImpactFactor: expandDecimals(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(6, 11), // 0.15% for 25,000,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(6, 11), // 0.15% for 25,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 16), // 1% per year for 1,000,000 USD of imbalance
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WAVAX", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:DOGE/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(3, 9), // 0.3% for 1,000,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(15, 10), // 0.15% for 1,000,000 USD of imbalance

      // use the swap impact factor for WAVAX
      negativeSwapImpactFactor: expandDecimals(1, 8), // 0.3% for 300,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(5, 9), // 0.15% for 300,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:SOL/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(50_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(375, 11), // 0.3% for 800,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(1875, 12), // 0.15% for 800,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(375, 11), // 0.3% for 800,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(1875, 12), // 0.15% for 800,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
    {
      tokens: { indexToken: "LTC", longToken: "WAVAX", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:LTC/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(15, 10), // 0.3% for 2,000,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(75, 11), // 0.15% for 2,000,000 USD of imbalance

      // use the swap impact factor for WAVAX
      negativeSwapImpactFactor: expandDecimals(1, 8), // 0.3% for 300,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(5, 9), // 0.15% for 300,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
    {
      tokens: { indexToken: "AVAX", longToken: "WAVAX", shortToken: "USDC" },
      virtualMarketId: hashString("PERP:AVAX/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(200_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: expandDecimals(1, 8), // 0.3% for 300,000 USD of imbalance
      positivePositionImpactFactor: expandDecimals(5, 9), // 0.15% for 300,000,000 USD of imbalance

      negativeSwapImpactFactor: expandDecimals(1, 8), // 0.3% for 300,000 USD of imbalance
      positiveSwapImpactFactor: expandDecimals(5, 9), // 0.15% for 300,000,000 USD of imbalance

      fundingFactor: expandDecimals(3, 15), // 1% per year for 100,000 USD of imbalance
    },
  ],
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
      negativePositionImpactFactor: decimalToFloat(25, 6), // 0.0025 %
      positivePositionImpactFactor: decimalToFloat(125, 7), // 0.00125 %
      positionImpactExponentFactor: decimalToFloat(2, 0), // 2
      negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001 %
      positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005 %
      swapImpactExponentFactor: decimalToFloat(2, 0), // 2

      maxPnlFactorForAdlLongs: decimalToFloat(2, 2), // 2%
      maxPnlFactorForAdlShorts: decimalToFloat(2, 2), // 2%

      minPnlFactorAfterAdlLongs: decimalToFloat(1, 2), // 1%
      minPnlFactorAfterAdlShorts: decimalToFloat(1, 2), // 1%

      maxLongTokenPoolAmount: expandDecimals(10, 18),
      maxShortTokenPoolAmount: expandDecimals(300_000, 6),
    },

    { tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDT" } },
    { tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "DAI" } },
  ],
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
      negativePositionImpactFactor: decimalToFloat(25, 6), // 0.0025 %
      positivePositionImpactFactor: decimalToFloat(125, 7), // 0.00125 %
      positionImpactExponentFactor: decimalToFloat(2, 0), // 2
      negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001 %
      positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005 %
      swapImpactExponentFactor: decimalToFloat(2, 0), // 2

      maxPnlFactorForAdlLongs: decimalToFloat(2, 2), // 2%
      maxPnlFactorForAdlShorts: decimalToFloat(2, 2), // 2%

      minPnlFactorAfterAdlLongs: decimalToFloat(1, 2), // 1%
      minPnlFactorAfterAdlShorts: decimalToFloat(1, 2), // 1%

      maxLongTokenPoolAmount: expandDecimals(10, 18),
      maxShortTokenPoolAmount: expandDecimals(300_000, 6),
    },

    { tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDT" } },
    { tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "DAI" } },
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
