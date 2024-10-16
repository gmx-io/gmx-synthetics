import { BigNumberish, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { expandDecimals, exponentToFloat, decimalToFloat, bigNumberify, percentageToFloat } from "../utils/math";
import { hashString } from "../utils/hash";
import { SECONDS_PER_YEAR } from "../utils/constants";

export type BaseMarketConfig = {
  reserveFactor: BigNumberish;
  reserveFactorLongs?: BigNumberish;
  reserveFactorShorts?: BigNumberish;

  openInterestReserveFactor?: BigNumberish;
  openInterestReserveFactorLongs?: BigNumberish;
  openInterestReserveFactorShorts?: BigNumberish;

  minCollateralFactor: BigNumberish;
  minCollateralFactorForOpenInterestMultiplier?: BigNumberish;
  minCollateralFactorForOpenInterestMultiplierLong?: BigNumberish;
  minCollateralFactorForOpenInterestMultiplierShort?: BigNumberish;

  maxLongTokenPoolAmount: BigNumberish;
  maxShortTokenPoolAmount: BigNumberish;

  maxPoolUsdForDeposit?: BigNumberish;
  maxLongTokenPoolUsdForDeposit?: BigNumberish;
  maxShortTokenPoolUsdForDeposit?: BigNumberish;

  maxOpenInterest?: BigNumberish;
  maxOpenInterestForLongs?: BigNumberish;
  maxOpenInterestForShorts?: BigNumberish;

  maxPnlFactorForTraders?: BigNumberish;
  maxPnlFactorForTradersLongs?: BigNumberish;
  maxPnlFactorForTradersShorts?: BigNumberish;

  maxPnlFactorForAdl?: BigNumberish;
  maxPnlFactorForAdlLongs?: BigNumberish;
  maxPnlFactorForAdlShorts?: BigNumberish;

  minPnlFactorAfterAdl?: BigNumberish;
  minPnlFactorAfterAdlLongs?: BigNumberish;
  minPnlFactorAfterAdlShorts?: BigNumberish;

  // In GLV there may be GM markets which are above their maximum pnlToPoolFactorForTraders.
  // If this GM market's maxPnlFactorForDeposits is higher than maxPnlFactorForTraders
  // then the GM market is valued lower during deposits than it will be once traders
  // have realized their capped profits. Malicious user may observe a GM market
  // in such a condition and deposit into the GLV containing it in order to gain
  // from ADLs which will soon follow. To avoid this maxPnlFactorForDeposits should be
  // less than or equal to maxPnlFactorForTraders
  maxPnlFactorForDeposits?: BigNumberish;
  maxPnlFactorForDepositsLongs?: BigNumberish;
  maxPnlFactorForDepositsShorts?: BigNumberish;

  maxPnlFactorForWithdrawals?: BigNumberish;
  maxPnlFactorForWithdrawalsLongs?: BigNumberish;
  maxPnlFactorForWithdrawalsShorts?: BigNumberish;

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

  aboveOptimalUsageBorrowingFactor?: BigNumberish;
  aboveOptimalUsageBorrowingFactorForLongs?: BigNumberish;
  aboveOptimalUsageBorrowingFactorForShorts?: BigNumberish;

  baseBorrowingFactor?: BigNumberish;
  baseBorrowingFactorForLongs?: BigNumberish;
  baseBorrowingFactorForShorts?: BigNumberish;

  optimalUsageFactor?: BigNumberish;
  optimalUsageFactorForLongs?: BigNumberish;
  optimalUsageFactorForShorts?: BigNumberish;

  borrowingFactor?: BigNumberish;
  borrowingFactorForLongs?: BigNumberish;
  borrowingFactorForShorts?: BigNumberish;

  borrowingExponentFactor?: BigNumberish;
  borrowingExponentFactorForLongs?: BigNumberish;
  borrowingExponentFactorForShorts?: BigNumberish;

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

  minCollateralFactorForOpenInterestMultiplier: 0,

  reserveFactor: percentageToFloat("95%"),
  openInterestReserveFactor: percentageToFloat("90%"),

  maxPnlFactorForTraders: percentageToFloat("90%"),
  maxPnlFactorForAdl: percentageToFloat("85%"),
  minPnlFactorAfterAdl: percentageToFloat("77%"),

  maxPnlFactorForDeposits: percentageToFloat("90%"),
  maxPnlFactorForWithdrawals: percentageToFloat("70%"),

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
  borrowingFactor: decimalToFloat(625, 11), // 0.00000000625 * 80% = 0.000000005, 0.0000005% / second, 15.77% per year if the pool is 100% utilized

  optimalUsageFactor: 0,
  baseBorrowingFactor: 0,
  aboveOptimalUsageBorrowingFactor: 0,

  borrowingExponentFactor: decimalToFloat(1),

  fundingFactor: decimalToFloat(2, 8), // ~63% per year for a 100% skew
  fundingExponentFactor: decimalToFloat(1),

  fundingIncreaseFactorPerSecond: 0,
  fundingDecreaseFactorPerSecond: 0,
  thresholdForStableFunding: 0,
  thresholdForDecreaseFunding: 0,
  minFundingFactorPerSecond: 0,
  maxFundingFactorPerSecond: decimalToFloat(1, 7), // 0.00001%, 0.864% per day, 315.36% per year

  positionImpactPoolDistributionRate: bigNumberify(0),
  minPositionImpactPoolAmount: 0,
};

const singleTokenMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactor: percentageToFloat("40%"),
  openInterestReserveFactor: percentageToFloat("35%"),

  maxPnlFactorForTraders: percentageToFloat("90%"),
  maxPnlFactorForAdl: percentageToFloat("85%"),
  minPnlFactorAfterAdl: percentageToFloat("77%"),

  maxPnlFactorForDeposits: percentageToFloat("90%"),
  maxPnlFactorForWithdrawals: percentageToFloat("70%"),

  swapFeeFactorForPositiveImpact: bigNumberify(0),
  swapFeeFactorForNegativeImpact: bigNumberify(0),
  atomicSwapFeeFactor: percentageToFloat("0.5%"),

  negativeSwapImpactFactor: bigNumberify(0),
  positiveSwapImpactFactor: bigNumberify(0),
  swapImpactExponentFactor: decimalToFloat(1),
};

const synthethicMarketConfig: Partial<BaseMarketConfig> = {
  ...baseMarketConfig,

  reserveFactor: percentageToFloat("95%"),
  openInterestReserveFactor: percentageToFloat("90%"),

  maxPnlFactorForTraders: percentageToFloat("60%"),
  maxPnlFactorForAdl: percentageToFloat("55%"),
  minPnlFactorAfterAdl: percentageToFloat("50%"),

  maxPnlFactorForDeposits: percentageToFloat("60%"),
  maxPnlFactorForWithdrawals: percentageToFloat("45%"),
};

const synthethicMarketConfig_IncreasedCapacity: Partial<BaseMarketConfig> = {
  ...synthethicMarketConfig,

  reserveFactor: percentageToFloat("125%"),
  openInterestReserveFactor: percentageToFloat("120%"),

  maxPnlFactorForTraders: percentageToFloat("70%"),
  maxPnlFactorForAdl: percentageToFloat("65%"),
  minPnlFactorAfterAdl: percentageToFloat("60%"),

  maxPnlFactorForDeposits: percentageToFloat("70%"),
  maxPnlFactorForWithdrawals: percentageToFloat("55%"),
};

const stablecoinSwapMarketConfig: Partial<SpotMarketConfig> = {
  swapOnly: true,

  swapFeeFactorForPositiveImpact: decimalToFloat(1, 4), // 0.01%,
  swapFeeFactorForNegativeImpact: decimalToFloat(1, 4), // 0.01%,

  negativeSwapImpactFactor: decimalToFloat(5, 10), // 0.01% for 200,000 USD of imbalance
  positiveSwapImpactFactor: decimalToFloat(5, 10), // 0.01% for 200,000 USD of imbalance
};

const hardhatBaseMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactor: decimalToFloat(5, 1), // 50%,
  openInterestReserveFactor: decimalToFloat(5, 1), // 50%,

  minCollateralFactor: decimalToFloat(1, 2), // 1%
  minCollateralFactorForOpenInterestMultiplier: 0,

  maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 18),
  maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 18),

  maxPoolUsdForDeposit: decimalToFloat(1_000_000_000_000_000),
  maxOpenInterest: decimalToFloat(1_000_000_000),

  maxPnlFactorForTraders: decimalToFloat(5, 1), // 50%
  maxPnlFactorForAdl: decimalToFloat(45, 2), // 45%
  minPnlFactorAfterAdl: decimalToFloat(4, 1), // 40%

  maxPnlFactorForDeposits: decimalToFloat(6, 1), // 60%
  maxPnlFactorForWithdrawals: decimalToFloat(3, 1), // 30%

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
      tokens: { indexToken: "APE", longToken: "APE", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:APE/USD"),
      virtualMarketId: hashString("SPOT:APE/USD"),

      ...baseMarketConfig,

      positionImpactExponentFactor: exponentToFloat("2.2e0"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~90,000 USD of imbalance
      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~45,000 USD of imbalance

      positiveSwapImpactFactor: exponentToFloat("1.5e-8"), // 1.5e-8
      negativeSwapImpactFactor: exponentToFloat("3e-8"),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.74e-12"), // 0.00000000000174, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0

      maxFundingFactorPerSecond: exponentToFloat("2.25e-8"), // 0.00000225%,  0,1944% per day, ~71% per year
      minFundingFactorPerSecond: exponentToFloat("3e-10"), // 0.00000003%, 0.000108% per hour, 0.95% per year

      thresholdForStableFunding: percentageToFloat("5%"), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      minCollateralFactor: percentageToFloat("1%"), // 1%

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"), // 2.5e-9

      maxOpenInterest: decimalToFloat(1_000_000),
      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // x1.5 of max open interest

      maxLongTokenPoolAmount: expandDecimals(3_439_653, 18), // ~2M USD (x2 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (x2 of max open interest)
    },
    {
      tokens: { indexToken: "BTC", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("135%"),
      openInterestReserveFactor: percentageToFloat("130%"),

      maxLongTokenPoolAmount: expandDecimals(2200, 8),
      maxShortTokenPoolAmount: expandDecimals(110_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(100_000_000),

      negativePositionImpactFactor: exponentToFloat("9e-11"),
      positivePositionImpactFactor: exponentToFloat("3e-11"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(138, 30), // 1.38E+32, 0.119232 BTC / day
      minPositionImpactPoolAmount: expandDecimals(95, 6), // 0.95 BTC

      negativeSwapImpactFactor: exponentToFloat("4e-10"), // 0.05% for 1,250,000 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("2e-10"), // 0.05% for 2,500,000 USD of imbalance

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(90_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("5.76e-13"), // 0.00000000000576, at least ~4,8 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: exponentToFloat("3e-10"), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: exponentToFloat("1e-8"), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: percentageToFloat("5%"), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("60%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),
    },
    {
      tokens: { indexToken: "BTC", longToken: "WBTC.e", shortToken: "WBTC.e" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),

      ...singleTokenMarketConfig,

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(1000, 8),
      maxShortTokenPoolAmount: expandDecimals(1000, 8),

      maxPoolUsdForDeposit: decimalToFloat(100_000_000),

      negativePositionImpactFactor: 0, // decimalToFloat(9, 11),
      positivePositionImpactFactor: 0, // decimalToFloat(3, 11),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(46530, 26), // 4,653E+30, 0.0040202449 BTC / day
      minPositionImpactPoolAmount: expandDecimals(5, 6), // 0.05 BTC

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(5_000_000),

      // funding increase rate is higher for single asset pools
      fundingIncreaseFactorPerSecond: exponentToFloat("1.58e-12"), // 0.0000000000158, at least 1h45m to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: exponentToFloat("3e-10"), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: exponentToFloat("1e-8"), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: percentageToFloat("5%"), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),
    },
    {
      tokens: { indexToken: "BTC", longToken: "tBTC", shortToken: "tBTC" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),

      ...singleTokenMarketConfig,

      reserveFactor: percentageToFloat("85%"),
      openInterestReserveFactor: percentageToFloat("80%"),

      maxLongTokenPoolAmount: expandDecimals(45, 18),
      maxShortTokenPoolAmount: expandDecimals(45, 18),

      maxPoolUsdForDeposit: decimalToFloat(2_500_000),

      negativePositionImpactFactor: decimalToFloat(9, 11),
      positivePositionImpactFactor: decimalToFloat(3, 11),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(1_000_000),

      // funding increase rate is higher for single asset pools
      fundingIncreaseFactorPerSecond: exponentToFloat("3e-12"),
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: exponentToFloat("3e-10"), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: exponentToFloat("1e-8"), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: percentageToFloat("5%"), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("235%"),
      openInterestReserveFactor: percentageToFloat("230%"),

      maxLongTokenPoolAmount: expandDecimals(37_792, 18),
      maxShortTokenPoolAmount: expandDecimals(100_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(90_000_000),

      negativePositionImpactFactor: exponentToFloat("9e-11"),
      positivePositionImpactFactor: exponentToFloat("3e-11"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(2900, 40), // 2.9E+43, 2.5065444873 ETH / day
      minPositionImpactPoolAmount: expandDecimals(10, 18), // 10 ETH

      negativeSwapImpactFactor: exponentToFloat("2e-10"), // 0.05% for 2,500,000 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("2e-10"), // 0.05% for 2,500,000 USD of imbalance

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(80_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("5.76e-13"), // 0.00000000000576, at least ~4,8 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: exponentToFloat("3e-10"), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: exponentToFloat("1e-8"), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: percentageToFloat("5%"), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("60%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "WETH" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),

      ...singleTokenMarketConfig,

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(20_000, 18),
      maxShortTokenPoolAmount: expandDecimals(20_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(60_000_000),

      negativePositionImpactFactor: 0, // decimalToFloat(9, 11),
      positivePositionImpactFactor: 0, // decimalToFloat(3, 11),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(37181, 37), // 3.718184E+41, 0.0321250994 ETH / day
      minPositionImpactPoolAmount: expandDecimals(5, 17), // 0.5 ETH

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(5_000_000),

      // funding increase rate is higher for single asset pools
      fundingIncreaseFactorPerSecond: exponentToFloat("1.58e-12"), // 0.0000000000158, at least 1h45m to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: exponentToFloat("3e-10"), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: exponentToFloat("1e-8"), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: percentageToFloat("5%"), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),
    },
    {
      tokens: { indexToken: "WETH", longToken: "wstETH", shortToken: "USDe" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:wstETH/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("125%"),

      openInterestReserveFactor: percentageToFloat("120%"),

      maxLongTokenPoolAmount: expandDecimals(900, 18),
      maxShortTokenPoolAmount: expandDecimals(2_500_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      negativePositionImpactFactor: decimalToFloat(9, 11),
      positivePositionImpactFactor: decimalToFloat(3, 11),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      negativeSwapImpactFactor: decimalToFloat(3, 8),
      positiveSwapImpactFactor: decimalToFloat(15, 9),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(6, 11),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(576, 15), // 0.00000000000576, at least ~4,8 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(10, 9), // 0.000001%,  0.0864% per day, ~31.5% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      swapFeeFactorForPositiveImpact: percentageToFloat("1%"),
      swapFeeFactorForNegativeImpact: percentageToFloat("1%"),
    },
    {
      tokens: { indexToken: "BNB", longToken: "BNB", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BNB/USD"),
      virtualMarketId: hashString("SPOT:BNB/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("135%"),
      openInterestReserveFactor: percentageToFloat("130%"),

      maxLongTokenPoolAmount: expandDecimals(14_120, 18),
      maxShortTokenPoolAmount: expandDecimals(5_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(4_500_000),

      negativePositionImpactFactor: decimalToFloat(38, 12), // 3.8e-11
      positivePositionImpactFactor: decimalToFloat(19, 12), // 1.9e-11
      positionImpactExponentFactor: decimalToFloat(236, 2), // 2.36

      negativeSwapImpactFactor: decimalToFloat(4, 8),
      positiveSwapImpactFactor: decimalToFloat(2, 8),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 6,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(8, 10),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(727, 40), // 0.727895E+43, 0.6289008462 BNB / day
      minPositionImpactPoolAmount: expandDecimals(53, 16), // 0.53 BNB

      maxOpenInterest: decimalToFloat(5_000_000),

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

      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      negativePositionImpactFactor: decimalToFloat(21, 9),
      positivePositionImpactFactor: decimalToFloat(7, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(25, 10),
      positiveSwapImpactFactor: decimalToFloat(25, 10),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      // factor in open interest reserve factor 120%
      borrowingFactor: decimalToFloat(168, 13), // 1.68E-11, ~58% at 100% utilisation
      borrowingExponentFactor: decimalToFloat(15, 1), // 1.5

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(2491, 30), // 2.491335E+33, 215.25128205 XRP / day
      minPositionImpactPoolAmount: expandDecimals(4169, 6), // 4169.846154 XRP

      maxOpenInterest: decimalToFloat(2_000_000),

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

      maxLongTokenPoolAmount: expandDecimals(1410, 18),
      maxShortTokenPoolAmount: expandDecimals(4_800_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(4_300_000),

      negativePositionImpactFactor: decimalToFloat(15, 9),
      positivePositionImpactFactor: decimalToFloat(75, 10),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(2, 9),
      positiveSwapImpactFactor: decimalToFloat(2, 9),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(1, 9),

      reserveFactor: percentageToFloat("165%"),
      openInterestReserveFactor: percentageToFloat("160%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(488, 34), // 0.488E+37, 4216 DOGE / day
      minPositionImpactPoolAmount: expandDecimals(26000, 8), // 26000 DOGE

      maxOpenInterest: decimalToFloat(6_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "EIGEN", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:EIGEN/USD"),
      virtualMarketId: hashString("SPOT:WETH/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(1249, 18), // ~$3m
      maxShortTokenPoolAmount: expandDecimals(3_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2
      positivePositionImpactFactor: decimalToFloat(25, 11), // 2.5e-10,
      negativePositionImpactFactor: decimalToFloat(5, 10), // 5e-10

      positiveSwapImpactFactor: decimalToFloat(25, 10), // 2.5e-9
      negativeSwapImpactFactor: decimalToFloat(5, 9), // 5e-9

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      fundingIncreaseFactorPerSecond: decimalToFloat(181, 14), // 181e-14

      maxFundingFactorPerSecond: decimalToFloat(235, 10), // 235e-10
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 3e-10

      thresholdForStableFunding: percentageToFloat("5%"),

      minCollateralFactor: percentageToFloat("1%"),

      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(38, 10), // 38e-10

      maxOpenInterest: decimalToFloat(1_000_000),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
    },
    {
      tokens: { indexToken: "SHIB", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SHIB/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...synthethicMarketConfig,

      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // x1.5 of max open interest

      maxLongTokenPoolAmount: expandDecimals(636, 18), // ~2M USD
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD

      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~90,000 USD of imbalance

      positiveSwapImpactFactor: decimalToFloat(5, 9),
      negativeSwapImpactFactor: decimalToFloat(5, 9),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0

      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year

      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10), // 2.5e-9

      maxOpenInterest: decimalToFloat(1_000_000),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(140_000, 9),
      maxShortTokenPoolAmount: expandDecimals(20_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(17_500_000),

      negativePositionImpactFactor: decimalToFloat(135, 11), // 1.35e-9
      positivePositionImpactFactor: decimalToFloat(45, 11), // 0.45e-9
      positionImpactExponentFactor: decimalToFloat(2, 0), // 2.0

      negativeSwapImpactFactor: decimalToFloat(35, 10),
      positiveSwapImpactFactor: decimalToFloat(175, 11),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 25,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(2, 10),

      reserveFactor: percentageToFloat("235%"),
      openInterestReserveFactor: percentageToFloat("230%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("60%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(230, 33), // 0.2300306+36, 20 SOL / day
      minPositionImpactPoolAmount: expandDecimals(219, 9), // 219 SOL

      maxOpenInterest: decimalToFloat(17_500_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(846, 15), // 0.00000000000846, at least ~5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%
    },
    {
      tokens: { indexToken: "STX", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:STX/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...synthethicMarketConfig,

      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~90,000 USD of imbalance
      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~45,000 USD of imbalance

      positiveSwapImpactFactor: decimalToFloat(125, 11), // 1.25e-9
      negativeSwapImpactFactor: decimalToFloat(25, 10), // 2.5e-9

      fundingIncreaseFactorPerSecond: decimalToFloat(174, 14), // 0.00000000000174, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0

      maxFundingFactorPerSecond: decimalToFloat(225, 10), // 0.00000225%,  0,1944% per day, ~71% per year
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year

      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      minCollateralFactor: decimalToFloat(1, 2), // 1%

      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10), // 2.5e-9

      maxOpenInterest: decimalToFloat(500_000),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000), // x2 of max open interest

      maxLongTokenPoolAmount: expandDecimals(25, 8), // ~1,5M USD (x3 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6), // ~1,5M USD (x3 of max open interest)
    },
    {
      tokens: { indexToken: "SATS", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SATS/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...synthethicMarketConfig,

      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~90,000 USD of imbalance
      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~45,000 USD of imbalance

      positiveSwapImpactFactor: decimalToFloat(125, 11), // 1.25e-9
      negativeSwapImpactFactor: decimalToFloat(25, 10), // 2.5e-9

      fundingIncreaseFactorPerSecond: decimalToFloat(174, 14), // 0.00000000000174, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0

      maxFundingFactorPerSecond: decimalToFloat(225, 10), // 0.00000225%,  0,1944% per day, ~71% per year
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year

      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      minCollateralFactor: decimalToFloat(1, 2), // 1%

      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10), // 2.5e-9

      maxOpenInterest: decimalToFloat(500_000),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000), // x2 of max open interest

      maxLongTokenPoolAmount: expandDecimals(25, 8), // ~1,5M USD (x3 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6), // ~1,5M USD (x3 of max open interest)
    },
    {
      tokens: { indexToken: "LTC", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...synthethicMarketConfig,
      maxLongTokenPoolAmount: expandDecimals(800, 18),
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_500_000),

      negativePositionImpactFactor: decimalToFloat(27, 9),
      positivePositionImpactFactor: decimalToFloat(9, 9),

      negativeSwapImpactFactor: decimalToFloat(25, 10),
      positiveSwapImpactFactor: decimalToFloat(25, 10),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 1,500,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(35, 10),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(2709, 30), // 2.709055E+33, 2.34 LTC / day
      minPositionImpactPoolAmount: expandDecimals(28, 8), // 28 LTC

      maxOpenInterest: decimalToFloat(1_000_000),

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

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(300_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_500_000),

      negativePositionImpactFactor: decimalToFloat(315, 10),
      positivePositionImpactFactor: decimalToFloat(105, 10),

      negativeSwapImpactFactor: decimalToFloat(3, 8), // 0.05% for 16,667 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(15, 9), // 0.05% for 33,333 USD of imbalance

      minCollateralFactor: decimalToFloat(833, 5), // 120x leverage
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 2,400,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(35, 10),

      // factor in open interest reserve factor 100%
      borrowingFactor: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(7166, 41), // 0.716642E+45, 61.91 UNI / day
      minPositionImpactPoolAmount: expandDecimals(170, 18),

      maxOpenInterest: decimalToFloat(1_000_000),

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

      reserveFactor: percentageToFloat("235%"),
      openInterestReserveFactor: percentageToFloat("230%"),

      maxLongTokenPoolAmount: expandDecimals(600_000, 18),
      maxShortTokenPoolAmount: expandDecimals(8_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(7_200_000),

      negativePositionImpactFactor: decimalToFloat(3, 10),
      positivePositionImpactFactor: decimalToFloat(1, 10),
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(6, 9),
      positiveSwapImpactFactor: decimalToFloat(3, 9),

      minCollateralFactor: decimalToFloat(5, 3), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 8,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(64, 11),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("60%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(827, 42), // 0.827E+45, 71.488 LINK / day
      minPositionImpactPoolAmount: expandDecimals(638, 18), // 638 LINK

      maxOpenInterest: decimalToFloat(10_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(846, 15), // 0.00000000000846, at least ~5 hours to reach max funding
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

      maxPoolUsdForDeposit: decimalToFloat(14_000_000),

      negativePositionImpactFactor: decimalToFloat(375, 12),
      positivePositionImpactFactor: decimalToFloat(125, 12),
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(5, 9),
      positiveSwapImpactFactor: decimalToFloat(25, 10),

      minCollateralFactor: decimalToFloat(667, 5), // 150x leverage
      // minCollateralFactor of 0.00667 (0.667%) when open interest is 13,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(5, 10),

      reserveFactor: percentageToFloat("235%"),
      openInterestReserveFactor: percentageToFloat("230%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("60%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      fundingIncreaseFactorPerSecond: decimalToFloat(846, 15), // 0.00000000000846, at least ~5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(800, 43), // 0.800565E+46, 691.69 ARB / day
      minPositionImpactPoolAmount: expandDecimals(27598, 18), // 27598 ARB

      maxOpenInterest: decimalToFloat(5_000_000),
    },
    {
      tokens: { indexToken: "AAVE", longToken: "AAVE", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AAVE/USD"),
      virtualMarketId: hashString("SPOT:AAVE/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("135%"),
      openInterestReserveFactor: percentageToFloat("130%"),

      maxLongTokenPoolAmount: expandDecimals(27_800, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~90,000 USD of imbalance
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(4, 9),
      positiveSwapImpactFactor: decimalToFloat(2, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,700,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(38, 10),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(1097, 40), // 1.0973075E+43, 0.948074216 AAVE / day
      minPositionImpactPoolAmount: expandDecimals(723, 16), // 7.23 AAVE

      maxOpenInterest: decimalToFloat(1_500_000),
    },
    {
      tokens: { indexToken: "AVAX", longToken: "AVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(83_300, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(3, 8),
      positiveSwapImpactFactor: decimalToFloat(15, 9),

      minCollateralFactor: decimalToFloat(833, 5), // 120x leverage
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 3,300,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10),

      reserveFactor: percentageToFloat("135%"),
      openInterestReserveFactor: percentageToFloat("130%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(1643, 41), // 1.64325E+44, 14,2 AVAX / day
      minPositionImpactPoolAmount: expandDecimals(79, 18), // 79.18 AVAX

      maxOpenInterest: decimalToFloat(1_000_000),
    },
    {
      tokens: { indexToken: "ATOM", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ATOM/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(900, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: decimalToFloat(26, 9),
      positivePositionImpactFactor: decimalToFloat(13, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(25, 10),
      positiveSwapImpactFactor: decimalToFloat(25, 10),

      minCollateralFactor: decimalToFloat(833, 5), // 120x leverage
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 1,700,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(5, 9),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(5442, 28), // 5.442645E+31, 4,7 ATOM / day
      minPositionImpactPoolAmount: expandDecimals(611, 6), // 611 ATOM

      maxOpenInterest: decimalToFloat(1_000_000),

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

      maxPoolUsdForDeposit: decimalToFloat(4_500_000),

      negativePositionImpactFactor: decimalToFloat(195, 10),
      positivePositionImpactFactor: decimalToFloat(65, 10),

      negativeSwapImpactFactor: decimalToFloat(25, 10),
      positiveSwapImpactFactor: decimalToFloat(25, 10),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(928, 48), // 0.928E+51, 80.22629972 NEAR / day
      minPositionImpactPoolAmount: expandDecimals(4361, 24), // 4361 NEAR

      maxOpenInterest: decimalToFloat(1_000_000),

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

      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      negativePositionImpactFactor: decimalToFloat(7, 10), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(35, 11), // 0.05% for ~80,000 USD of imbalance
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(5, 9),

      reserveFactor: percentageToFloat("135%"),
      openInterestReserveFactor: percentageToFloat("130%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(2100, 41), // 2.1E+44, 18.14 OP / day
      minPositionImpactPoolAmount: expandDecimals(311, 18), // 311 OP

      maxOpenInterest: decimalToFloat(1_000_000),
    },
    {
      tokens: { indexToken: "ORDI", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ORDI/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...synthethicMarketConfig,

      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~90,000 USD of imbalance
      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~45,000 USD of imbalance

      positiveSwapImpactFactor: decimalToFloat(125, 11), // 1.25e-9
      negativeSwapImpactFactor: decimalToFloat(25, 10), // 2.5e-9

      borrowingFactor: decimalToFloat(160, 10), // 1.60E-08, ~50% if 100% utilized

      fundingIncreaseFactorPerSecond: decimalToFloat(174, 14), // 0.00000000000174, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0

      maxFundingFactorPerSecond: decimalToFloat(225, 10), // 0.00000225%,  0,1944% per day, ~71% per year
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year

      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      minCollateralFactor: decimalToFloat(1, 2), // 1%

      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10), // 2.5e-9

      maxOpenInterest: decimalToFloat(500_000),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("70%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("160%").div(SECONDS_PER_YEAR),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000), // x2 of max open interest

      maxLongTokenPoolAmount: expandDecimals(25, 8), // ~1,5M USD (x3 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6), // ~1,5M USD (x3 of max open interest)
    },
    {
      tokens: { indexToken: "GMX", longToken: "GMX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:GMX/USD"),
      virtualMarketId: hashString("SPOT:GMX/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(160_000, 18),
      maxShortTokenPoolAmount: expandDecimals(4_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(3_500_000),

      negativePositionImpactFactor: decimalToFloat(75, 11),
      positivePositionImpactFactor: decimalToFloat(25, 11),
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(12, 9),
      positiveSwapImpactFactor: decimalToFloat(6, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,632,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(38, 10),

      reserveFactor: percentageToFloat("135%"),
      openInterestReserveFactor: percentageToFloat("130%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      fundingIncreaseFactorPerSecond: decimalToFloat(116, 14), // 0.00000000000116, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(150, 10), // 0.00000150%,  0.1296% per day, ~47.3% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(65, 42), // 6.5e43, 5.6 GMX / day
      minPositionImpactPoolAmount: expandDecimals(50, 18), // 50 GMX

      maxOpenInterest: decimalToFloat(1_000_000),
    },
    {
      tokens: { indexToken: "PEPE", longToken: "PEPE", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:PEPE/USD"),
      virtualMarketId: hashString("SPOT:PEPE/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(243_000_000_000, 18),
      maxShortTokenPoolAmount: expandDecimals(3_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(2_700_000),

      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~100,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~178,180 USD of imbalance
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(3, 8), // 0.05% for 16,667 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(15, 9), // 0.05% for 33,333 USD of imbalance

      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      fundingIncreaseFactorPerSecond: decimalToFloat(174, 14), // 0.00000000000174, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(225, 10), // 0.00000225%,  0,1944% per day, ~71% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: 0,

      maxOpenInterest: decimalToFloat(1_500_000),
    },
    {
      tokens: { indexToken: "WIF", longToken: "WIF", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:WIF/USD"),
      virtualMarketId: hashString("SPOT:WIF/USD"),

      ...baseMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(702_000, 6),
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_800_000),

      negativePositionImpactFactor: decimalToFloat(5, 10), // 0.05% for ~100,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(25, 11), // 0.05% for ~178,180 USD of imbalance
      positionImpactExponentFactor: decimalToFloat(22, 1), // 2.2

      negativeSwapImpactFactor: decimalToFloat(3, 8), // 0.05% for 16,667 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(15, 9), // 0.05% for 33,333 USD of imbalance

      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      optimalUsageFactor: percentageToFloat("75%"),
      baseBorrowingFactor: percentageToFloat("65%").div(SECONDS_PER_YEAR),
      aboveOptimalUsageBorrowingFactor: percentageToFloat("120%").div(SECONDS_PER_YEAR),

      fundingIncreaseFactorPerSecond: decimalToFloat(174, 14), // 0.00000000000174, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(225, 10), // 0.00000225%,  0,1944% per day, ~71% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: 0,

      maxOpenInterest: decimalToFloat(500_000),
    },
    {
      tokens: { longToken: "wstETH", shortToken: "WETH" },

      ...baseMarketConfig,

      swapOnly: true,

      isDisabled: false,

      maxLongTokenPoolAmount: expandDecimals(3300, 18),
      maxShortTokenPoolAmount: expandDecimals(2800, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativeSwapImpactFactor: decimalToFloat(5, 9),
      positiveSwapImpactFactor: decimalToFloat(5, 9),

      swapFeeFactorForPositiveImpact: percentageToFloat("1%"),
      swapFeeFactorForNegativeImpact: percentageToFloat("1%"),
    },
    {
      tokens: { longToken: "USDe", shortToken: "USDC" },

      ...baseMarketConfig,

      swapOnly: true,

      maxLongTokenPoolAmount: expandDecimals(11_000_000, 18),
      maxShortTokenPoolAmount: expandDecimals(11_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativeSwapImpactFactor: decimalToFloat(15, 10), // 0.01% for 66,667 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(15, 10), // 0.01% for 66,667 USD of imbalance

      swapFeeFactorForPositiveImpact: decimalToFloat(5, 5), // 0.005%,
      swapFeeFactorForNegativeImpact: decimalToFloat(2, 4), // 0.02%,
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

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

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

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

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

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

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(350, 8),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 9),
      positiveSwapImpactFactor: decimalToFloat(5, 10),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(2, 10),

      maxOpenInterest: decimalToFloat(1_500_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(136, 14), // 0.00000000000136, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(17, 9), // 0.0000017%,  0.14212% per hour, 53.61% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 100%
      borrowingFactor: decimalToFloat(1900, 11), // 0.000000019 * 100% max reserve, 60% per year
    },
    {
      tokens: { indexToken: "BTC.b", longToken: "BTC.b", shortToken: "BTC.b" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),

      ...singleTokenMarketConfig,

      reserveFactor: percentageToFloat("50%"),
      openInterestReserveFactor: percentageToFloat("45%"),

      maxLongTokenPoolAmount: expandDecimals(350, 8),
      maxShortTokenPoolAmount: expandDecimals(350, 8),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(2, 10),

      maxOpenInterest: decimalToFloat(3_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(136, 14), // 0.00000000000136, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(17, 9), // 0.0000017%,  0.14212% per hour, 53.61% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // factor in open interest reserve factor 45%
      borrowingFactor: decimalToFloat(282, 10), // 2.82-8, 40% at 100% utilisation
    },
    {
      tokens: { indexToken: "WETH.e", longToken: "WETH.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(5000, 18),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 9),
      positiveSwapImpactFactor: decimalToFloat(5, 10),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(2, 10),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(136, 14), // 0.00000000000136, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(17, 9), // 0.0000017%,  0.14212% per hour, 53.61% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 100%
      borrowingFactor: decimalToFloat(1900, 11), // 0.000000019 * 100% max reserve, 60% per year
    },
    {
      tokens: { indexToken: "WETH.e", longToken: "WETH.e", shortToken: "WETH.e" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),

      ...singleTokenMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(5_000, 18),
      maxShortTokenPoolAmount: expandDecimals(5_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(15, 11), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(9, 11), // 0.05% for ~2,700,000 USD of imbalance

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(2, 10),

      maxOpenInterest: decimalToFloat(3_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(136, 14), // 0.00000000000136, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(17, 9), // 0.0000017%,  0.14212% per hour, 53.61% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // factor in open interest reserve factor 35%
      borrowingFactor: decimalToFloat(360, 10), // 3.60-8, 40% at 100% utilisation
    },
    {
      tokens: { indexToken: "XRP", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactor: decimalToFloat(8, 1), // 80%,

      openInterestReserveFactor: decimalToFloat(75, 2), // 75%,

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 8),
      positiveSwapImpactFactor: decimalToFloat(25, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(2, 9),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 75%
      borrowingFactor: decimalToFloat(2950, 11), // 0.0000000295 * 75% max reserve, ~70%
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactor: decimalToFloat(8, 1), // 80%
      openInterestReserveFactor: decimalToFloat(75, 2), // 75%,

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: decimalToFloat(5, 8),
      positiveSwapImpactFactor: decimalToFloat(25, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(5, 9),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 75%
      borrowingFactor: decimalToFloat(2950, 11), // 0.0000000295 * 75% max reserve, ~70%
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(50_000, 9),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000),

      negativePositionImpactFactor: decimalToFloat(1, 8), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(5, 9), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(5, 8),
      positiveSwapImpactFactor: decimalToFloat(25, 9),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(5, 9),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 100%
      borrowingFactor: decimalToFloat(2220, 11), // 0.0000000222 * 100% max reserve, 70% per year
    },
    {
      tokens: { indexToken: "LTC", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...synthethicMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactor: decimalToFloat(8, 1), // 80%,
      openInterestReserveFactor: decimalToFloat(75, 2), // 75%,

      negativePositionImpactFactor: decimalToFloat(8, 9), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(4, 9), // 0.05% for 125,000 USD of imbalance

      negativeSwapImpactFactor: decimalToFloat(1, 7),
      positiveSwapImpactFactor: decimalToFloat(5, 8),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(25, 10),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 75%
      borrowingFactor: decimalToFloat(2950, 11), // 0.0000000295 * 75% max reserve, ~70%
    },
    {
      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("155%"),
      openInterestReserveFactor: percentageToFloat("150%"),

      maxLongTokenPoolAmount: expandDecimals(400_000, 18),
      maxShortTokenPoolAmount: expandDecimals(11_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(5, 9),
      positivePositionImpactFactor: decimalToFloat(25, 10),

      negativeSwapImpactFactor: decimalToFloat(25, 10),
      positiveSwapImpactFactor: decimalToFloat(125, 11),

      // minCollateralFactor of 0.01 (1%) when open interest is 500,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(2, 8),

      positionImpactPoolDistributionRate: expandDecimals(166, 43), // ~143 AVAX/day
      minPositionImpactPoolAmount: expandDecimals(141, 18),

      maxOpenInterest: decimalToFloat(3_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 150%
      borrowingFactor: decimalToFloat(2000, 11), // 0.00000002 * 150% max reserve, 94.6% per year
    },
    {
      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "WAVAX" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),

      ...singleTokenMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(300_000, 18),
      maxShortTokenPoolAmount: expandDecimals(300_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: decimalToFloat(5, 9),
      positivePositionImpactFactor: decimalToFloat(25, 10),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      // minCollateralFactor of 0.01 (1%) when open interest is 500,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(2, 8),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: decimalToFloat(16, 13), // 0.0000000000016, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      minFundingFactorPerSecond: decimalToFloat(3, 10), // 0.00000003%, 0.000108% per hour, 0.95% per year
      maxFundingFactorPerSecond: decimalToFloat(2, 8), // 0.000002%,  0.0072% per hour, 63% per year
      thresholdForStableFunding: decimalToFloat(5, 2), // 5%
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // factor in open interest reserve factor 35%
      borrowingFactor: decimalToFloat(360, 10), // 3.60-8, 40% at 100% utilisation
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),
    },
    {
      tokens: { longToken: "USDT", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),
    },
    {
      tokens: { longToken: "USDC", shortToken: "DAI.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),
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

      maxPnlFactorForAdl: decimalToFloat(2, 2), // 2%

      minPnlFactorAfterAdl: decimalToFloat(1, 2), // 1%

      maxLongTokenPoolAmount: expandDecimals(10, 18),
      maxShortTokenPoolAmount: expandDecimals(300_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(300_000),
      isDisabled: false,
    },

    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDT" },

      borrowingFactor: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "DAI" },

      borrowingFactor: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

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

      openInterestReserveFactor: decimalToFloat(7, 1), // 70%,

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

      maxOpenInterest: decimalToFloat(250_000),

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
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(15, 7),

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

      maxPnlFactorForAdl: decimalToFloat(2, 2), // 2%
      minPnlFactorAfterAdl: decimalToFloat(1, 2), // 1%

      maxLongTokenPoolAmount: expandDecimals(10, 18),
      maxShortTokenPoolAmount: expandDecimals(300_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(300_000),
    },

    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDT" },

      borrowingFactor: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "DAI" },

      borrowingFactor: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

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
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "WETH" },
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

function fillLongShortValues(market, key, longKey, shortKey) {
  if (market[longKey] === undefined) {
    market[longKey] = market[key];
  }

  if (market[shortKey] === undefined) {
    market[shortKey] = market[key];
  }
}

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

      fillLongShortValues(market, "reserveFactor", "reserveFactorLongs", "reserveFactorShorts");

      fillLongShortValues(
        market,
        "openInterestReserveFactor",
        "openInterestReserveFactorLongs",
        "openInterestReserveFactorShorts"
      );

      fillLongShortValues(
        market,
        "minCollateralFactorForOpenInterestMultiplier",
        "minCollateralFactorForOpenInterestMultiplierLong",
        "minCollateralFactorForOpenInterestMultiplierShort"
      );

      fillLongShortValues(
        market,
        "maxPoolUsdForDeposit",
        "maxLongTokenPoolUsdForDeposit",
        "maxShortTokenPoolUsdForDeposit"
      );

      fillLongShortValues(market, "maxOpenInterest", "maxOpenInterestForLongs", "maxOpenInterestForShorts");

      fillLongShortValues(
        market,
        "maxPnlFactorForTraders",
        "maxPnlFactorForTradersLongs",
        "maxPnlFactorForTradersShorts"
      );

      fillLongShortValues(market, "maxPnlFactorForAdl", "maxPnlFactorForAdlLongs", "maxPnlFactorForAdlShorts");

      fillLongShortValues(market, "minPnlFactorAfterAdl", "minPnlFactorAfterAdlLongs", "minPnlFactorAfterAdlShorts");

      fillLongShortValues(
        market,
        "maxPnlFactorForDeposits",
        "maxPnlFactorForDepositsLongs",
        "maxPnlFactorForDepositsShorts"
      );

      fillLongShortValues(
        market,
        "maxPnlFactorForWithdrawals",
        "maxPnlFactorForWithdrawalsLongs",
        "maxPnlFactorForWithdrawalsShorts"
      );

      fillLongShortValues(
        market,
        "aboveOptimalUsageBorrowingFactor",
        "aboveOptimalUsageBorrowingFactorForLongs",
        "aboveOptimalUsageBorrowingFactorForShorts"
      );

      fillLongShortValues(market, "baseBorrowingFactor", "baseBorrowingFactorForLongs", "baseBorrowingFactorForShorts");

      fillLongShortValues(market, "optimalUsageFactor", "optimalUsageFactorForLongs", "optimalUsageFactorForShorts");

      fillLongShortValues(market, "borrowingFactor", "borrowingFactorForLongs", "borrowingFactorForShorts");

      fillLongShortValues(
        market,
        "borrowingExponentFactor",
        "borrowingExponentFactorForLongs",
        "borrowingExponentFactorForShorts"
      );
    }
  }
  return markets;
}
