import { BigNumberish, ethers } from "ethers";
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

  maxLongTokenPoolAmountForDeposit: BigNumberish;
  maxShortTokenPoolAmountForDeposit: BigNumberish;

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
  fundingIncreaseFactorPerSecond: BigNumberish;
  fundingDecreaseFactorPerSecond: BigNumberish;
  thresholdForStableFunding: BigNumberish;
  thresholdForDecreaseFunding: BigNumberish;
  minFundingFactorPerSecond: BigNumberish;
  maxFundingFactorPerSecond: BigNumberish;

  positionImpactPoolDistributionRate: BigNumberish;
  minPositionImpactPoolAmount: BigNumberish;

  virtualMarketId?: string;
  virtualTokenIdForIndexToken?: string;

  isDisabled?: boolean;
};

export type SpotMarketConfig = Partial<BaseMarketConfig> & {
  tokens: {
    longToken: string;
    shortToken: string;
    indexToken?: never;
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

  maxLongTokenPoolAmountForDeposit: expandDecimals(1_000_000_000, 18),
  maxShortTokenPoolAmountForDeposit: expandDecimals(1_000_000_000, 18),

  maxOpenInterestForLongs: decimalToFloat(1_000_000_000),
  maxOpenInterestForShorts: decimalToFloat(1_000_000_000),

  reserveFactorLongs: decimalToFloat(95, 2), // 95%,
  reserveFactorShorts: decimalToFloat(95, 2), // 95%,

  openInterestReserveFactorLongs: decimalToFloat(9, 1), // 90%,
  openInterestReserveFactorShorts: decimalToFloat(9, 1), // 90%,

  maxPnlFactorForTradersLongs: decimalToFloat(8, 1), // 80%
  maxPnlFactorForTradersShorts: decimalToFloat(8, 1), // 80%

  maxPnlFactorForAdlLongs: decimalToFloat(1, 0), // 100%, no ADL under normal operation
  maxPnlFactorForAdlShorts: decimalToFloat(1, 0), // 100%, no ADL under normal operation

  minPnlFactorAfterAdlLongs: decimalToFloat(8, 1), // 80%, no ADL under normal operation
  minPnlFactorAfterAdlShorts: decimalToFloat(8, 1), // 80%, no ADL under normal operation

  maxPnlFactorForDepositsLongs: decimalToFloat(8, 1), // 80%
  maxPnlFactorForDepositsShorts: decimalToFloat(8, 1), // 80%

  maxPnlFactorForWithdrawalsLongs: decimalToFloat(8, 1), // 80%
  maxPnlFactorForWithdrawalsShorts: decimalToFloat(8, 1), // 80%

  positionFeeFactorForPositiveImpact: decimalToFloat(5, 4), // 0.05%
  positionFeeFactorForNegativeImpact: decimalToFloat(7, 4), // 0.07%

  negativePositionImpactFactor: decimalToFloat(1, 7), // 0.00001%
  positivePositionImpactFactor: decimalToFloat(5, 8), // 0.000005%
  positionImpactExponentFactor: decimalToFloat(2, 0), // 2

  negativeMaxPositionImpactFactor: decimalToFloat(1, 2), // 1%
  positiveMaxPositionImpactFactor: decimalToFloat(1, 2), // 1%
  maxPositionImpactFactorForLiquidations: decimalToFloat(1, 2), // 1%

  swapFeeFactorForPositiveImpact: decimalToFloat(5, 4), // 0.05%,
  swapFeeFactorForNegativeImpact: decimalToFloat(7, 4), // 0.07%,

  negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001%
  positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005%
  swapImpactExponentFactor: decimalToFloat(2, 0), // 2

  minCollateralUsd: decimalToFloat(1, 0), // 1 USD

  // factor in open interest reserve factor 80%
  borrowingFactorForLongs: decimalToFloat(625, 11), // 0.00000000625 * 80% = 0.000000005, 0.0000005% / second, 15.77% per year if the pool is 100% utilized
  borrowingFactorForShorts: decimalToFloat(625, 11), // 0.00000000625 * 80% = 0.000000005, 0.0000005% / second, 15.77% per year if the pool is 100% utilized

  borrowingExponentFactorForLongs: decimalToFloat(1),
  borrowingExponentFactorForShorts: decimalToFloat(1),

  fundingFactor: decimalToFloat(2, 8), // ~63% per year for a 100% skew
  fundingExponentFactor: decimalToFloat(1),

  fundingIncreaseFactorPerSecond: 0,
  fundingDecreaseFactorPerSecond: 0,
  thresholdForStableFunding: 0,
  thresholdForDecreaseFunding: 0,
  minFundingFactorPerSecond: 0,
  maxFundingFactorPerSecond: 0,

  positionImpactPoolDistributionRate: 0,
  minPositionImpactPoolAmount: 0,
};

const synthethicMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactorLongs: decimalToFloat(8, 1), // 80%,
  reserveFactorShorts: decimalToFloat(8, 1), // 80%,

  openInterestReserveFactorLongs: decimalToFloat(7, 1), // 70%,
  openInterestReserveFactorShorts: decimalToFloat(7, 1), // 70%,

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

const stablecoinSwapMarketConfig: Partial<SpotMarketConfig> = {
  swapOnly: true,

  swapFeeFactorForPositiveImpact: decimalToFloat(1, 4), // 0.01%,
  swapFeeFactorForNegativeImpact: decimalToFloat(1, 4), // 0.01%,

  negativeSwapImpactFactor: decimalToFloat(5, 10), // 0.01% for 200,000 USD of imbalance
  positiveSwapImpactFactor: decimalToFloat(5, 10), // 0.01% for 200,000 USD of imbalance
};

const hardhatBaseMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactorLongs: decimalToFloat(5, 1), // 50%,
  reserveFactorShorts: decimalToFloat(5, 1), // 50%,

  openInterestReserveFactorLongs: decimalToFloat(5, 1), // 50%,
  openInterestReserveFactorShorts: decimalToFloat(5, 1), // 50%,

  minCollateralFactor: decimalToFloat(1, 2), // 1%

  minCollateralFactorForOpenInterestMultiplierLong: 0,
  minCollateralFactorForOpenInterestMultiplierShort: 0,

  maxLongTokenPoolAmount: expandDecimals(1 * 1000 * 1000 * 1000, 18),
  maxShortTokenPoolAmount: expandDecimals(1 * 1000 * 1000 * 1000, 18),

  maxLongTokenPoolAmountForDeposit: expandDecimals(1 * 1000 * 1000 * 1000, 18),
  maxShortTokenPoolAmountForDeposit: expandDecimals(1 * 1000 * 1000 * 1000, 18),

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

      maxLongTokenPoolAmount: expandDecimals(1650, 8),
      maxShortTokenPoolAmount: expandDecimals(70_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(1536, 8),
      maxShortTokenPoolAmountForDeposit: expandDecimals(65_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      positionImpactPoolDistributionRate: expandDecimals(197, 30), // ~0.17 BTC/day
      minPositionImpactPoolAmount: expandDecimals(188, 6), // 1.88 BTC

      negativeSwapImpactFactor: decimalToFloat(2, 10), // 0.05% for 2,500,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(2, 10), // 0.05% for 2,500,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),

      maxOpenInterestForLongs: decimalToFloat(64_000_000),
      maxOpenInterestForShorts: decimalToFloat(64_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(8, 13), // 0.0000000000008, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(1, 8), // 0.000001%,  0.0036% per hour, 31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      borrowingFactorForLongs: decimalToFloat(680, 14), // 6.80e-12, 23.50% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(680, 14), // 6.80e-12, 23.50% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(14, 1), // 1.4
      borrowingExponentFactorForShorts: decimalToFloat(14, 1), // 1.4
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(26_700, 18),
      maxShortTokenPoolAmount: expandDecimals(60_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(24_500, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(55_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      positionImpactPoolDistributionRate: expandDecimals(256, 41), // ~2.21 ETH/day
      minPositionImpactPoolAmount: expandDecimals(24, 18), // 24 ETH

      negativeSwapImpactFactor: decimalToFloat(2, 10), // 0.05% for 2,500,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(2, 10), // 0.05% for 2,500,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),

      maxOpenInterestForLongs: decimalToFloat(64_000_000),
      maxOpenInterestForShorts: decimalToFloat(64_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(8, 13), // 0.0000000000008, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(1, 8), // 0.000001%,  0.0036% per hour, 31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      borrowingFactorForLongs: decimalToFloat(720, 14), // 7.20e-12, 23.53% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(720, 14), // 7.20e-12, 23.53% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(14, 1), // 1.4
      borrowingExponentFactorForShorts: decimalToFloat(14, 1), // 1.4
    },
    {
      tokens: { indexToken: "XRP", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(800, 18),
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(800, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(1_500_000, 6),

      negativePositionImpactFactor: decimalToFloat(28, 9),
      positivePositionImpactFactor: decimalToFloat(14, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 9),

      openInterestReserveFactorLongs: decimalToFloat(75, 2), // 75%,
      openInterestReserveFactorShorts: decimalToFloat(75, 2), // 75%,

      // factor in open interest reserve factor 75%
      borrowingFactorForLongs: decimalToFloat(225, 13), // 2.25E-11, ~40.77% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(225, 13), // 2.25E-11, ~40.77% at 100% utilisation
      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(6666, 30), // ~576 XRP/day
      minPositionImpactPoolAmount: expandDecimals(671, 6),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(800, 18),
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(800, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(1_500_000, 6),

      negativePositionImpactFactor: decimalToFloat(26, 9),
      positivePositionImpactFactor: decimalToFloat(13, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),

      openInterestReserveFactorLongs: decimalToFloat(75, 2), // 75%,
      openInterestReserveFactorShorts: decimalToFloat(75, 2), // 75%,

      // factor in open interest reserve factor 75%
      borrowingFactorForLongs: decimalToFloat(23, 12), // 2.30-11, 40.80% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(23, 12), // 2.30-11, 40.80% at 100% utilisation
      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(475, 34), // ~4104 DOGE/day
      minPositionImpactPoolAmount: expandDecimals(5808, 8),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(129_500, 9),
      maxShortTokenPoolAmount: expandDecimals(9_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(122_300, 9),
      maxShortTokenPoolAmountForDeposit: expandDecimals(8_500_000, 6),

      negativePositionImpactFactor: decimalToFloat(76, 10),
      positivePositionImpactFactor: decimalToFloat(38, 10),

      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),

      // factor in open interest reserve factor 90%
      borrowingFactorForLongs: decimalToFloat(425, 14), // 4.25e-12, 33.07% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(425, 14), // 4.25e-12, 33.07% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(270, 34), // ~233 SOL/day
      minPositionImpactPoolAmount: expandDecimals(1500, 9),

      maxOpenInterestForLongs: decimalToFloat(7_000_000),
      maxOpenInterestForShorts: decimalToFloat(7_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "LTC", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(800, 18),
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(800, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(1_500_000, 6),

      negativePositionImpactFactor: decimalToFloat(36, 9),
      positivePositionImpactFactor: decimalToFloat(18, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(25, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(25, 10),

      reserveFactorLongs: decimalToFloat(85, 2), // 85%,
      reserveFactorShorts: decimalToFloat(85, 2), // 85%,

      openInterestReserveFactorLongs: decimalToFloat(8, 1), // 80%,
      openInterestReserveFactorShorts: decimalToFloat(8, 1), // 80%,

      // factor in open interest reserve factor 80%
      borrowingFactorForLongs: decimalToFloat(235, 13), // 2.35E-11, ~41.08% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(235, 13), // 2.35E-11, ~41.08% at 100% utilisation
      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(2715, 30), // ~2.34 LTC/day
      minPositionImpactPoolAmount: expandDecimals(66, 7), // 6.6 LTC

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "UNI", longToken: "UNI", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:UNI/USD"),
      virtualMarketId: hashString("SPOT:UNI/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(300_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(300_000, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(1_500_000, 6),

      negativePositionImpactFactor: decimalToFloat(42, 9),
      positivePositionImpactFactor: decimalToFloat(21, 9),

      negativeSwapImpactFactor: decimalToFloat(3, 8), // 0.05% for 16,667 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(15, 9), // 0.05% for 33,333 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 250,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(4, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(4, 8),

      // factor in open interest reserve factor 80%
      borrowingFactorForLongs: decimalToFloat(94, 10), // 0.0000000094 * 90% = 0,0000000085, 0.00000085% / second, 26,81% per year if the pool is 100% utilized
      borrowingFactorForShorts: decimalToFloat(94, 10), // 0.0000000094 * 90% = 0,0000000085, 0.00000085% / second, 26,81% per year if the pool is 100% utilized

      positionImpactPoolDistributionRate: expandDecimals(300, 43), // ~259 UNI/day
      minPositionImpactPoolAmount: expandDecimals(362, 18),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "LINK", longToken: "LINK", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LINK/USD"),
      virtualMarketId: hashString("SPOT:LINK/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(400_000, 18),
      maxShortTokenPoolAmount: expandDecimals(6_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(367_000, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(5_500_000, 6),

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 1,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(1, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(1, 8),

      // factor in open interest reserve factor 90%
      borrowingFactorForLongs: decimalToFloat(615, 14), // 6.15E-12, 33.12% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(615, 14), // 6.15E-12, 33.12% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(383, 43), // ~331 LINK/day
      minPositionImpactPoolAmount: expandDecimals(993, 18),

      maxOpenInterestForLongs: decimalToFloat(4_000_000),
      maxOpenInterestForShorts: decimalToFloat(4_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "ARB", longToken: "ARB", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ARB/USD"),
      virtualMarketId: hashString("SPOT:ARB/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(6_500_000, 18),
      maxShortTokenPoolAmount: expandDecimals(7_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(6_000_000, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(6_500_000, 6),

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 1,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(1, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(1, 8),

      // factor in open interest reserve factor 90%
      borrowingFactorForLongs: decimalToFloat(510, 14), // 5.10E-12, 33.21% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(510, 14), // 5.10E-12, 33.21% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: expandDecimals(600, 44), // ~5184 ARB/day
      minPositionImpactPoolAmount: expandDecimals(47961, 18),

      maxOpenInterestForLongs: decimalToFloat(5_000_000),
      maxOpenInterestForShorts: decimalToFloat(5_000_000),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),

      negativeSwapImpactFactor: decimalToFloat(15, 10), // 0.01% for 66,667 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(15, 10), // 0.01% for 66,667 USD of imbalance

      swapFeeFactorForPositiveImpact: decimalToFloat(5, 5), // 0.005%,
      swapFeeFactorForNegativeImpact: decimalToFloat(2, 4), // 0.02%,
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),

      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.01% for 20,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.01% for 20,000 USD of imbalance

      swapFeeFactorForPositiveImpact: decimalToFloat(5, 5), // 0.005%,
      swapFeeFactorForNegativeImpact: decimalToFloat(2, 4), // 0.02%,
    },
    {
      tokens: { longToken: "USDC", shortToken: "DAI" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 18),

      maxLongTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 18),

      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.01% for 20,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.01% for 20,000 USD of imbalance

      swapFeeFactorForPositiveImpact: decimalToFloat(5, 5), // 0.005%,
      swapFeeFactorForNegativeImpact: decimalToFloat(2, 4), // 0.02%,
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

      maxLongTokenPoolAmountForDeposit: expandDecimals(350, 8),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),

      reserveFactorLongs: decimalToFloat(9, 1), // 90%,
      reserveFactorShorts: decimalToFloat(9, 1), // 90%,

      openInterestReserveFactorLongs: decimalToFloat(8, 1), // 80%,
      openInterestReserveFactorShorts: decimalToFloat(8, 1), // 80%,

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(24, 11), // 0.05% for ~2,100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(24, 11), // 0.05% for ~2,100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),

      fundingIncreaseFactorPerSecond: decimalToFloat(8, 13), // 0.0000000000008, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(1, 8), // 0.000001%,  0.0036% per hour, 31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "WETH.e", longToken: "WETH.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(5000, 18),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(5000, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),

      reserveFactorLongs: decimalToFloat(9, 1), // 90%,
      reserveFactorShorts: decimalToFloat(9, 1), // 90%,

      openInterestReserveFactorLongs: decimalToFloat(8, 1), // 80%,
      openInterestReserveFactorShorts: decimalToFloat(8, 1), // 80%,

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(24, 11), // 0.05% for ~2,100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(24, 11), // 0.05% for ~2,100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),

      fundingIncreaseFactorPerSecond: decimalToFloat(8, 13), // 0.0000000000008, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(1, 8), // 0.000001%,  0.0036% per hour, 31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "XRP", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(75_000, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 9),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(75_000, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(50_000, 9),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(50_000, 9),
      maxShortTokenPoolAmountForDeposit: expandDecimals(1_000_000, 6),

      reserveFactorLongs: decimalToFloat(9, 1), // 90%,
      reserveFactorShorts: decimalToFloat(9, 1), // 90%,

      openInterestReserveFactorLongs: decimalToFloat(8, 1), // 80%,
      openInterestReserveFactorShorts: decimalToFloat(8, 1), // 80%,

      negativePositionImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "LTC", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...baseMarketConfig,
      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(75_000, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(1_000_000, 6),

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(25, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(25, 10),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(110_000, 18),
      maxShortTokenPoolAmount: expandDecimals(4_500_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(97_500, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(4_000_000, 6),

      reserveFactorLongs: decimalToFloat(9, 1), // 90%,
      reserveFactorShorts: decimalToFloat(9, 1), // 90%,

      openInterestReserveFactorLongs: decimalToFloat(8, 1), // 80%,
      openInterestReserveFactorShorts: decimalToFloat(8, 1), // 80%,

      negativePositionImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 500,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 8),

      positionImpactPoolDistributionRate: expandDecimals(166, 43), // ~166 AVAX/day
      minPositionImpactPoolAmount: expandDecimals(141, 18),

      maxOpenInterestForLongs: decimalToFloat(2_500_000),
      maxOpenInterestForShorts: decimalToFloat(2_500_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
    },
    {
      tokens: { longToken: "USDT", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
    },
    {
      tokens: { longToken: "USDC", shortToken: "DAI.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 18),

      maxLongTokenPoolAmountForDeposit: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmountForDeposit: expandDecimals(10_000_000, 18),
    },
  ],
  arbitrumGoerli: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      fundingIncreaseFactorPerSecond: decimalToFloat(1, 11), // 0.000000001% per second,  0,0000036% per hour
      fundingDecreaseFactorPerSecond: decimalToFloat(5, 12), // 0.0000000005% per second, 0,0000018% per hour
      minFundingFactorPerSecond: decimalToFloat(1, 9), // 0,0000001% per second, 0.00036% per hour
      maxFundingFactorPerSecond: decimalToFloat(3, 8), // 0,000003% per second,  0,0108% per hour

      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(2, 2), // 2%
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "DAI" },
      virtualMarketId: ethers.constants.HashZero,
    },
    { tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" } },
    { tokens: { indexToken: "BTC", longToken: "WBTC", shortToken: "USDC" } },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "USDC" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",
      virtualTokenIdForIndexToken: "0x04533137e2e8ae1c11111111a0dd36e023e0d6217198f889f9eb9c2a6727481d",
      positionImpactPoolDistributionRate: expandDecimals(1, 30), // 1 sat per second

      negativePositionImpactFactor: decimalToFloat(1, 9),
      positivePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(1, 7),
      positiveSwapImpactFactor: decimalToFloat(5, 8),
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "DAI" },

      negativePositionImpactFactor: decimalToFloat(1, 9),
      positivePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(1, 7),
      positiveSwapImpactFactor: decimalToFloat(5, 8),
    },
    {
      tokens: { indexToken: "SOL", longToken: "WBTC", shortToken: "USDC" },
      isDisabled: false,

      negativePositionImpactFactor: decimalToFloat(1, 9),
      positivePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(1, 7),
      positiveSwapImpactFactor: decimalToFloat(5, 8),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT" },
      swapOnly: true,

      negativeSwapImpactFactor: decimalToFloat(2, 8),
      positiveSwapImpactFactor: decimalToFloat(1, 8),
    },
    {
      tokens: {
        indexToken: "DOGE",
        longToken: "WBTC",
        shortToken: "DAI",
      },
      positionImpactPoolDistributionRate: expandDecimals(1, 38), // 1 DOGE / second
      minPositionImpactPoolAmount: expandDecimals(8000, 8), // 8000 DOGE

      negativePositionImpactFactor: decimalToFloat(1, 9),
      positivePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(1, 7),
      positiveSwapImpactFactor: decimalToFloat(5, 8),
    },
    {
      tokens: { indexToken: "LINK", longToken: "WBTC", shortToken: "DAI" },

      negativePositionImpactFactor: decimalToFloat(1, 9),
      positivePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(1, 7),
      positiveSwapImpactFactor: decimalToFloat(5, 8),
    },
    { tokens: { indexToken: "BNB", longToken: "WBTC", shortToken: "DAI" }, isDisabled: true },
    { tokens: { indexToken: "ADA", longToken: "WBTC", shortToken: "DAI" }, isDisabled: true },
    { tokens: { indexToken: "TRX", longToken: "WBTC", shortToken: "DAI" }, isDisabled: true },
    { tokens: { indexToken: "MATIC", longToken: "WBTC", shortToken: "USDC" }, isDisabled: true },
    { tokens: { indexToken: "DOT", longToken: "WBTC", shortToken: "USDC" }, isDisabled: true },
    { tokens: { indexToken: "UNI", longToken: "WBTC", shortToken: "USDC" }, isDisabled: true },
    {
      tokens: {
        indexToken: "TEST",
        longToken: "WBTC",
        shortToken: "USDC",
      },
      negativePositionImpactFactor: decimalToFloat(26, 6), // 0.0025 %
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

      maxLongTokenPoolAmountForDeposit: expandDecimals(10, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(300_000, 6),
      isDisabled: false,
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

      positionImpactPoolDistributionRate: expandDecimals(3, 11), // ~0.026 ETH per day
      minPositionImpactPoolAmount: expandDecimals(1, 16), // 0.01 ETH

      openInterestReserveFactorLongs: decimalToFloat(7, 1), // 70%,
      openInterestReserveFactorShorts: decimalToFloat(7, 1), // 70%,

      maxOpenInterestForLongs: decimalToFloat(55_000),
      maxOpenInterestForShorts: decimalToFloat(40_000),
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "DAI" },
      virtualMarketId: hashString("SPOT:AVAX/USD"),
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
    {
      tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "DAI" },
      positionImpactPoolDistributionRate: expandDecimals(12, 33), // ~10 DOGE per day
      minPositionImpactPoolAmount: expandDecimals(1, 8),
    },
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

      maxLongTokenPoolAmountForDeposit: expandDecimals(10, 18),
      maxShortTokenPoolAmountForDeposit: expandDecimals(300_000, 6),
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
