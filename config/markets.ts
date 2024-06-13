import { BigNumberish, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { expandDecimals, decimalToFloat, bigNumberify, percentageToFloat } from "../utils/math";
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

  maxLongTokenPoolUsdForDeposit: BigNumberish;
  maxShortTokenPoolUsdForDeposit: BigNumberish;

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
  atomicSwapFeeFactor: BigNumberish;

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

const baseMarketConfig: Partial<BaseMarketConfig> = {
  minCollateralFactor: decimalToFloat(1, 2), // 1%

  minCollateralFactorForOpenInterestMultiplierLong: 0,
  minCollateralFactorForOpenInterestMultiplierShort: 0,

  maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 18),
  maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 18),

  maxLongTokenPoolUsdForDeposit: decimalToFloat(1_000_000_000),
  maxShortTokenPoolUsdForDeposit: decimalToFloat(1_000_000_000),

  maxOpenInterestForLongs: expandDecimals(1_000_000_000, 30),
  maxOpenInterestForShorts: expandDecimals(1_000_000_000, 30),

  reserveFactorLongs: percentageToFloat("95%"),
  reserveFactorShorts: percentageToFloat("95%"),

  openInterestReserveFactorLongs: percentageToFloat("90%"),
  openInterestReserveFactorShorts: percentageToFloat("90%"),

  maxPnlFactorForTradersLongs: percentageToFloat("90%"),
  maxPnlFactorForTradersShorts: percentageToFloat("90%"),

  maxPnlFactorForAdlLongs: percentageToFloat("100%"),
  maxPnlFactorForAdlShorts: percentageToFloat("100%"),

  minPnlFactorAfterAdlLongs: percentageToFloat("90%"),
  minPnlFactorAfterAdlShorts: percentageToFloat("90%"),

  maxPnlFactorForDepositsLongs: percentageToFloat("90%"),
  maxPnlFactorForDepositsShorts: percentageToFloat("90%"),

  maxPnlFactorForWithdrawalsLongs: percentageToFloat("90%"),
  maxPnlFactorForWithdrawalsShorts: percentageToFloat("90%"),

  positionFeeFactorForPositiveImpact: percentageToFloat("0.05%"),
  positionFeeFactorForNegativeImpact: percentageToFloat("0.07%"),

  negativePositionImpactFactor: percentageToFloat("0.00001%"),
  positivePositionImpactFactor: percentageToFloat("0.000005%"),
  positionImpactExponentFactor: decimalToFloat(2, 0), // 2

  negativeMaxPositionImpactFactor: percentageToFloat("0.5%"),
  positiveMaxPositionImpactFactor: percentageToFloat("0.5%"),
  maxPositionImpactFactorForLiquidations: bigNumberify(0), // 0%

  swapFeeFactorForPositiveImpact: percentageToFloat("0.05%"),
  swapFeeFactorForNegativeImpact: percentageToFloat("0.07%"),
  atomicSwapFeeFactor: percentageToFloat("0.5%"),

  negativeSwapImpactFactor: percentageToFloat("0.001%"),
  positiveSwapImpactFactor: percentageToFloat("0.0005%"),
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

const singleTokenMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactorLongs: percentageToFloat("40%"),
  reserveFactorShorts: percentageToFloat("40%"),

  openInterestReserveFactorLongs: percentageToFloat("35%"),
  openInterestReserveFactorShorts: percentageToFloat("35%"),

  maxPnlFactorForTradersLongs: percentageToFloat("90%"),
  maxPnlFactorForTradersShorts: percentageToFloat("90%"),

  maxPnlFactorForAdlLongs: percentageToFloat("95%"),
  maxPnlFactorForAdlShorts: percentageToFloat("95%"),

  minPnlFactorAfterAdlLongs: percentageToFloat("90%"),
  minPnlFactorAfterAdlShorts: percentageToFloat("90%"),

  maxPnlFactorForDepositsLongs: percentageToFloat("95%"),
  maxPnlFactorForDepositsShorts: percentageToFloat("95%"),

  maxPnlFactorForWithdrawalsLongs: percentageToFloat("85%"),
  maxPnlFactorForWithdrawalsShorts: percentageToFloat("85%"),

  swapFeeFactorForPositiveImpact: bigNumberify(0),
  swapFeeFactorForNegativeImpact: bigNumberify(0),
  atomicSwapFeeFactor: percentageToFloat("0.5%"),

  negativeSwapImpactFactor: bigNumberify(0),
  positiveSwapImpactFactor: bigNumberify(0),
  swapImpactExponentFactor: decimalToFloat(1),
};

const synthethicMarketConfig: Partial<BaseMarketConfig> = {
  ...baseMarketConfig,

  reserveFactorLongs: percentageToFloat("95%"),
  reserveFactorShorts: percentageToFloat("95%"),

  openInterestReserveFactorLongs: percentageToFloat("90%"),
  openInterestReserveFactorShorts: percentageToFloat("90%"),

  maxPnlFactorForTradersLongs: percentageToFloat("60%"),
  maxPnlFactorForTradersShorts: percentageToFloat("60%"),

  maxPnlFactorForAdlLongs: percentageToFloat("55%"),
  maxPnlFactorForAdlShorts: percentageToFloat("55%"),

  minPnlFactorAfterAdlLongs: percentageToFloat("50%"),
  minPnlFactorAfterAdlShorts: percentageToFloat("50%"),

  maxPnlFactorForDepositsLongs: percentageToFloat("70%"),
  maxPnlFactorForDepositsShorts: percentageToFloat("70%"),

  maxPnlFactorForWithdrawalsLongs: percentageToFloat("45%"),
  maxPnlFactorForWithdrawalsShorts: percentageToFloat("45%"),
};

const synthethicMarketConfig_IncreasedCapacity: Partial<BaseMarketConfig> = {
  ...synthethicMarketConfig,

  reserveFactorLongs: percentageToFloat("125%"),
  reserveFactorShorts: percentageToFloat("125%"),

  openInterestReserveFactorLongs: percentageToFloat("120%"),
  openInterestReserveFactorShorts: percentageToFloat("120%"),

  maxPnlFactorForTradersLongs: percentageToFloat("70%"),
  maxPnlFactorForTradersShorts: percentageToFloat("70%"),

  maxPnlFactorForAdlLongs: percentageToFloat("65%"),
  maxPnlFactorForAdlShorts: percentageToFloat("65%"),

  minPnlFactorAfterAdlLongs: percentageToFloat("60%"),
  minPnlFactorAfterAdlShorts: percentageToFloat("60%"),

  maxPnlFactorForDepositsLongs: percentageToFloat("80%"),
  maxPnlFactorForDepositsShorts: percentageToFloat("80%"),

  maxPnlFactorForWithdrawalsLongs: percentageToFloat("55%"),
  maxPnlFactorForWithdrawalsShorts: percentageToFloat("55%"),
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

  maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 18),
  maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 18),

  maxLongTokenPoolUsdForDeposit: decimalToFloat(1_000_000_000_000_000),
  maxShortTokenPoolUsdForDeposit: decimalToFloat(1_000_000_000_000_000),

  maxOpenInterestForLongs: decimalToFloat(1_000_000_000),
  maxOpenInterestForShorts: decimalToFloat(1_000_000_000),

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

  maxFundingFactorPerSecond: "100000000000000000000000",
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

      reserveFactorLongs: percentageToFloat("135%"),
      reserveFactorShorts: percentageToFloat("135%"),

      openInterestReserveFactorLongs: percentageToFloat("130%"),
      openInterestReserveFactorShorts: percentageToFloat("130%"),

      maxLongTokenPoolAmount: expandDecimals(2200, 8),
      maxShortTokenPoolAmount: expandDecimals(110_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(100_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(100_000_000),

      negativePositionImpactFactor: decimalToFloat(12, 11),
      positivePositionImpactFactor: decimalToFloat(6, 11),

      positionImpactPoolDistributionRate: expandDecimals(552, 30), // 5.5263E+32, 0.4774722066 BTC / day
      minPositionImpactPoolAmount: expandDecimals(95, 6), // 0.95 BTC

      negativeSwapImpactFactor: decimalToFloat(2, 10), // 0.05% for 2,500,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(2, 10), // 0.05% for 2,500,000 USD of imbalance

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(6, 11),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(6, 11),

      maxOpenInterestForLongs: decimalToFloat(90_000_000),
      maxOpenInterestForShorts: decimalToFloat(90_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(64, 14), // 0.0000000000064, at least ~4,4 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(10, 9), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // factor in open interest reserve factor 120%
      borrowingFactorForLongs: decimalToFloat(788, 14), // 7.88E-12, 40% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(788, 14), // 7.88E-12, 40% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(14, 1), // 1.4
      borrowingExponentFactorForShorts: decimalToFloat(14, 1), // 1.4
    },
    {
      tokens: { indexToken: "BTC", longToken: "WBTC.e", shortToken: "WBTC.e" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),

      ...singleTokenMarketConfig,

      reserveFactorLongs: percentageToFloat("50%"),
      reserveFactorShorts: percentageToFloat("50%"),

      openInterestReserveFactorLongs: percentageToFloat("45%"),
      openInterestReserveFactorShorts: percentageToFloat("45%"),

      maxLongTokenPoolAmount: expandDecimals(1000, 8),
      maxShortTokenPoolAmount: expandDecimals(1000, 8),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(100_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(100_000_000),

      negativePositionImpactFactor: decimalToFloat(12, 11),
      positivePositionImpactFactor: decimalToFloat(6, 11),

      positionImpactPoolDistributionRate: expandDecimals(72704, 26), // 7.27041E+30, 0.006281632653 BTC / day
      minPositionImpactPoolAmount: expandDecimals(5, 6), // 0.05 BTC

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(6, 11),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(6, 11),

      maxOpenInterestForLongs: decimalToFloat(20_000_000),
      maxOpenInterestForShorts: decimalToFloat(20_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(79, 14), // 0.0000000000079, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(10, 9), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // factor in open interest reserve factor 45%
      borrowingFactorForLongs: decimalToFloat(282, 10), // 2.82-8, 40% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(282, 10), // 2.82-8, 40% at 100% utilisation
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,

      reserveFactorLongs: percentageToFloat("150%"),
      reserveFactorShorts: percentageToFloat("150%"),

      openInterestReserveFactorLongs: percentageToFloat("145%"),
      openInterestReserveFactorShorts: percentageToFloat("145%"),

      maxLongTokenPoolAmount: expandDecimals(37_792, 18),
      maxShortTokenPoolAmount: expandDecimals(100_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(90_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(90_000_000),

      negativePositionImpactFactor: decimalToFloat(12, 11),
      positivePositionImpactFactor: decimalToFloat(6, 11),

      positionImpactPoolDistributionRate: expandDecimals(8288, 40), // 8.28884E+43, 7.161555678 ETH / day
      minPositionImpactPoolAmount: expandDecimals(10, 18), // 10 ETH

      negativeSwapImpactFactor: decimalToFloat(2, 10), // 0.05% for 2,500,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(2, 10), // 0.05% for 2,500,000 USD of imbalance

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(6, 11),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(6, 11),

      maxOpenInterestForLongs: decimalToFloat(80_000_000),
      maxOpenInterestForShorts: decimalToFloat(80_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(64, 14), // 0.0000000000064, at least ~4,4 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(10, 9), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // factor in open interest reserve factor 130%
      borrowingFactorForLongs: decimalToFloat(744, 14), // 7.44E-12, 40% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(744, 14), // 7.44E-12, 40% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(14, 1), // 1.4
      borrowingExponentFactorForShorts: decimalToFloat(14, 1), // 1.4
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "WETH" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),

      ...singleTokenMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(20_000, 18),
      maxShortTokenPoolAmount: expandDecimals(20_000, 18),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(60_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(60_000_000),

      negativePositionImpactFactor: decimalToFloat(12, 11),
      positivePositionImpactFactor: decimalToFloat(6, 11),

      positionImpactPoolDistributionRate: expandDecimals(46477, 37), // 4.64773E+41, 0.04015637424 ETH / day
      minPositionImpactPoolAmount: expandDecimals(5, 17), // 0.5 ETH

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(6, 11),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(6, 11),

      maxOpenInterestForLongs: decimalToFloat(20_000_000),
      maxOpenInterestForShorts: decimalToFloat(20_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(79, 14), // 0.0000000000079, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(10, 9), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // factor in open interest reserve factor 35%
      borrowingFactorForLongs: decimalToFloat(360, 10), // 3.60-8, 40% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(360, 10), // 3.60-8, 40% at 100% utilisation
    },
    {
      tokens: { indexToken: "BNB", longToken: "BNB", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BNB/USD"),
      virtualMarketId: hashString("SPOT:BNB/USD"),

      ...baseMarketConfig,

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(14_120, 18),
      maxShortTokenPoolAmount: expandDecimals(5_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(4_500_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(4_500_000),

      negativePositionImpactFactor: decimalToFloat(38, 12), // 3.8e-11
      positivePositionImpactFactor: decimalToFloat(19, 12), // 1.9e-11
      positionImpactExponentFactor: decimalToFloat(236, 2), // 2.36

      negativeSwapImpactFactor: decimalToFloat(4, 8),
      positiveSwapImpactFactor: decimalToFloat(2, 8),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 6,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(8, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(8, 10),

      // factor in open interest reserve factor 100%
      borrowingFactorForLongs: decimalToFloat(16, 9), // 1.60E-08, 50% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(16, 9), // 1.60E-08, 50% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(1, 0), // 1
      borrowingExponentFactorForShorts: decimalToFloat(1, 0), // 1

      positionImpactPoolDistributionRate: expandDecimals(1455, 40), // 1.45579E+43, 1.2578016925 BNB / day
      minPositionImpactPoolAmount: expandDecimals(53, 16), // 0.53 BNB

      maxOpenInterestForLongs: decimalToFloat(10_000_000),
      maxOpenInterestForShorts: decimalToFloat(10_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "XRP", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...synthethicMarketConfig_IncreasedCapacity,

      maxLongTokenPoolAmount: expandDecimals(1056, 18),
      maxShortTokenPoolAmount: expandDecimals(2_500_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(2_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(2_000_000),

      negativePositionImpactFactor: decimalToFloat(28, 9),
      positivePositionImpactFactor: decimalToFloat(14, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(25, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(25, 10),

      reserveFactorLongs: percentageToFloat("125%"),
      reserveFactorShorts: percentageToFloat("125%"),

      openInterestReserveFactorLongs: percentageToFloat("120%"),
      openInterestReserveFactorShorts: percentageToFloat("120%"),

      // factor in open interest reserve factor 120%
      borrowingFactorForLongs: decimalToFloat(168, 13), // 1.68E-11, ~58% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(168, 13), // 1.68E-11, ~58% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(4982, 30), // 4.98267E+33, 430.5025641 XRP / day
      minPositionImpactPoolAmount: expandDecimals(4169, 6), // 4169.846154 XRP

      maxOpenInterestForLongs: decimalToFloat(2_000_000),
      maxOpenInterestForShorts: decimalToFloat(2_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...synthethicMarketConfig_IncreasedCapacity,

      maxLongTokenPoolAmount: expandDecimals(1200, 18),
      maxShortTokenPoolAmount: expandDecimals(4_500_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(4_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(4_000_000),

      negativePositionImpactFactor: decimalToFloat(26, 9),
      positivePositionImpactFactor: decimalToFloat(13, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(4, 9),
      positiveSwapImpactFactor: decimalToFloat(4, 9),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(1, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(1, 9),

      // factor in open interest reserve factor 120%
      borrowingFactorForLongs: decimalToFloat(90, 13), // 9.00-12, ~58% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(90, 13), // 9.00-12, ~58% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(1952, 34), // 1.95216E+37, 16866.66667 DOGE / day
      minPositionImpactPoolAmount: expandDecimals(26000, 8), // 26000 DOGE

      maxOpenInterestForLongs: decimalToFloat(3_000_000),
      maxOpenInterestForShorts: decimalToFloat(3_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(167_700, 9),
      maxShortTokenPoolAmount: expandDecimals(19_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(14_500_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(14_500_000),

      negativePositionImpactFactor: decimalToFloat(25, 10), // 2.5e-9
      positivePositionImpactFactor: decimalToFloat(125, 11), // 1.25e-9
      positionImpactExponentFactor: decimalToFloat(2, 0), // 2.0

      negativeSwapImpactFactor: decimalToFloat(5, 9),
      positiveSwapImpactFactor: decimalToFloat(25, 10),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 25,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),

      reserveFactorLongs: percentageToFloat("145%"),
      reserveFactorShorts: percentageToFloat("145%"),

      openInterestReserveFactorLongs: percentageToFloat("140%"),
      openInterestReserveFactorShorts: percentageToFloat("140%"),

      // factor in open interest reserve factor 140%
      borrowingFactorForLongs: decimalToFloat(260, 14), // 2.60E-12, 50% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(260, 14), // 2.60E-12, 50% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(1150, 33), // 1.150153E+36, 99.3734416 SOL / day
      minPositionImpactPoolAmount: expandDecimals(219, 9), // 219 SOL

      maxOpenInterestForLongs: decimalToFloat(17_500_000),
      maxOpenInterestForShorts: decimalToFloat(17_500_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(94, 14), // 0.0000000000094, at least ~4,4 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "LTC", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(800, 18),
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(1_500_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(1_500_000),

      negativePositionImpactFactor: decimalToFloat(36, 9),
      positivePositionImpactFactor: decimalToFloat(18, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 1,500,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(35, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(35, 10),

      // factor in open interest reserve factor 90%
      borrowingFactorForLongs: decimalToFloat(240, 13), // 2.40E-11, ~52% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(240, 13), // 2.40E-11, ~52% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(5418, 30), // 5.41811E+33, 4.681245421 LTC / day
      minPositionImpactPoolAmount: expandDecimals(28, 8), // 28 LTC

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "UNI", longToken: "UNI", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:UNI/USD"),
      virtualMarketId: hashString("SPOT:UNI/USD"),

      ...baseMarketConfig,

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(300_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(1_500_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(1_500_000),

      negativePositionImpactFactor: decimalToFloat(42, 9),
      positivePositionImpactFactor: decimalToFloat(21, 9),

      negativeSwapImpactFactor: decimalToFloat(3, 8), // 0.05% for 16,667 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(15, 9), // 0.05% for 33,333 USD of imbalance

      minCollateralFactor: decimalToFloat(833, 5), // 120x leverage
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 2,400,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(35, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(35, 10),

      // factor in open interest reserve factor 100%
      borrowingFactorForLongs: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized
      borrowingFactorForShorts: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized

      positionImpactPoolDistributionRate: expandDecimals(14332, 41), // 1.433284E+45, 123.8359 UNI / day
      minPositionImpactPoolAmount: expandDecimals(170, 18),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "LINK", longToken: "LINK", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LINK/USD"),
      virtualMarketId: hashString("SPOT:LINK/USD"),

      ...baseMarketConfig,

      reserveFactorLongs: percentageToFloat("165%"),
      reserveFactorShorts: percentageToFloat("165%"),

      openInterestReserveFactorLongs: percentageToFloat("160%"),
      openInterestReserveFactorShorts: percentageToFloat("160%"),

      maxLongTokenPoolAmount: expandDecimals(600_000, 18),
      maxShortTokenPoolAmount: expandDecimals(8_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(7_200_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(7_200_000),

      negativePositionImpactFactor: decimalToFloat(4, 10),
      positivePositionImpactFactor: decimalToFloat(2, 10),
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(6, 9),
      positiveSwapImpactFactor: decimalToFloat(3, 9),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 8,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(64, 11),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(64, 11),

      // factor in open interest reserve factor 140%
      borrowingFactorForLongs: decimalToFloat(540, 14), // 5.40E-12, ~50% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(540, 14), // 5.40E-12, ~50% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: expandDecimals(2068, 42), // 2.06849E+45, 178.7173172 LINK / day
      minPositionImpactPoolAmount: expandDecimals(638, 18), // 638 LINK

      maxOpenInterestForLongs: decimalToFloat(7_000_000),
      maxOpenInterestForShorts: decimalToFloat(7_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(94, 14), // 0.0000000000094, at least ~4,4 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "ARB", longToken: "ARB", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ARB/USD"),
      virtualMarketId: hashString("SPOT:ARB/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(7_524_000, 18),
      maxShortTokenPoolAmount: expandDecimals(15_500_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(14_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(14_000_000),

      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~90,000 USD of imbalance
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(5, 9),
      positiveSwapImpactFactor: decimalToFloat(25, 10),

      minCollateralFactor: decimalToFloat(667, 5), // 150x leverage
      // minCollateralFactor of 0.00667 (0.667%) when open interest is 13,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 10),

      reserveFactorLongs: percentageToFloat("125%"),
      reserveFactorShorts: percentageToFloat("125%"),

      openInterestReserveFactorLongs: percentageToFloat("120%"),
      openInterestReserveFactorShorts: percentageToFloat("120%"),

      // factor in open interest reserve factor 120%
      borrowingFactorForLongs: decimalToFloat(630, 14), // 6.30E-12, 50% at 100% utilisation
      borrowingFactorForShorts: decimalToFloat(630, 14), // 6.30E-12, 50% at 100% utilisation

      borrowingExponentFactorForLongs: decimalToFloat(15, 1), // 1.5
      borrowingExponentFactorForShorts: decimalToFloat(15, 1), // 1.5

      fundingIncreaseFactorPerSecond: decimalToFloat(94, 14), // 0.0000000000094, at least ~4,4 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: expandDecimals(1601, 43), // 1.60113E+46, 1383.374535 ARB / day
      minPositionImpactPoolAmount: expandDecimals(27598, 18), // 27598 ARB

      maxOpenInterestForLongs: decimalToFloat(10_000_000),
      maxOpenInterestForShorts: decimalToFloat(10_000_000),
    },
    {
      tokens: { indexToken: "AAVE", longToken: "AAVE", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AAVE/USD"),
      virtualMarketId: hashString("SPOT:AAVE/USD"),

      ...baseMarketConfig,

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(27_800, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(3_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~90,000 USD of imbalance
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(4, 9),
      positiveSwapImpactFactor: decimalToFloat(2, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,700,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(38, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(38, 10),

      // factor in open interest reserve factor 90%
      borrowingFactorForLongs: decimalToFloat(184, 10), // 1.84E-08, ~52% if 100% utilized
      borrowingFactorForShorts: decimalToFloat(184, 10), // 1.84E-08, ~52% if 100% utilized

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: expandDecimals(2194, 40), // 2.194615E+43, 1.896148432 AAVE / day
      minPositionImpactPoolAmount: expandDecimals(723, 16), // 7.23 AAVE

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),
    },
    {
      tokens: { indexToken: "AVAX", longToken: "AVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(83_300, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(3_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(3, 8),
      positiveSwapImpactFactor: decimalToFloat(15, 9),

      minCollateralFactor: decimalToFloat(833, 5), // 120x leverage
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 3,300,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(25, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(25, 10),

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      // factor in open interest reserve factor = 100%
      borrowingFactorForLongs: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized
      borrowingFactorForShorts: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: expandDecimals(3286, 41), // 3.2865E+44, 28,4 AVAX / day
      minPositionImpactPoolAmount: expandDecimals(79, 18), // 79.18 AVAX

      maxOpenInterestForLongs: decimalToFloat(2_500_000),
      maxOpenInterestForShorts: decimalToFloat(2_500_000),
    },
    {
      tokens: { indexToken: "ATOM", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ATOM/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(900, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(3_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: decimalToFloat(26, 9),
      positivePositionImpactFactor: decimalToFloat(13, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      minCollateralFactor: decimalToFloat(833, 5), // 120x leverage
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 1,700,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),

      // factor in open interest reserve factor 90%
      borrowingFactorForLongs: decimalToFloat(177, 10), // 1.77E-08, ~50% if 100% utilized
      borrowingFactorForShorts: decimalToFloat(177, 10), // 1.77E-08, ~50% if 100% utilized

      positionImpactPoolDistributionRate: expandDecimals(10884, 28), // 10.88529E+31, 9.4048872593 ATOM / day
      minPositionImpactPoolAmount: expandDecimals(611, 6), // 611 ATOM

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "NEAR", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:NEAR/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(1515, 18),
      maxShortTokenPoolAmount: expandDecimals(5_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(4_500_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(4_500_000),

      negativePositionImpactFactor: decimalToFloat(26, 9),
      positivePositionImpactFactor: decimalToFloat(13, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(25, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(25, 10),

      // factor in open interest reserve factor 90%
      borrowingFactorForLongs: decimalToFloat(185, 10), // 1.85E-8, ~52% if 100% utilized
      borrowingFactorForShorts: decimalToFloat(185, 10), // 1.85E-8, ~52% if 100% utilized

      positionImpactPoolDistributionRate: expandDecimals(1326, 48), // 1.32649E+51, 114.6089996 NEAR / day
      minPositionImpactPoolAmount: expandDecimals(4361, 24), // 4361 NEAR

      maxOpenInterestForLongs: decimalToFloat(2_500_000),
      maxOpenInterestForShorts: decimalToFloat(2_500_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "OP", longToken: "OP", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:OP/USD"),
      virtualMarketId: hashString("SPOT:OP/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(750_000, 18),
      maxShortTokenPoolAmount: expandDecimals(3_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(2_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(2_000_000),

      negativePositionImpactFactor: decimalToFloat(7, 10), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(35, 11), // 0.05% for ~80,000 USD of imbalance
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      // factor in open interest reserve factor 100%
      borrowingFactorForLongs: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized
      borrowingFactorForShorts: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: expandDecimals(4200, 41), // 4.20031E+44, 36.29068692 OP / day
      minPositionImpactPoolAmount: expandDecimals(311, 18), // 311 OP

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),
    },
    {
      tokens: { indexToken: "GMX", longToken: "GMX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:GMX/USD"),
      virtualMarketId: hashString("SPOT:GMX/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(50_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_800_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(1_500_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(1_500_000),

      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~100,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~178,180 USD of imbalance
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,632,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(38, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(38, 10),

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      // factor in open interest reserve factor 100%
      borrowingFactorForLongs: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized
      borrowingFactorForShorts: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: expandDecimals(81, 42), // 8.1e43, 7 GMX / day
      minPositionImpactPoolAmount: expandDecimals(50, 18), // 50 GMX

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),

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

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),

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

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),

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

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(350, 8),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 9),
      positiveSwapImpactFactor: decimalToFloat(5, 10),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),

      maxOpenInterestForLongs: decimalToFloat(1_500_000),
      maxOpenInterestForShorts: decimalToFloat(1_500_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(136, 14), // 0.00000000000136, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(17, 9), // 0.0000017%,  0.14212% per hour, 53.61% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 100%
      borrowingFactorForLongs: decimalToFloat(1900, 11), // 0.000000019 * 100% max reserve, 60% per year
      borrowingFactorForShorts: decimalToFloat(1900, 11),
    },
    {
      tokens: { indexToken: "WETH.e", longToken: "WETH.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(5000, 18),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 9),
      positiveSwapImpactFactor: decimalToFloat(5, 10),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 10),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(136, 14), // 0.00000000000136, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(17, 9), // 0.0000017%,  0.14212% per hour, 53.61% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 100%
      borrowingFactorForLongs: decimalToFloat(1900, 11), // 0.000000019 * 100% max reserve, 60% per year
      borrowingFactorForShorts: decimalToFloat(1900, 11),
    },
    {
      tokens: { indexToken: "XRP", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(1_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactorLongs: decimalToFloat(8, 1), // 80%,
      reserveFactorShorts: decimalToFloat(8, 1), // 80%,

      openInterestReserveFactorLongs: decimalToFloat(75, 2), // 75%,
      openInterestReserveFactorShorts: decimalToFloat(75, 2), // 75%,

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 8),
      positiveSwapImpactFactor: decimalToFloat(25, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 9),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 75%
      borrowingFactorForLongs: decimalToFloat(2950, 11), // 0.0000000295 * 75% max reserve, ~70%
      borrowingFactorForShorts: decimalToFloat(2950, 11),
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(1_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactorLongs: decimalToFloat(8, 1), // 80%
      reserveFactorShorts: decimalToFloat(8, 1), // 80%

      openInterestReserveFactorLongs: decimalToFloat(75, 2), // 75%,
      openInterestReserveFactorShorts: decimalToFloat(75, 2), // 75%,

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 8),
      positiveSwapImpactFactor: decimalToFloat(25, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 75%
      borrowingFactorForLongs: decimalToFloat(2950, 11), // 0.0000000295 * 75% max reserve, ~70%
      borrowingFactorForShorts: decimalToFloat(2950, 11),
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,

      reserveFactorLongs: percentageToFloat("105%"),
      reserveFactorShorts: percentageToFloat("105%"),

      openInterestReserveFactorLongs: percentageToFloat("100%"),
      openInterestReserveFactorShorts: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(50_000, 9),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(1_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(1_000_000),

      negativePositionImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(5, 8),
      positiveSwapImpactFactor: decimalToFloat(25, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(5, 9),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(5, 9),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 100%
      borrowingFactorForLongs: decimalToFloat(2220, 11), // 0.0000000222 * 100% max reserve, 70% per year
      borrowingFactorForShorts: decimalToFloat(2220, 11),
    },
    {
      tokens: { indexToken: "LTC", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(1_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactorLongs: decimalToFloat(8, 1), // 80%,
      reserveFactorShorts: decimalToFloat(8, 1), // 80%,

      openInterestReserveFactorLongs: decimalToFloat(75, 2), // 75%,
      openInterestReserveFactorShorts: decimalToFloat(75, 2), // 75%,

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 7),
      positiveSwapImpactFactor: decimalToFloat(5, 8),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(25, 10),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(25, 10),

      maxOpenInterestForLongs: decimalToFloat(1_000_000),
      maxOpenInterestForShorts: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 75%
      borrowingFactorForLongs: decimalToFloat(2950, 11), // 0.0000000295 * 75% max reserve, ~70%
      borrowingFactorForShorts: decimalToFloat(2950, 11),
    },
    {
      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...baseMarketConfig,

      reserveFactorLongs: percentageToFloat("155%"),
      reserveFactorShorts: percentageToFloat("155%"),

      openInterestReserveFactorLongs: percentageToFloat("150%"),
      openInterestReserveFactorShorts: percentageToFloat("150%"),

      maxLongTokenPoolAmount: expandDecimals(271_600, 18),
      maxShortTokenPoolAmount: expandDecimals(11_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(25, 10),
      positiveSwapImpactFactor: decimalToFloat(125, 11),

      // minCollateralFactor of 0.01 (1%) when open interest is 500,000 USD
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(2, 8),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(2, 8),

      positionImpactPoolDistributionRate: expandDecimals(166, 43), // ~143 AVAX/day
      minPositionImpactPoolAmount: expandDecimals(141, 18),

      maxOpenInterestForLongs: decimalToFloat(7_000_000),
      maxOpenInterestForShorts: decimalToFloat(7_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 150%
      borrowingFactorForLongs: decimalToFloat(2000, 11), // 0.00000002 * 150% max reserve, 94.6% per year
      borrowingFactorForShorts: decimalToFloat(2000, 11),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
    },
    {
      tokens: { longToken: "USDT", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
    },
    {
      tokens: { longToken: "USDC", shortToken: "DAI.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 18),

      maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000),
    },
  ],
  arbitrumSepolia: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
    },
    {
      tokens: { indexToken: "BTC", longToken: "BTC", shortToken: "USDC" },
    },
  ],
  arbitrumGoerli: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      fundingIncreaseFactorPerSecond: decimalToFloat(1, 11), // 0.000000001% per second,  0,0000036% per hour
      fundingDecreaseFactorPerSecond: decimalToFloat(5, 12), // 0.0000000005% per second, 0.0000018% per hour
      minFundingFactorPerSecond: decimalToFloat(1, 9), // 0,0000001% per second, 0.00036% per.hour
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

      maxLongTokenPoolUsdForDeposit: decimalToFloat(300_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(300_000),
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
    {
      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "USDC" },
      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      positionImpactPoolDistributionRate: expandDecimals(3, 11), // ~0.026 ETH per day
      minPositionImpactPoolAmount: expandDecimals(1, 16), // 0.01 ETH

      openInterestReserveFactorLongs: decimalToFloat(7, 1), // 70%,
      openInterestReserveFactorShorts: decimalToFloat(7, 1), // 70%,

      maxOpenInterestForLongs: decimalToFloat(55_000),
      maxOpenInterestForShorts: decimalToFloat(40_000),

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "DAI" },
      virtualMarketId: hashString("SPOT:AVAX/USD"),
      virtualTokenIdForIndexToken: "0x275d2a6e341e6a078d4eee59b08907d1e50825031c5481f9551284f4b7ee2fb9",

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
      virtualTokenIdForIndexToken: "0x275d2a6e341e6a078d4eee59b08907d1e50825031c5481f9551284f4b7ee2fb9",

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "USDC" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",
      virtualTokenIdForIndexToken: "0x04533137e2e8ae1c11111111a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "DAI" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "WBTC" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",

      negativeSwapImpactFactor: 0,
      positiveSwapImpactFactor: 0,

      maxOpenInterestForLongs: decimalToFloat(250_000),
      maxOpenInterestForShorts: decimalToFloat(200_000),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
    },
    {
      tokens: { indexToken: "SOL", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT" },
      swapOnly: true,

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "DAI" },
      positionImpactPoolDistributionRate: expandDecimals(12, 33), // ~10 DOGE per day
      minPositionImpactPoolAmount: expandDecimals(1, 8),

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "LINK", longToken: "WETH", shortToken: "DAI" },
    },
    {
      tokens: { indexToken: "BNB", longToken: "WETH", shortToken: "DAI" },
      negativeMaxPositionImpactFactor: decimalToFloat(1, 5), // 0.001%
      positiveMaxPositionImpactFactor: decimalToFloat(1, 5), // 0.001%
      maxPositionImpactFactorForLiquidations: decimalToFloat(5, 4), // 0.05%
      minCollateralFactorForOpenInterestMultiplierLong: decimalToFloat(15, 7),
      minCollateralFactorForOpenInterestMultiplierShort: decimalToFloat(15, 7),

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "ADA", longToken: "WETH", shortToken: "DAI" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "TRX", longToken: "WETH", shortToken: "DAI" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "MATIC", longToken: "WETH", shortToken: "USDC" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "DOT", longToken: "WETH", shortToken: "USDC" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "UNI", longToken: "WETH", shortToken: "USDC" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
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

      maxLongTokenPoolUsdForDeposit: decimalToFloat(300_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(300_000),
    },

    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDT" },

      borrowingFactorForLongs: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized
      borrowingFactorForShorts: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "DAI" },

      borrowingFactorForLongs: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized
      borrowingFactorForShorts: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
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
    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDC" },
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
