import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { expandDecimals, decimalToFloat } from "../utils/math";
import { hashString } from "../utils/hash";

export type BaseMarketConfig = {
  reserveFactorLongs: BigNumberish;
  reserveFactorShorts: BigNumberish;

  openInterestReserveFactorLongs: BigNumberish;
  openInterestReserveFactorShorts: BigNumberish;

  minCollateralFactor: BigNumberish;
  minCollateralFactorForOpenInterestMultiplierLong: BigNumberish;
  minCollateralFactorForOpenInterestMultiplierShort: BigNumberish;

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

  positionFeeFactorForPositiveImpact: BigNumberish;
  positionFeeFactorForNegativeImpact: BigNumberish;

  negativePositionImpactFactor: BigNumberish;
  positivePositionImpactFactor: BigNumberish;
  positionImpactExponentFactor: BigNumberish;

  negativeMaxPositionImpactFactor: BigNumberish;
  positiveMaxPositionImpactFactor: BigNumberish;
  maxPositionImpactFactorForLiquidations: BigNumberish;

  swapFeeFactorForPositiveImpact: BigNumberish;
  swapFeeFactorForNegativeImpact: BigNumberish;

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
  virtualTokenIdForIndexToken?: string;
};

export type SpotMarketConfig = Partial<BaseMarketConfig> & {
  tokens: {
    longToken: string;
    shortToken: string;
  };
  swapOnly: true;
};

export type PerpMarketConfig = Partial<BaseMarketConfig> & {
  tokens: {
    indexToken: string;
    longToken: string;
    shortToken: string;
  };
  swapOnly?: never;
};

export type MarketConfig = SpotMarketConfig | PerpMarketConfig;

const baseMarketConfig: BaseMarketConfig = {
  minCollateralFactor: decimalToFloat(1, 2), // 1%

  minCollateralFactorForOpenInterestMultiplierLong: 0,
  minCollateralFactorForOpenInterestMultiplierShort: 0,

  maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 18),
  maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 18),

  maxOpenInterestForLongs: decimalToFloat(1_000_000_000),
  maxOpenInterestForShorts: decimalToFloat(1_000_000_000),

  reserveFactorLongs: decimalToFloat(90, 2), // 90%,
  reserveFactorShorts: decimalToFloat(90, 2), // 90%,

  openInterestReserveFactorLongs: decimalToFloat(8, 1), // 80%,
  openInterestReserveFactorShorts: decimalToFloat(8, 1), // 80%,

  maxPnlFactorForTradersLongs: decimalToFloat(8, 1), // 80%
  maxPnlFactorForTradersShorts: decimalToFloat(8, 1), // 80%

  maxPnlFactorForAdlLongs: decimalToFloat(1, 0), // 100%, no ADL until normal operation
  maxPnlFactorForAdlShorts: decimalToFloat(1, 0), // 100%, no ADL until normal operation

  minPnlFactorAfterAdlLongs: decimalToFloat(8, 1), // 80%, no ADL until normal operation
  minPnlFactorAfterAdlShorts: decimalToFloat(8, 1), // 80%, no ADL until normal operation

  maxPnlFactorForDepositsLongs: decimalToFloat(8, 1), // 80%
  maxPnlFactorForDepositsShorts: decimalToFloat(8, 1), // 80%

  maxPnlFactorForWithdrawalsLongs: decimalToFloat(8, 1), // 80%
  maxPnlFactorForWithdrawalsShorts: decimalToFloat(8, 1), // 80%

  positionFeeFactorForPositiveImpact: decimalToFloat(5, 4), // 0.05%
  positionFeeFactorForNegativeImpact: decimalToFloat(5, 4), // 0.05%

  negativePositionImpactFactor: decimalToFloat(1, 7), // 0.00001%
  positivePositionImpactFactor: decimalToFloat(5, 8), // 0.000005%
  positionImpactExponentFactor: decimalToFloat(2, 0), // 2

  negativeMaxPositionImpactFactor: decimalToFloat(1, 2), // 1%
  positiveMaxPositionImpactFactor: decimalToFloat(1, 2), // 1%
  maxPositionImpactFactorForLiquidations: decimalToFloat(1, 2), // 1%

  swapFeeFactorForPositiveImpact: decimalToFloat(5, 4), // 0.05%,
  swapFeeFactorForNegativeImpact: decimalToFloat(5, 4), // 0.05%,

  negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001%
  positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005%
  swapImpactExponentFactor: decimalToFloat(2, 0), // 2

  minCollateralUsd: decimalToFloat(1, 0), // 1 USD

  borrowingFactorForLongs: decimalToFloat(3, 9), // 0.000000003, 0.0000003% / second, 9.462% per year if the pool is 100% utilized
  borrowingFactorForShorts: decimalToFloat(3, 9), // 0.000000003, 0.0000003% / second, 9.462% per year if the pool is 100% utilized

  borrowingExponentFactorForLongs: decimalToFloat(1),
  borrowingExponentFactorForShorts: decimalToFloat(1),

  fundingFactor: decimalToFloat(16, 9), // ~50% per year for a 100% skew
  fundingExponentFactor: decimalToFloat(1),
};

const synthethicMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactorLongs: decimalToFloat(7, 1), // 70%,
  reserveFactorShorts: decimalToFloat(7, 1), // 70%,

  openInterestReserveFactorLongs: decimalToFloat(6, 1), // 60%,
  openInterestReserveFactorShorts: decimalToFloat(6, 1), // 60%,

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

const stablecoinSwapMarketConfig: Partial<SpotMarketConfig> & {
  swapOnly: true;
} = {
  swapOnly: true,

  swapFeeFactorForPositiveImpact: decimalToFloat(1, 4), // 0.01%,
  swapFeeFactorForNegativeImpact: decimalToFloat(1, 4), // 0.01%,

  negativeSwapImpactFactor: expandDecimals(1, 10), // 0.01% for 1,000,000 USD of imbalance
  positiveSwapImpactFactor: expandDecimals(1, 10), // 0.01% for 1,000,000 USD of imbalance
};

const hardhatBaseMarketConfig: Partial<MarketConfig> = {
  reserveFactorLongs: decimalToFloat(5, 1), // 50%,
  reserveFactorShorts: decimalToFloat(5, 1), // 50%,

  openInterestReserveFactorLongs: decimalToFloat(5, 1), // 50%,
  openInterestReserveFactorShorts: decimalToFloat(5, 1), // 50%,

  minCollateralFactor: decimalToFloat(1, 2), // 1%

  minCollateralFactorForOpenInterestMultiplierLong: 0,
  minCollateralFactorForOpenInterestMultiplierShort: 0,

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
      tokens: { indexToken: "BTC", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(350, 8),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(5000, 18),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(12, 11), //0.3% for 25,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),
    },
    {
      tokens: { indexToken: "XRP", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(500, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(15, 10), // 0.3% for 2,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(75, 11), // 0.15% for 2,000,000 USD of imbalance

      // use the swap impact factor for WETH
      negativeSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 9),
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(500, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(3, 9), // 0.3% for 1,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(15, 10), // 0.15% for 1,000,000 USD of imbalance

      // use the swap impact factor for WETH
      negativeSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(50_000, 9),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(375, 11), // 0.3% for 800,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(1875, 12), // 0.15% for 800,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(375, 11), // 0.3% for 800,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(1875, 12), // 0.15% for 800,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),
    },
    {
      tokens: { indexToken: "LTC", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(500, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(15, 10), // 0.3% for 2,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(75, 11), // 0.15% for 2,000,000 USD of imbalance

      // use the swap impact factor for WETH
      negativeSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(25, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(25, 10),
    },
    {
      tokens: { indexToken: "UNI", longToken: "UNI", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:UNI/USD"),
      virtualMarketId: hashString("SPOT:UNI/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(200_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(2, 8), // 0.3% for 150,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(1, 8), // 0.15% for 150,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(2, 8), // 0.3% for 150,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(1, 8), // 0.15% for 150,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 250,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(4, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(4, 8),
    },
    {
      tokens: { indexToken: "LINK", longToken: "LINK", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LINK/USD"),
      virtualMarketId: hashString("SPOT:LINK/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(200_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(6, 9), // 0.3% for 500,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(3, 9), // 0.15% for 500,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(6, 9), // 0.3% for 500,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(3, 9), // 0.15% for 500,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 1,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(1, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(1, 8),
    },
    {
      tokens: { indexToken: "ARB", longToken: "ARB", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ARB/USD"),
      virtualMarketId: hashString("SPOT:ARB/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(1_000_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(6, 9), // 0.3% for 500,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(3, 9), // 0.15% for 500,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(6, 9), // 0.3% for 500,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(3, 9), // 0.15% for 500,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 1,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(1, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(1, 8),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),
    },
    {
      tokens: { longToken: "USDC", shortToken: "DAI" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 18),
    },
  ],
  avalanche: [
    {
      tokens: { indexToken: "BTC.b", longToken: "BTC.b", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(350, 8),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(12, 11), //0.3% for 25,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),
    },
    {
      tokens: { indexToken: "WETH.e", longToken: "WETH.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(5000, 18),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(12, 11), // 0.3% for 25,000,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(12, 11), //0.3% for 25,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),
    },
    {
      tokens: { indexToken: "XRP", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(15, 10), // 0.3% for 2,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(75, 11), // 0.15% for 2,000,000 USD of imbalance

      // use the swap impact factor for WAVAX
      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.3% for 300,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.15% for 300,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 9),
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(3, 9), // 0.3% for 1,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(15, 10), // 0.15% for 1,000,000 USD of imbalance

      // use the swap impact factor for WAVAX
      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.3% for 300,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.15% for 300,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(50_000, 9),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(375, 11), // 0.3% for 800,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(1875, 12), // 0.15% for 800,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(375, 11), // 0.3% for 800,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(1875, 12), // 0.15% for 800,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),
    },
    {
      tokens: { indexToken: "LTC", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(15, 10), // 0.3% for 2,000,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(75, 11), // 0.15% for 2,000,000 USD of imbalance

      // use the swap impact factor for WAVAX
      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.3% for 300,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.15% for 300,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(25, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(25, 10),
    },
    {
      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(200_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(1, 8), // 0.3% for 300,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(5, 9), // 0.15% for 300,000,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.3% for 300,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.15% for 300,000,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 500,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 8),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),
    },
    {
      tokens: { longToken: "USDT", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),
    },
    {
      tokens: { longToken: "USDC", shortToken: "DAI.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 18),
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
      virtualTokenIdForIndexToken: "0x04533137e2e8ae1c11111111a0dd36e023e0d6217198f889f9eb9c2a6727481d",
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

    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDT" },

      borrowingFactorForLongs: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized
      borrowingFactorForShorts: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "DAI" },

      borrowingFactorForLongs: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized
      borrowingFactorForShorts: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew
    },
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
      virtualTokenIdForIndexToken: "0x275d2a6e341e6a078d4eee59b08907d1e50825031c5481f9551284f4b7ee2fb9",
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
      virtualTokenIdForIndexToken: "0x275d2a6e341e6a078d4eee59b08907d1e50825031c5481f9551284f4b7ee2fb9",
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "USDC" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",
      virtualTokenIdForIndexToken: "0x04533137e2e8ae1c11111111a0dd36e023e0d6217198f889f9eb9c2a6727481d",
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

    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDT" },

      borrowingFactorForLongs: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized
      borrowingFactorForShorts: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "DAI" },

      borrowingFactorForLongs: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized
      borrowingFactorForShorts: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew
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
