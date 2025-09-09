import { BigNumberish, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { expandDecimals, exponentToFloat, decimalToFloat, bigNumberify, percentageToFloat } from "../utils/math";
import { hashString } from "../utils/hash";
import { SECONDS_PER_HOUR, SECONDS_PER_YEAR } from "../utils/constants";

export type BaseMarketConfig = {
  reserveFactor: BigNumberish;
  reserveFactorLongs?: BigNumberish;
  reserveFactorShorts?: BigNumberish;

  openInterestReserveFactor?: BigNumberish;
  openInterestReserveFactorLongs?: BigNumberish;
  openInterestReserveFactorShorts?: BigNumberish;

  minCollateralFactor: BigNumberish;
  minCollateralFactorForLiquidation: BigNumberish;
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
  liquidationFeeFactor: BigNumberish;

  negativePositionImpactFactor: BigNumberish;
  positivePositionImpactFactor: BigNumberish;
  positionImpactExponentFactor: BigNumberish;

  negativeMaxPositionImpactFactor: BigNumberish;
  positiveMaxPositionImpactFactor: BigNumberish;
  maxPositionImpactFactorForLiquidations: BigNumberish;

  swapFeeFactorForPositiveImpact: BigNumberish;
  swapFeeFactorForNegativeImpact: BigNumberish;
  atomicSwapFeeFactor: BigNumberish;
  atomicWithdrawalFeeFactor: BigNumberish;

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

  // note that this is in the index token, so the amount should be based
  // on how many decimals the index token is configured to have
  // e.g. if we want to distribute at a rate of 143 AVAX per day
  // since AVAX has 18 decimals, the value for this would be:
  // expandDecimals(143, 18 + 30).div(SECONDS_PER_DAY), 86400 is the seconds per day
  positionImpactPoolDistributionRate: BigNumberish;
  minPositionImpactPoolAmount: BigNumberish;

  maxLendableImpactFactor?: BigNumberish;
  maxLendableImpactFactorForWithdrawals?: BigNumberish;
  maxLendableImpactUsd?: BigNumberish;

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

type FundingRateConfig = Partial<{
  fundingFactor: BigNumberish;
  fundingExponentFactor: BigNumberish;

  fundingIncreaseFactorPerSecond: BigNumberish;
  fundingDecreaseFactorPerSecond: BigNumberish;
  thresholdForStableFunding: BigNumberish;
  thresholdForDecreaseFunding: BigNumberish;
  minFundingFactorPerSecond: BigNumberish;
  maxFundingFactorPerSecond: BigNumberish;
}>;

const fundingRateConfig_Low: FundingRateConfig = {
  // increase to 75% at 100% imbalance (100%/0%) in 3 hours
  // increase to 75% at 20% imbalance (60.%/40%) in 15 hours
  fundingIncreaseFactorPerSecond: percentageToFloat("75%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),

  // reduce from max 75% to 0% in 48 hours
  fundingDecreaseFactorPerSecond: percentageToFloat("75%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 48),

  maxFundingFactorPerSecond: percentageToFloat("75%").div(SECONDS_PER_YEAR),

  thresholdForStableFunding: percentageToFloat("4%"),
  thresholdForDecreaseFunding: 0,
};

const fundingRateConfig_Default: FundingRateConfig = {
  // increase to 90% at 100% imbalance (100%/0%) in 3 hours
  // increase to 90% at 20% imbalance (60.%/40%) in 15 hours
  fundingIncreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),

  // reduce from max 90% to 0% in 48 hours
  fundingDecreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 48),

  maxFundingFactorPerSecond: percentageToFloat("90%").div(SECONDS_PER_YEAR),

  thresholdForStableFunding: percentageToFloat("4%"),
  thresholdForDecreaseFunding: 0,
};

const fundingRateConfig_High: FundingRateConfig = {
  // increase to 100% at 100% imbalance (100%/0%) in 3 hours
  // increase to 100% at 20% imbalance (60.%/40%) in 15 hours
  fundingIncreaseFactorPerSecond: percentageToFloat("100%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),

  // reduce from max 100% to 0% in 48 hours
  fundingDecreaseFactorPerSecond: percentageToFloat("100%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 48),

  maxFundingFactorPerSecond: percentageToFloat("100%").div(SECONDS_PER_YEAR),

  thresholdForStableFunding: percentageToFloat("4%"),
  thresholdForDecreaseFunding: 0,
};

const fundingRateConfig_SingleToken: FundingRateConfig = {
  // increase to 90% at 100% imbalance (100%/0%) in 3 hours
  // increase to 90% at 20% imbalance (60%/40%) in 15 hours
  fundingIncreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),

  // reduce from max 90% to 0% in 48 hours
  fundingDecreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 48),

  maxFundingFactorPerSecond: percentageToFloat("90%").div(SECONDS_PER_YEAR),

  thresholdForStableFunding: percentageToFloat("4%"),
  thresholdForDecreaseFunding: 0,
};

type BorrowingRateConfig = Partial<{
  optimalUsageFactor: BigNumberish;
  baseBorrowingFactor: BigNumberish;
  aboveOptimalUsageBorrowingFactor: BigNumberish;
}>;

const borrowingRateConfig_LowMax_WithLowerBase: BorrowingRateConfig = {
  optimalUsageFactor: percentageToFloat("75%"),
  baseBorrowingFactor: percentageToFloat("45%").div(SECONDS_PER_YEAR),
  aboveOptimalUsageBorrowingFactor: percentageToFloat("100%").div(SECONDS_PER_YEAR),
};
const borrowingRateConfig_LowMax_WithHigherBase: BorrowingRateConfig = {
  optimalUsageFactor: percentageToFloat("75%"),
  baseBorrowingFactor: percentageToFloat("50%").div(SECONDS_PER_YEAR),
  aboveOptimalUsageBorrowingFactor: percentageToFloat("100%").div(SECONDS_PER_YEAR),
};

const borrowingRateConfig_HighMax_WithLowerBase: BorrowingRateConfig = {
  optimalUsageFactor: percentageToFloat("75%"),
  baseBorrowingFactor: percentageToFloat("50%").div(SECONDS_PER_YEAR),
  aboveOptimalUsageBorrowingFactor: percentageToFloat("130%").div(SECONDS_PER_YEAR),
};
const borrowingRateConfig_HighMax_WithHigherBase: BorrowingRateConfig = {
  optimalUsageFactor: percentageToFloat("75%"),
  baseBorrowingFactor: percentageToFloat("55%").div(SECONDS_PER_YEAR),
  aboveOptimalUsageBorrowingFactor: percentageToFloat("130%").div(SECONDS_PER_YEAR),
};

const baseMarketConfig: Partial<BaseMarketConfig> = {
  minCollateralFactor: percentageToFloat("1%"), // 1%
  minCollateralFactorForLiquidation: percentageToFloat("1%"), // 1%

  minCollateralFactorForOpenInterestMultiplier: 0,

  reserveFactor: percentageToFloat("95%"),
  openInterestReserveFactor: percentageToFloat("90%"),

  maxPnlFactorForTraders: percentageToFloat("90%"),
  maxPnlFactorForAdl: percentageToFloat("85%"),
  minPnlFactorAfterAdl: percentageToFloat("77%"),

  maxPnlFactorForDeposits: percentageToFloat("90%"),
  maxPnlFactorForWithdrawals: percentageToFloat("70%"),

  positionFeeFactorForPositiveImpact: percentageToFloat("0.04%"),
  positionFeeFactorForNegativeImpact: percentageToFloat("0.06%"),

  negativePositionImpactFactor: percentageToFloat("0.00001%"),
  positivePositionImpactFactor: percentageToFloat("0.000005%"),
  positionImpactExponentFactor: exponentToFloat("2e0"), // 2

  negativeMaxPositionImpactFactor: percentageToFloat("0.5%"),
  positiveMaxPositionImpactFactor: percentageToFloat("0.5%"),
  maxPositionImpactFactorForLiquidations: bigNumberify(0), // 0%

  swapFeeFactorForPositiveImpact: percentageToFloat("0.05%"),
  swapFeeFactorForNegativeImpact: percentageToFloat("0.07%"),
  atomicSwapFeeFactor: percentageToFloat("3.75%"),
  atomicWithdrawalFeeFactor: percentageToFloat("0.5%"),

  negativeSwapImpactFactor: percentageToFloat("0.001%"),
  positiveSwapImpactFactor: percentageToFloat("0.0005%"),
  swapImpactExponentFactor: exponentToFloat("2e0"), // 2

  minCollateralUsd: decimalToFloat(1, 0), // 1 USD

  // factor in open interest reserve factor 80%
  borrowingFactor: decimalToFloat(625, 11), // 0.00000000625 * 80% = 0.000000005, 0.0000005% / second, 15.77% per year if the pool is 100% utilized

  optimalUsageFactor: 0,
  baseBorrowingFactor: 0,
  aboveOptimalUsageBorrowingFactor: 0,

  borrowingExponentFactor: decimalToFloat(1),

  fundingFactor: exponentToFloat("2e-8"), // ~63% per year for a 100% skew
  fundingExponentFactor: decimalToFloat(1),

  minFundingFactorPerSecond: percentageToFloat("1%").div(SECONDS_PER_YEAR),
  maxFundingFactorPerSecond: percentageToFloat("90%").div(SECONDS_PER_YEAR), // ~0.246% per day
  fundingIncreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),
  fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
  thresholdForDecreaseFunding: decimalToFloat(0),

  positionImpactPoolDistributionRate: bigNumberify(0),
  minPositionImpactPoolAmount: 0,

  liquidationFeeFactor: percentageToFloat("0.20%"),
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
  atomicSwapFeeFactor: bigNumberify(0),

  negativeSwapImpactFactor: bigNumberify(0),
  positiveSwapImpactFactor: bigNumberify(0),
  swapImpactExponentFactor: decimalToFloat(1),

  liquidationFeeFactor: percentageToFloat("0.30%"),
};

const syntheticMarketConfig: Partial<BaseMarketConfig> = {
  ...baseMarketConfig,

  reserveFactor: percentageToFloat("95%"),
  openInterestReserveFactor: percentageToFloat("90%"),

  maxPnlFactorForTraders: percentageToFloat("60%"),
  maxPnlFactorForAdl: percentageToFloat("55%"),
  minPnlFactorAfterAdl: percentageToFloat("50%"),

  maxPnlFactorForDeposits: percentageToFloat("60%"),
  maxPnlFactorForWithdrawals: percentageToFloat("45%"),

  liquidationFeeFactor: percentageToFloat("0.30%"),
};

const synthethicMarketConfig_IncreasedCapacity: Partial<BaseMarketConfig> = {
  ...syntheticMarketConfig,

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

  negativeSwapImpactFactor: exponentToFloat("5e-10"), // 0.01% for 200,000 USD of imbalance
  positiveSwapImpactFactor: exponentToFloat("5e-10"), // 0.01% for 200,000 USD of imbalance
};

const hardhatBaseMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactor: decimalToFloat(5, 1), // 50%,
  openInterestReserveFactor: decimalToFloat(5, 1), // 50%,

  minCollateralFactor: percentageToFloat("1%"), // 1%
  minCollateralFactorForLiquidation: percentageToFloat("1%"), // 1%
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
  maxPositionImpactFactorForLiquidations: percentageToFloat("1%"), // 1%

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
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2.2e0"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~90,000 USD of imbalance
      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~45,000 USD of imbalance

      positiveSwapImpactFactor: exponentToFloat("1.5e-8"), // 1.5e-8
      negativeSwapImpactFactor: exponentToFloat("3e-8"),

      minCollateralFactor: percentageToFloat("1%"), // 1%
      minCollateralFactorForLiquidation: percentageToFloat("1%"), // 1%

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"), // 2.5e-9

      reserveFactor: percentageToFloat("105%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("100%"), // default is 90%

      maxOpenInterest: decimalToFloat(1_000_000),

      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // x1.5 of max open interest

      maxLongTokenPoolAmount: expandDecimals(1_800_000, 18), // ~2M USD (x2 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (x2 of max open interest)

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "BTC", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      reserveFactor: percentageToFloat("350%"),
      openInterestReserveFactor: percentageToFloat("345%"),

      maxLongTokenPoolAmount: expandDecimals(2200, 8),
      maxShortTokenPoolAmount: expandDecimals(110_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(72_000_000),

      negativePositionImpactFactor: exponentToFloat("9e-11"),
      positivePositionImpactFactor: exponentToFloat("3e-11"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(1206, 30 + 4).div(SECONDS_PER_DAY), // 0.1206 BTC / day
      minPositionImpactPoolAmount: expandDecimals(44, 8), // 44 BTC

      negativeSwapImpactFactor: exponentToFloat("4e-10"), // 0.05% for 1,250,000 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("2e-10"), // 0.05% for 2,500,000 USD of imbalance

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(60_000_000),

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "BTC", longToken: "WBTC.e", shortToken: "WBTC.e" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),

      ...singleTokenMarketConfig,
      ...fundingRateConfig_SingleToken,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(1500, 8),
      maxShortTokenPoolAmount: expandDecimals(1500, 8),

      maxPoolUsdForDeposit: decimalToFloat(42_500_000),

      positionImpactExponentFactor: exponentToFloat("1e0"),
      negativePositionImpactFactor: exponentToFloat("2e-15"),
      positivePositionImpactFactor: exponentToFloat("1e-15"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(46530, 26), // 4,653E+30, 0.0040202449 BTC / day
      minPositionImpactPoolAmount: expandDecimals(5, 6), // 0.05 BTC

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(11_000_000),
    },
    {
      tokens: { indexToken: "BTC", longToken: "tBTC", shortToken: "tBTC" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),

      ...singleTokenMarketConfig,
      ...fundingRateConfig_SingleToken,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      reserveFactor: percentageToFloat("85%"),
      openInterestReserveFactor: percentageToFloat("80%"),

      maxLongTokenPoolAmount: expandDecimals(100, 18),
      maxShortTokenPoolAmount: expandDecimals(100, 18),

      maxPoolUsdForDeposit: decimalToFloat(4_500_000),

      negativePositionImpactFactor: exponentToFloat("9e-11"),
      positivePositionImpactFactor: exponentToFloat("3e-11"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(1_000_000),
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      reserveFactor: percentageToFloat("275%"),
      openInterestReserveFactor: percentageToFloat("270%"),

      maxLongTokenPoolAmount: expandDecimals(32_000, 18),
      maxShortTokenPoolAmount: expandDecimals(100_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(90_000_000),

      negativePositionImpactFactor: exponentToFloat("9e-11"),
      positivePositionImpactFactor: exponentToFloat("3e-11"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: expandDecimals(1627, 18), // 1627 ETH

      negativeSwapImpactFactor: exponentToFloat("3e-10"),
      positiveSwapImpactFactor: exponentToFloat("2e-10"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(80_000_000),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "WETH" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),

      ...singleTokenMarketConfig,
      ...fundingRateConfig_SingleToken,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(12_000, 18),
      maxShortTokenPoolAmount: expandDecimals(12_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(45_000_000),

      positionImpactExponentFactor: exponentToFloat("1e0"),
      negativePositionImpactFactor: exponentToFloat("2e-15"),
      positivePositionImpactFactor: exponentToFloat("1e-15"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(37181, 37), // 3.718184E+41, 0.0321250994 ETH / day
      minPositionImpactPoolAmount: expandDecimals(5, 17), // 0.5 ETH

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(12_000_000),
    },
    {
      tokens: { indexToken: "WETH", longToken: "wstETH", shortToken: "USDe" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:wstETH/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      reserveFactor: percentageToFloat("125%"),

      openInterestReserveFactor: percentageToFloat("120%"),

      maxLongTokenPoolAmount: expandDecimals(650, 18),
      maxShortTokenPoolAmount: expandDecimals(2_500_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      negativePositionImpactFactor: exponentToFloat("9e-11"),
      positivePositionImpactFactor: exponentToFloat("3e-11"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      negativeSwapImpactFactor: exponentToFloat("1e-8"),
      positiveSwapImpactFactor: exponentToFloat("5e-9"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 83,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(6, 11),

      maxOpenInterest: decimalToFloat(1_000_000),

      swapFeeFactorForPositiveImpact: percentageToFloat("0.25%"),
      swapFeeFactorForNegativeImpact: percentageToFloat("0.25%"),

      isDisabled: false,

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "BNB", longToken: "BNB", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BNB/USD"),
      virtualMarketId: hashString("SPOT:BNB/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      reserveFactor: percentageToFloat("185%"),
      openInterestReserveFactor: percentageToFloat("180%"),

      maxLongTokenPoolAmount: expandDecimals(7_250, 18),
      maxShortTokenPoolAmount: expandDecimals(5_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(4_500_000),

      negativePositionImpactFactor: exponentToFloat("3.8e-11"), // 3.8e-11
      positivePositionImpactFactor: exponentToFloat("1.9e-11"), // 1.9e-11
      positionImpactExponentFactor: exponentToFloat("2.36e0"), // 2.36

      negativeSwapImpactFactor: exponentToFloat("4e-8"),
      positiveSwapImpactFactor: exponentToFloat("2e-8"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 6,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(8, 10),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(727, 40), // 0.727895E+43, 0.6289008462 BNB / day
      minPositionImpactPoolAmount: expandDecimals(53, 16), // 0.53 BNB

      maxOpenInterest: decimalToFloat(5_000_000),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "XRP", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...synthethicMarketConfig_IncreasedCapacity,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("21e-9"),
      positivePositionImpactFactor: exponentToFloat("7e-9"),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("185%"),
      openInterestReserveFactor: percentageToFloat("180%"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(1775, 30 + 6).div(SECONDS_PER_DAY), // 1775 XRP / day
      minPositionImpactPoolAmount: expandDecimals(305641, 6), // 305641 XRP

      maxOpenInterest: decimalToFloat(2_000_000),

      maxPoolUsdForDeposit: decimalToFloat(6_500_000),

      maxLongTokenPoolAmount: expandDecimals(3840, 18),
      maxShortTokenPoolAmount: expandDecimals(7_300_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...synthethicMarketConfig_IncreasedCapacity,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      positionImpactExponentFactor: exponentToFloat("1.62e0"),
      negativePositionImpactFactor: exponentToFloat("3.18e-7"),
      positivePositionImpactFactor: exponentToFloat("1.06e-7"),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      // minCollateralFactor of 0.005 (0.5%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("1e-9"),

      reserveFactor: percentageToFloat("185%"),
      openInterestReserveFactor: percentageToFloat("180%"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: expandDecimals(2511744, 8), // 2511744 DOGE

      maxOpenInterest: decimalToFloat(19_000_000),

      maxPoolUsdForDeposit: decimalToFloat(28_500_000),

      maxLongTokenPoolAmount: expandDecimals(10500, 18),
      maxShortTokenPoolAmount: expandDecimals(38_000_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "EIGEN", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:EIGEN/USD"),
      virtualMarketId: hashString("SPOT:WETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 2.5e-10,
      negativePositionImpactFactor: exponentToFloat("5e-10"), // 5e-10

      positiveSwapImpactFactor: exponentToFloat("2.5e-9"), // 2.5e-9
      negativeSwapImpactFactor: exponentToFloat("5e-9"), // 5e-9

      minCollateralFactor: percentageToFloat("1%"),
      minCollateralFactorForLiquidation: percentageToFloat("1%"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.8e-9"), // 38e-10

      maxOpenInterest: decimalToFloat(1_000_000),

      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      maxLongTokenPoolAmount: expandDecimals(1655, 18),
      maxShortTokenPoolAmount: expandDecimals(3_000_000, 6),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "SHIB", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SHIB/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // x1.5 of max open interest

      maxLongTokenPoolAmount: expandDecimals(636, 18), // ~2M USD
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD

      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2

      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~90,000 USD of imbalance

      negativeSwapImpactFactor: exponentToFloat("7.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("5e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"), // 2.5e-9

      maxOpenInterest: decimalToFloat(1_000_000),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "AAVE", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AAVE/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2

      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      negativePositionImpactFactor: exponentToFloat("5e-10"),

      negativeSwapImpactFactor: exponentToFloat("3e-10"),
      positiveSwapImpactFactor: exponentToFloat("2e-10"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.8e-9"),

      maxOpenInterest: decimalToFloat(2_000_000),
      maxPoolUsdForDeposit: decimalToFloat(3_000_000), // x1.5 of max open interest

      maxLongTokenPoolAmount: expandDecimals(1525, 18),
      maxShortTokenPoolAmount: expandDecimals(4_000_000, 6),

      reserveFactor: percentageToFloat("165%"),
      openInterestReserveFactor: percentageToFloat("160%"),

      maxPnlFactorForTraders: percentageToFloat("75%"),
      maxPnlFactorForDeposits: percentageToFloat("75%"),
      maxPnlFactorForAdl: percentageToFloat("70%"),
      minPnlFactorAfterAdl: percentageToFloat("65%"),
      maxPnlFactorForWithdrawals: percentageToFloat("60%"),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "UNI", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:UNI/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativePositionImpactFactor: exponentToFloat("3.15e-8"),
      positivePositionImpactFactor: exponentToFloat("1.05e-8"),

      positiveSwapImpactFactor: exponentToFloat("2e-10"),
      negativeSwapImpactFactor: exponentToFloat("3e-10"),

      minCollateralFactor: percentageToFloat("0.833%"), // max leverage 120x
      minCollateralFactorForLiquidation: percentageToFloat("0.833%"),
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.5e-9"),

      maxOpenInterest: decimalToFloat(2_000_000),
      maxPoolUsdForDeposit: decimalToFloat(3_000_000), // x1.5 of max open interest

      maxLongTokenPoolAmount: expandDecimals(1525, 18),
      maxShortTokenPoolAmount: expandDecimals(4_000_000, 6),

      reserveFactor: percentageToFloat("145%"),
      openInterestReserveFactor: percentageToFloat("140%"),

      maxPnlFactorForTraders: percentageToFloat("75%"),
      maxPnlFactorForDeposits: percentageToFloat("75%"),
      maxPnlFactorForAdl: percentageToFloat("70%"),
      minPnlFactorAfterAdl: percentageToFloat("65%"),
      maxPnlFactorForWithdrawals: percentageToFloat("60%"),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "PEPE", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:PEPE/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      negativePositionImpactFactor: exponentToFloat("5e-10"),

      positiveSwapImpactFactor: exponentToFloat("2e-10"),
      negativeSwapImpactFactor: exponentToFloat("3e-10"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // x1.5 of max open interest

      maxLongTokenPoolAmount: expandDecimals(750, 18),
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6),

      reserveFactor: percentageToFloat("95%"),
      openInterestReserveFactor: percentageToFloat("90%"),

      maxPnlFactorForTraders: percentageToFloat("50%"),
      maxPnlFactorForDeposits: percentageToFloat("50%"),
      maxPnlFactorForAdl: percentageToFloat("45%"),
      minPnlFactorAfterAdl: percentageToFloat("40%"),
      maxPnlFactorForWithdrawals: percentageToFloat("35%"),

      fundingIncreaseFactorPerSecond: percentageToFloat("125%")
        .div(SECONDS_PER_YEAR)
        .div(SECONDS_PER_HOUR * 3),
      fundingDecreaseFactorPerSecond: percentageToFloat("125%")
        .div(SECONDS_PER_YEAR)
        .div(SECONDS_PER_HOUR * 48),
      maxFundingFactorPerSecond: percentageToFloat("125%").div(SECONDS_PER_YEAR),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),
      virtualMarketId: hashString("SPOT:SOL/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      maxLongTokenPoolAmount: expandDecimals(110_000, 9),
      maxShortTokenPoolAmount: expandDecimals(20_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(17_500_000),

      negativePositionImpactFactor: exponentToFloat("1.35e-9"), // 1.35e-9
      positivePositionImpactFactor: exponentToFloat("0.45e-9"), // 0.45e-9
      positionImpactExponentFactor: exponentToFloat("2e0"), // 2.0

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 25,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("355%"),
      openInterestReserveFactor: percentageToFloat("350%"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(22, 30 + 9).div(SECONDS_PER_DAY), // 22 SOL / day
      minPositionImpactPoolAmount: expandDecimals(9574, 9), // 9574 SOL

      maxOpenInterest: decimalToFloat(17_500_000),

      atomicSwapFeeFactor: percentageToFloat("1.5%"),
    },
    {
      tokens: { indexToken: "STX", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:STX/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~90,000 USD of imbalance
      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~45,000 USD of imbalance

      positiveSwapImpactFactor: exponentToFloat("1.25e-9"), // 1.25e-9
      negativeSwapImpactFactor: exponentToFloat("2.5e-9"), // 2.5e-9

      minCollateralFactor: percentageToFloat("1%"), // 1%
      minCollateralFactorForLiquidation: percentageToFloat("1%"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"), // 2.5e-9

      maxOpenInterest: decimalToFloat(500_000),

      reserveFactor: percentageToFloat("145%"),
      openInterestReserveFactor: percentageToFloat("140%"),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000), // x2 of max open interest

      maxLongTokenPoolAmount: expandDecimals(25, 8), // ~1,5M USD (x3 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6), // ~1,5M USD (x3 of max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "SATS", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SATS/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~90,000 USD of imbalance
      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~45,000 USD of imbalance

      positiveSwapImpactFactor: exponentToFloat("1.25e-9"), // 1.25e-9
      negativeSwapImpactFactor: exponentToFloat("2.5e-9"), // 2.5e-9

      minCollateralFactor: percentageToFloat("1%"), // 1%
      minCollateralFactorForLiquidation: percentageToFloat("1%"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"), // 2.5e-9

      reserveFactor: percentageToFloat("125%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("120%"), // default is 90%

      maxOpenInterest: decimalToFloat(500_000),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000), // x2 of max open interest

      maxLongTokenPoolAmount: expandDecimals(25, 8), // ~1,5M USD (x3 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6), // ~1,5M USD (x3 of max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "LTC", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("2.7e-8"),
      positivePositionImpactFactor: exponentToFloat("9e-9"),

      negativeSwapImpactFactor: exponentToFloat("3.75e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 1,500,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.5e-9"),

      reserveFactor: percentageToFloat("195%"),
      openInterestReserveFactor: percentageToFloat("190%"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(2709, 30), // 2.709055E+33, 2.34 LTC / day
      minPositionImpactPoolAmount: expandDecimals(28, 8), // 28 LTC

      maxOpenInterest: decimalToFloat(1_000_000),

      maxPoolUsdForDeposit: decimalToFloat(2_400_000),

      maxLongTokenPoolAmount: expandDecimals(1720, 18),
      maxShortTokenPoolAmount: expandDecimals(3_120_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "UNI", longToken: "UNI", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:UNI/USD"),
      virtualMarketId: hashString("SPOT:UNI/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      reserveFactor: percentageToFloat("165%"),
      openInterestReserveFactor: percentageToFloat("160%"),

      maxLongTokenPoolAmount: expandDecimals(150_000, 18),
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_500_000),

      negativePositionImpactFactor: exponentToFloat("3.15e-8"),
      positivePositionImpactFactor: exponentToFloat("1.05e-8"),

      negativeSwapImpactFactor: exponentToFloat("3e-8"), // 0.05% for 16,667 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("1.5e-8"), // 0.05% for 33,333 USD of imbalance

      minCollateralFactor: percentageToFloat("0.833%"), // 120x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.833%"), // 120x leverage
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 2,400,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.5e-9"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(7166, 41), // 0.716642E+45, 61.91 UNI / day
      minPositionImpactPoolAmount: expandDecimals(170, 18),

      maxOpenInterest: decimalToFloat(1_000_000),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "LINK", longToken: "LINK", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LINK/USD"),
      virtualMarketId: hashString("SPOT:LINK/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      reserveFactor: percentageToFloat("305%"),
      openInterestReserveFactor: percentageToFloat("300%"),

      maxLongTokenPoolAmount: expandDecimals(690_000, 18),
      maxShortTokenPoolAmount: expandDecimals(13_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_800_000),

      negativePositionImpactFactor: exponentToFloat("3e-10"),
      positivePositionImpactFactor: exponentToFloat("1e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2

      negativeSwapImpactFactor: exponentToFloat("6e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage
      // minCollateralFactor of 0.005 (0.5%) when open interest is 8,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(64, 11),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(173, 30 + 18).div(SECONDS_PER_DAY), // 173 LINK / day
      minPositionImpactPoolAmount: expandDecimals(41779, 18), // 41779 LINK

      maxOpenInterest: decimalToFloat(16_000_000),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "ARB", longToken: "ARB", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ARB/USD"),
      virtualMarketId: hashString("SPOT:ARB/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      maxLongTokenPoolAmount: expandDecimals(7_524_000, 18),
      maxShortTokenPoolAmount: expandDecimals(15_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(14_000_000),

      negativePositionImpactFactor: decimalToFloat(375, 12),
      positivePositionImpactFactor: decimalToFloat(125, 12),
      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      minCollateralFactor: percentageToFloat("0.667%"), // 150x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.667%"), // 150x leverage
      // minCollateralFactor of 0.00667 (0.667%) when open interest is 13,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("5e-10"),

      reserveFactor: percentageToFloat("235%"),
      openInterestReserveFactor: percentageToFloat("230%"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(1378, 30 + 18).div(SECONDS_PER_DAY), // 1378 ARB / day
      minPositionImpactPoolAmount: expandDecimals(384957, 18), // 384957 ARB

      maxOpenInterest: decimalToFloat(5_000_000),

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "AAVE", longToken: "AAVE", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AAVE/USD"),
      virtualMarketId: hashString("SPOT:AAVE/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      reserveFactor: percentageToFloat("180%"),
      openInterestReserveFactor: percentageToFloat("175%"),

      maxLongTokenPoolAmount: expandDecimals(27_800, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~90,000 USD of imbalance
      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2

      negativeSwapImpactFactor: exponentToFloat("6e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,700,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.8e-9"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(25, 17 + 30).div(SECONDS_PER_DAY), // 2.5 AAVE per day
      minPositionImpactPoolAmount: expandDecimals(900, 18), // 900 AAVE

      maxOpenInterest: decimalToFloat(2_450_000), // ~2% of global OI

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "AVAX", longToken: "AVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      maxLongTokenPoolAmount: expandDecimals(83_300, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: exponentToFloat("1e-8"), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("5e-9"), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: exponentToFloat("3e-8"),
      positiveSwapImpactFactor: exponentToFloat("1.5e-8"),

      minCollateralFactor: percentageToFloat("0.833%"), // 120x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.833%"), // 120x leverage
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 3,300,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("205%"),
      openInterestReserveFactor: percentageToFloat("200%"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(1643, 41), // 1.64325E+44, 14,2 AVAX / day
      minPositionImpactPoolAmount: expandDecimals(79, 18), // 79.18 AVAX

      maxOpenInterest: decimalToFloat(2_100_000), // ~2% of global OI

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "ATOM", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ATOM/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      maxLongTokenPoolAmount: expandDecimals(900, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      negativePositionImpactFactor: decimalToFloat(26, 9),
      positivePositionImpactFactor: decimalToFloat(13, 9),

      // the swap impact factor is for WETH-stablecoin swaps
      negativeSwapImpactFactor: exponentToFloat("3.75e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      minCollateralFactor: percentageToFloat("0.833%"), // 120x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.833%"),
      // minCollateralFactor of 0.00833 (0.833%) when open interest is 1,700,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("5e-9"),

      reserveFactor: percentageToFloat("195%"),
      openInterestReserveFactor: percentageToFloat("190%"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(5442, 28), // 5.442645E+31, 4,7 ATOM / day
      minPositionImpactPoolAmount: expandDecimals(611, 6), // 611 ATOM

      maxOpenInterest: decimalToFloat(1_000_000),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "NEAR", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:NEAR/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      maxLongTokenPoolAmount: expandDecimals(1515, 18),
      maxShortTokenPoolAmount: expandDecimals(5_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(4_500_000),

      negativePositionImpactFactor: decimalToFloat(195, 10),
      positivePositionImpactFactor: decimalToFloat(65, 10),

      negativeSwapImpactFactor: exponentToFloat("3.75e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("185%"),
      openInterestReserveFactor: percentageToFloat("180%"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(928, 48), // 0.928E+51, 80.22629972 NEAR / day
      minPositionImpactPoolAmount: expandDecimals(4361, 24), // 4361 NEAR

      maxOpenInterest: decimalToFloat(1_000_000),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "OP", longToken: "OP", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:OP/USD"),
      virtualMarketId: hashString("SPOT:OP/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      maxLongTokenPoolAmount: expandDecimals(750_000, 18),
      maxShortTokenPoolAmount: expandDecimals(3_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      negativePositionImpactFactor: decimalToFloat(7, 10), // 0.05% for ~45,000 USD of imbalance
      positivePositionImpactFactor: decimalToFloat(35, 11), // 0.05% for ~80,000 USD of imbalance
      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2

      negativeSwapImpactFactor: exponentToFloat("8e-9"), // 0.05% for 62,500 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("4e-9"), // 0.05% for 125,000 USD of imbalance

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("5e-9"),

      reserveFactor: percentageToFloat("135%"),
      openInterestReserveFactor: percentageToFloat("130%"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(2100, 41), // 2.1E+44, 18.14 OP / day
      minPositionImpactPoolAmount: expandDecimals(311, 18), // 311 OP

      maxOpenInterest: decimalToFloat(1_000_000),

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "ORDI", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ORDI/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~90,000 USD of imbalance
      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~45,000 USD of imbalance

      positiveSwapImpactFactor: exponentToFloat("1.25e-9"), // 1.25e-9
      negativeSwapImpactFactor: exponentToFloat("2.5e-9"), // 2.5e-9

      borrowingFactor: exponentToFloat("1.6e-8"), // 1.60E-08, ~50% if 100% utilized

      minCollateralFactor: percentageToFloat("1%"), // 1%
      minCollateralFactorForLiquidation: percentageToFloat("1%"), // 200x leverage

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"), // 2.5e-9

      maxOpenInterest: decimalToFloat(500_000),

      reserveFactor: percentageToFloat("145%"),
      openInterestReserveFactor: percentageToFloat("140%"),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000), // x2 of max open interest

      maxLongTokenPoolAmount: expandDecimals(16, 8), // ~1,5M USD (x3 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_500_000, 6), // ~1,5M USD (x3 of max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "GMX", longToken: "GMX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:GMX/USD"),
      virtualMarketId: hashString("SPOT:GMX/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("0.795469e-6"),
      positivePositionImpactFactor: exponentToFloat("2.65156e-07"),
      positionImpactExponentFactor: exponentToFloat("1.76045e0"),

      negativeSwapImpactFactor: exponentToFloat("12e-9"),
      positiveSwapImpactFactor: exponentToFloat("6e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,632,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.8e-9"),

      reserveFactor: percentageToFloat("205%"),
      openInterestReserveFactor: percentageToFloat("200%"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: expandDecimals(11534, 18), // 11534 GMX

      maxOpenInterest: decimalToFloat(1_800_000),

      maxPoolUsdForDeposit: decimalToFloat(3_500_000),

      maxLongTokenPoolAmount: expandDecimals(340_000, 18),
      maxShortTokenPoolAmount: expandDecimals(4_000_000, 6),

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "GMX", longToken: "GMX", shortToken: "GMX" },
      virtualTokenIdForIndexToken: hashString("PERP:GMX/USD"),

      ...singleTokenMarketConfig,
      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
      maxPnlFactorForTraders: percentageToFloat("50%"),

      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      positiveMaxPositionImpactFactor: percentageToFloat("0.5%"),
      negativeMaxPositionImpactFactor: percentageToFloat("0.5%"),
      maxPositionImpactFactorForLiquidations: bigNumberify(0), // 0%

      minCollateralFactor: percentageToFloat("1%"), // 100x leverage
      minCollateralFactorForLiquidation: percentageToFloat("1%"), // 200x leverage
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      maxOpenInterest: decimalToFloat(750_000),
      maxPoolUsdForDeposit: decimalToFloat(1250_000),

      maxLongTokenPoolAmount: expandDecimals(55_000, 18),
      maxShortTokenPoolAmount: expandDecimals(55_000, 18),
    },
    {
      tokens: { indexToken: "PEPE", longToken: "PEPE", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:PEPE/USD"),
      virtualMarketId: hashString("SPOT:PEPE/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      maxLongTokenPoolAmount: expandDecimals(243_000_000_000, 18),
      maxShortTokenPoolAmount: expandDecimals(3_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(2_700_000),

      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~100,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~178,180 USD of imbalance
      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2

      negativeSwapImpactFactor: exponentToFloat("3e-8"), // 0.05% for 16,667 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("1.5e-8"), // 0.05% for 33,333 USD of imbalance

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: 0,

      maxOpenInterest: decimalToFloat(1_600_000), // ~1% of global OI

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "WIF", longToken: "WIF", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:WIF/USD"),
      virtualMarketId: hashString("SPOT:WIF/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"), // 0.05% for ~100,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("2.5e-10"), // 0.05% for ~178,180 USD of imbalance
      positionImpactExponentFactor: exponentToFloat("2.2e0"), // 2.2

      negativeSwapImpactFactor: exponentToFloat("3e-8"), // 0.05% for 16,667 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("1.5e-8"), // 0.05% for 33,333 USD of imbalance

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("125%"),
      openInterestReserveFactor: percentageToFloat("120%"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: 0,

      maxOpenInterest: decimalToFloat(500_000),

      maxPoolUsdForDeposit: decimalToFloat(4_400_000),

      maxLongTokenPoolAmount: expandDecimals(11_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(4_800_000, 6),

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "POL", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:POL/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("185%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("180%"), // default is 90%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(400, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "SUI", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SUI/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("155%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("150%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(265, 30 + 9).div(SECONDS_PER_DAY), // 265 SUI / day
      minPositionImpactPoolAmount: expandDecimals(13793, 9), // 13793 SUI

      maxOpenInterest: decimalToFloat(9_000_000),

      maxPoolUsdForDeposit: decimalToFloat(9_000_000),
      maxLongTokenPoolAmount: expandDecimals(2960, 18),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "SEI", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SEI/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("155%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("150%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(1_000_000),

      maxLongTokenPoolAmount: expandDecimals(763, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "APT", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:APT/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("145%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("140%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000),

      maxLongTokenPoolAmount: expandDecimals(577, 18),
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "TIA", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:TIA/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("155%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("150%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(500_000),

      maxPoolUsdForDeposit: decimalToFloat(750_000),
      maxLongTokenPoolAmount: expandDecimals(380, 18), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "TRX", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:TRX/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("75%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("70%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(400, 18), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "TON", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:TON/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      minCollateralFactor: percentageToFloat("0.667%"), // 150x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.667%"), // 150 leverage
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("175%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("170%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(800, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "TAO", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:TAO/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("155%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("150%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(23, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "BONK", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BONK/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("115%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("110%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(630, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "WLD", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:WLD/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("135%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("130%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(630, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "BOME", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BOME/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      minCollateralFactor: percentageToFloat("1%"), // 100x leverage
      minCollateralFactorForLiquidation: percentageToFloat("1%"), // 100x leverage
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("125%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("120%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(11, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "MEME", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:MEME/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      minCollateralFactor: percentageToFloat("1%"), // 100x leverage
      minCollateralFactorForLiquidation: percentageToFloat("1%"), // 100x leverage
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("105%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("100%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(11, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "FLOKI", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:FLOKI/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("145%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("140%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(21, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "MEW", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:MEW/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("125%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("120%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(21, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { longToken: "wstETH", shortToken: "WETH" },

      ...baseMarketConfig,

      swapOnly: true,

      isDisabled: false,

      maxLongTokenPoolAmount: expandDecimals(3300, 18),
      maxShortTokenPoolAmount: expandDecimals(2800, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativeSwapImpactFactor: exponentToFloat("1e-8"),
      positiveSwapImpactFactor: exponentToFloat("5e-9"),

      swapFeeFactorForPositiveImpact: percentageToFloat("0.3%"),
      swapFeeFactorForNegativeImpact: percentageToFloat("0.3%"),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
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

      isDisabled: true,

      atomicSwapFeeFactor: percentageToFloat("0.50%"),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      swapOnly: true,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativeSwapImpactFactor: decimalToFloat(15, 10), // 0.01% for 66,667 USD of imbalance
      positiveSwapImpactFactor: decimalToFloat(15, 10), // 0.01% for 66,667 USD of imbalance

      swapFeeFactorForPositiveImpact: decimalToFloat(5, 5), // 0.005%,
      swapFeeFactorForNegativeImpact: decimalToFloat(2, 4), // 0.02%,

      atomicSwapFeeFactor: percentageToFloat("0.50%"),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      swapOnly: true,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativeSwapImpactFactor: exponentToFloat("5e-9"), // 0.01% for 20,000 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("5e-9"), // 0.01% for 20,000 USD of imbalance

      swapFeeFactorForPositiveImpact: decimalToFloat(5, 5), // 0.005%,
      swapFeeFactorForNegativeImpact: decimalToFloat(2, 4), // 0.02%,

      atomicSwapFeeFactor: percentageToFloat("0.50%"),
    },
    {
      tokens: { longToken: "USDC", shortToken: "DAI" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      swapOnly: true,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativeSwapImpactFactor: exponentToFloat("5e-9"), // 0.01% for 20,000 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("5e-9"), // 0.01% for 20,000 USD of imbalance

      swapFeeFactorForPositiveImpact: decimalToFloat(5, 5), // 0.005%,
      swapFeeFactorForNegativeImpact: decimalToFloat(2, 4), // 0.02%,

      atomicSwapFeeFactor: percentageToFloat("0.50%"),
    },
    {
      tokens: { indexToken: "PENDLE", longToken: "PENDLE", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:PENDLE/USD"),
      virtualMarketId: hashString("SPOT:PENDLE/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.2e0"),

      negativeSwapImpactFactor: exponentToFloat("5e-9"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("165%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("160%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 90%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // x1.5 of max open interest

      maxLongTokenPoolAmount: expandDecimals(375_000, 18), // ~2M USD (x2 of max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (x2 of max open interest)

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "SOL", longToken: "SOL", shortToken: "SOL" },
      virtualTokenIdForIndexToken: hashString("PERP:SOL/USD"),

      ...singleTokenMarketConfig,
      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
      maxPnlFactorForTraders: percentageToFloat("90%"),

      ...fundingRateConfig_Default, // fundingRateConfig_SingleToken has timeToReachMaxFundingFactorFromZero = 2 hours

      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("1.35e-9"),
      positivePositionImpactFactor: exponentToFloat("4.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      positiveMaxPositionImpactFactor: percentageToFloat("0.5%"),
      negativeMaxPositionImpactFactor: percentageToFloat("0.5%"),
      maxPositionImpactFactorForLiquidations: bigNumberify(0), // 0%

      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6.0e-11"),

      maxOpenInterest: decimalToFloat(4_000_000),
      maxPoolUsdForDeposit: decimalToFloat(6_000_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(34_500, 9), // ~8M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(34_500, 9), // ~8M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "ADA", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ADA/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("100%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("95%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(2_000_000),
      maxPoolUsdForDeposit: decimalToFloat(3_000_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(44, 8), // ~4M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(4_000_000, 6), // ~4M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "XLM", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XLM/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("105%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("100%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(2_000_000),
      maxPoolUsdForDeposit: decimalToFloat(3_000_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(44, 8), // ~4M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(4_000_000, 6), // ~4M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "BCH", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BCH/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("2.5e-9"),
      positivePositionImpactFactor: exponentToFloat("1.25e-9"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("125%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("120%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("75%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(22, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "DOT", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOT/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("2.5e-9"),
      positivePositionImpactFactor: exponentToFloat("1.25e-9"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("115%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("110%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("75%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(22, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "ICP", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ICP/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("2.5e-9"),
      positivePositionImpactFactor: exponentToFloat("1.25e-9"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("135%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("130%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("75%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(22, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "FIL", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:FIL/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("135%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("130%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(10, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "INJ", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:INJ/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // timeToDecreaseFromMaxFundingToZero is "-" in initial recomandations
      ...borrowingRateConfig_HighMax_WithHigherBase,
      aboveOptimalUsageBorrowingFactor: percentageToFloat("110%").div(SECONDS_PER_YEAR),

      negativePositionImpactFactor: exponentToFloat("9e-9"),
      positivePositionImpactFactor: exponentToFloat("4.5e-9"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("165%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("160%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(21, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "DYDX", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DYDX/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // timeToDecreaseFromMaxFundingToZero is "-" in initial recomandations
      ...borrowingRateConfig_HighMax_WithHigherBase,
      aboveOptimalUsageBorrowingFactor: percentageToFloat("110%").div(SECONDS_PER_YEAR),

      negativePositionImpactFactor: exponentToFloat("9e-9"),
      positivePositionImpactFactor: exponentToFloat("4.5e-9"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("105%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("100%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(10, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "RENDER", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:RENDER/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("2.5e-9"),
      positivePositionImpactFactor: exponentToFloat("1.25e-9"),
      positionImpactExponentFactor: exponentToFloat("2.0e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      // minCollateralFactor of 0.01 (1%)
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      reserveFactor: percentageToFloat("155%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("150%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("75%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_500_000),
      maxPoolUsdForDeposit: decimalToFloat(1_875_000),

      maxLongTokenPoolAmount: expandDecimals(1390, 18),
      maxShortTokenPoolAmount: expandDecimals(2_500_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "TRUMP", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:TRUMP/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("9.39e-7"),
      positivePositionImpactFactor: exponentToFloat("6.26e-7"),
      positionImpactExponentFactor: exponentToFloat("1.7e0"),

      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      liquidationFeeFactor: percentageToFloat("0.45%"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-8"),

      reserveFactor: percentageToFloat("85%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("80%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(750_000),
      maxPoolUsdForDeposit: decimalToFloat(3_300_000),

      maxLongTokenPoolAmount: expandDecimals(1818, 18),
      maxShortTokenPoolAmount: expandDecimals(3_600_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "MELANIA", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:MELANIA/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("9.39e-7"),
      positivePositionImpactFactor: exponentToFloat("6.26e-7"),
      positionImpactExponentFactor: exponentToFloat("1.7e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-8"),

      liquidationFeeFactor: percentageToFloat("0.45%"),

      reserveFactor: percentageToFloat("115%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("110%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000),

      maxLongTokenPoolAmount: expandDecimals(850, 18),
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "ENA", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ENA/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("8e-7"),
      positivePositionImpactFactor: exponentToFloat("4e-7"),
      positionImpactExponentFactor: exponentToFloat("1.6e0"),

      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("95%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("90%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(3_000_000),
      maxPoolUsdForDeposit: decimalToFloat(6_300_000),

      maxLongTokenPoolAmount: expandDecimals(1660, 18),
      maxShortTokenPoolAmount: expandDecimals(7_560_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "FARTCOIN", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:FARTCOIN/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("5e-7"),
      positivePositionImpactFactor: exponentToFloat("2.5e-7"),
      positionImpactExponentFactor: exponentToFloat("1.7e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("85%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("80%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_950_000), // ~1% of global OI

      maxPoolUsdForDeposit: decimalToFloat(3_840_000),

      maxLongTokenPoolAmount: expandDecimals(37, 8),
      maxShortTokenPoolAmount: expandDecimals(4_600_000, 6),

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "AI16Z", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AI16Z/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("5e-7"),
      positivePositionImpactFactor: exponentToFloat("2.5e-7"),
      positionImpactExponentFactor: exponentToFloat("1.7e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("75%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("70%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(10, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "ANIME", longToken: "ANIME", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ANIME/USD"),
      virtualMarketId: hashString("SPOT:ANIME/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("5e-7"),
      positivePositionImpactFactor: exponentToFloat("2.5e-7"),
      positionImpactExponentFactor: exponentToFloat("1.7e0"),

      negativeSwapImpactFactor: exponentToFloat("3e-8"),
      positiveSwapImpactFactor: exponentToFloat("1.5e-8"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("4e-9"),

      reserveFactor: percentageToFloat("125%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("120%"), // default is 90%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(22_000_000, 18), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "LDO", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LDO/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("1.4e-8"),
      positivePositionImpactFactor: exponentToFloat("7e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("95%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("90%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(740, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "BERA", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BERA/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("1e-7"),
      positivePositionImpactFactor: exponentToFloat("5e-8"),
      positionImpactExponentFactor: exponentToFloat("1.7e0"),

      negativeSwapImpactFactor: exponentToFloat("4.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("3e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("95%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("90%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_800_000),
      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      maxLongTokenPoolAmount: expandDecimals(1850, 18),
      maxShortTokenPoolAmount: expandDecimals(3_500_000, 6),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "VIRTUAL", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:VIRTUAL/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("2e-8"),
      positivePositionImpactFactor: exponentToFloat("1e-8"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("75%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("70%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(21, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "PENGU", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:PENGU/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("1.6e-8"),
      positivePositionImpactFactor: exponentToFloat("8e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("85%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("80%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(2_400_000),
      maxPoolUsdForDeposit: decimalToFloat(3_600_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(40, 8), // 2x the max open interest
      maxShortTokenPoolAmount: expandDecimals(4_800_000, 6), // 2x the max open interest

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "ONDO", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ONDO/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("8e-9"),
      positivePositionImpactFactor: exponentToFloat("4e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("170%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("165%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(740, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "FET", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:FET/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("1e-8"),
      positivePositionImpactFactor: exponentToFloat("5e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("155%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("150%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(740, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "S", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:S/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("1.2e-8"),
      positivePositionImpactFactor: exponentToFloat("6e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("115%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("110%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(23, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "CAKE", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:CAKE/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("1.8e-8"),
      positivePositionImpactFactor: exponentToFloat("9e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("85%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("80%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(23, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "AIXBT", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AIXBT/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("2e-8"),
      positivePositionImpactFactor: exponentToFloat("1e-8"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("65%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("60%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(300_000),
      maxPoolUsdForDeposit: decimalToFloat(450_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(200, 18), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(600_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "HYPE", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:HYPE/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("4e-7"),
      positivePositionImpactFactor: exponentToFloat("2e-7"),
      positionImpactExponentFactor: exponentToFloat("1.75e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      positionImpactPoolDistributionRate: bigNumberify(0), // expandDecimals(40, 8 + 30).div(SECONDS_PER_DAY), // 40 HYPE per day
      minPositionImpactPoolAmount: expandDecimals(3400, 8), // 3400 HYPE

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("145%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("140%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(5_000_000),
      maxPoolUsdForDeposit: decimalToFloat(4_500_000),

      maxLongTokenPoolAmount: expandDecimals(50, 8),
      maxShortTokenPoolAmount: expandDecimals(5_500_000, 6),

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "JUP", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:JUP/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("1.5e-8"),
      positivePositionImpactFactor: exponentToFloat("7.5e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("95%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("90%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(22, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "MKR", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:MKR/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("1.6e-8"),
      positivePositionImpactFactor: exponentToFloat("8e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("135%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("130%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(1000, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2.25%"),
    },
    {
      tokens: { indexToken: "OM", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:OM/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-8"),
      positivePositionImpactFactor: exponentToFloat("2.5e-8"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("55%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("50%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(18_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(24, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
    {
      tokens: { indexToken: "DOLO", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOLO/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("1e-7"),
      positivePositionImpactFactor: exponentToFloat("8.33e-8"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("1.78e-7"),

      reserveFactor: percentageToFloat("75%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("70%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      maxLongTokenPoolAmount: expandDecimals(522, 18),
      maxShortTokenPoolAmount: expandDecimals(2_400_000, 6),
    },
    {
      tokens: { indexToken: "ZRO", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ZRO/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("5e-8"),
      positivePositionImpactFactor: exponentToFloat("4.17e-8"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("95%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("90%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(550, 18), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "CRV", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:CRV/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("1.4e-8"),
      positivePositionImpactFactor: exponentToFloat("1.2e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("95%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("90%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(3_000_000),
      maxPoolUsdForDeposit: decimalToFloat(4_750_000),

      maxLongTokenPoolAmount: expandDecimals(1470, 18),
      maxShortTokenPoolAmount: expandDecimals(5_700_000, 6),
    },
    {
      tokens: { indexToken: "MOODENG", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:MOODENG/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("1.2e-8"),
      positivePositionImpactFactor: exponentToFloat("1.0e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("65%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("60%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(9, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "XMR", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XMR/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("1.8e-8"),
      positivePositionImpactFactor: exponentToFloat("1.5e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("1.59e-8"),

      reserveFactor: percentageToFloat("95%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("90%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(18, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "PI", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:PI/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("2.54e-8"),
      positivePositionImpactFactor: exponentToFloat("2.11e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("1.59e-8"),

      reserveFactor: percentageToFloat("85%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("80%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(18, 8), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "PUMP", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:PUMP/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("6e-8"),
      positivePositionImpactFactor: exponentToFloat("5e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("8.89e-8"),

      reserveFactor: percentageToFloat("55%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("50%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(2_000_000),

      maxLongTokenPoolAmount: expandDecimals(21, 8),
      maxShortTokenPoolAmount: expandDecimals(2_400_000, 6),
    },
    {
      tokens: { indexToken: "ARB", longToken: "ARB", shortToken: "ARB" },
      virtualTokenIdForIndexToken: hashString("PERP:ARB/USD"),

      ...singleTokenMarketConfig,
      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
      maxPnlFactorForTraders: percentageToFloat("90%"),

      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("8.4e-9"),
      positivePositionImpactFactor: exponentToFloat("7e-9"),
      positionImpactExponentFactor: exponentToFloat("2e0"),

      positiveMaxPositionImpactFactor: percentageToFloat("0.5%"),
      negativeMaxPositionImpactFactor: percentageToFloat("0.5%"),
      maxPositionImpactFactorForLiquidations: bigNumberify(0), // 0%

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("1.48e-8"),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(4_500_000, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(4_500_000, 18), // ~2M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "MNT", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:MNT/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("4.12e-8"),
      positivePositionImpactFactor: exponentToFloat("3.43e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("75%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("70%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(280, 18), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "SPX6900", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:SPX6900/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("1.44e-8"),
      positivePositionImpactFactor: exponentToFloat("1.2e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("7.41e-8"),

      reserveFactor: percentageToFloat("65%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("60%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(250_000),
      maxPoolUsdForDeposit: decimalToFloat(375_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(140, 18), // ~500k USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(500_000, 6), // ~500k USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "ALGO", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:ALGO/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("1.47e-8"),
      positivePositionImpactFactor: exponentToFloat("1.22e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("75%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("70%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(8, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "HBAR", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:HBAR/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("7.4e-8"),
      positivePositionImpactFactor: exponentToFloat("6.16e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("75%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("70%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(8, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "CRO", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:CRO/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("2.42e-8"),
      positivePositionImpactFactor: exponentToFloat("2.01e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("105%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("100%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(8, 8), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "CVX", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:CVX/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("8.45e-8"),
      positivePositionImpactFactor: exponentToFloat("7.04e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("7.41e-8"),

      reserveFactor: percentageToFloat("65%"),
      openInterestReserveFactor: percentageToFloat("60%"),
      maxPnlFactorForTraders: percentageToFloat("50%"),

      maxOpenInterest: decimalToFloat(250_000),
      maxPoolUsdForDeposit: decimalToFloat(375_000), // 1.5x max open interest

      maxLongTokenPoolAmount: expandDecimals(120, 18), // ~500K USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(500_000, 6), // ~500K USD (2x max open interest)
    },
    {
      tokens: { indexToken: "KAS", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:KAS/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("2.08e-8"),
      positivePositionImpactFactor: exponentToFloat("1.73e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("75%"),
      openInterestReserveFactor: percentageToFloat("70%"),
      maxPnlFactorForTraders: percentageToFloat("90%"),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x max open interest

      maxLongTokenPoolAmount: expandDecimals(9, 8), // ~1M USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x max open interest)
    },
    {
      tokens: { indexToken: "OKB", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:OKB/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5.82e-8"),
      positivePositionImpactFactor: exponentToFloat("4.85e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("75%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("70%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("90%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(240, 18), // ~1M USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x max open interest)
    },
    {
      tokens: { indexToken: "AERO", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AERO/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("2.43e-8"),
      positivePositionImpactFactor: exponentToFloat("2.02e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("7.41e-8"),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
      maxPnlFactorForTraders: percentageToFloat("50%"),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(210, 18),
      maxShortTokenPoolAmount: expandDecimals(900000, 6),
    },
    {
      tokens: { indexToken: "BRETT", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:BRETT/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("2.69e-8"),
      positivePositionImpactFactor: exponentToFloat("2.24e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("7.41e-8"),

      reserveFactor: percentageToFloat("65%"),
      openInterestReserveFactor: percentageToFloat("60%"),
      maxPnlFactorForTraders: percentageToFloat("50%"),

      maxOpenInterest: decimalToFloat(250_000),
      maxPoolUsdForDeposit: decimalToFloat(375_000),

      maxLongTokenPoolAmount: expandDecimals(110, 18), // ~500K USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(500_000, 6), // ~500K USD (2x max open interest)
    },
    {
      tokens: { indexToken: "WIF", longToken: "WBTC.e", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:WIF/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Default,
      ...borrowingRateConfig_LowMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("3.13e-09"),
      positivePositionImpactFactor: exponentToFloat("2.60e-09"),

      negativeSwapImpactFactor: exponentToFloat("3.50e-09"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-09"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.47e-08"),

      reserveFactor: percentageToFloat("95%"),
      openInterestReserveFactor: percentageToFloat("90%"),
      maxPnlFactorForTraders: percentageToFloat("50%"),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(9, 8), // ~1M USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x max open interest)
    },
    {
      tokens: { indexToken: "WLFI", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:WLFI/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("6e-8"),
      positivePositionImpactFactor: exponentToFloat("5e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("1.48e-7"),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxPnlFactorForTraders: percentageToFloat("50%"),

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000),

      maxLongTokenPoolAmount: expandDecimals(460, 18), // ~2m USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2m USD (2x max open interest)
    },
    {
      tokens: { indexToken: "WELL", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:WELL/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("1.75e-7"),
      positivePositionImpactFactor: exponentToFloat("1.45e-7"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
      maxPnlFactorForTraders: percentageToFloat("90%"),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(230, 18), // ~1M USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x max open interest)
    },
    {
      tokens: { indexToken: "VVV", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:VVV/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("1.02e-7"),
      positivePositionImpactFactor: exponentToFloat("8.5e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
      maxPnlFactorForTraders: percentageToFloat("90%"),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(230, 18), // ~1M USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x max open interest)
    },
    {
      tokens: { indexToken: "MORPHO", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:MORPHO/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("4.89e-8"),
      positivePositionImpactFactor: exponentToFloat("4.07e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
      maxPnlFactorForTraders: percentageToFloat("90%"),

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(230, 18), // ~1M USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x max open interest)
    },
    {
      tokens: { indexToken: "LINK", longToken: "WETH", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LINK/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      negativePositionImpactFactor: exponentToFloat("4.1e-11"),
      positivePositionImpactFactor: exponentToFloat("3.4e-11"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("1.39e-9"),

      reserveFactor: percentageToFloat("100%"),
      openInterestReserveFactor: percentageToFloat("95%"),
      maxPnlFactorForTraders: percentageToFloat("90%"),

      maxOpenInterest: decimalToFloat(2_000_000),
      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      maxLongTokenPoolAmount: expandDecimals(915, 18), // ~4M USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(4_000_000, 6), // ~4M USD (2x max open interest)
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

      negativePositionImpactFactor: exponentToFloat("1.5e-10"), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("9e-11"), // 0.05% for ~2,700,000 USD of imbalance

      negativeSwapImpactFactor: exponentToFloat("1e-9"),
      positiveSwapImpactFactor: exponentToFloat("5e-10"),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      maxOpenInterest: decimalToFloat(1_500_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.36e-12"), // 0.00000000000136, at least 3.5 hours to reach max funding
      fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
      maxFundingFactorPerSecond: exponentToFloat("1.7e-8"), // 0.0000017%,  0.14212% per hour, 53.61% per year
      thresholdForDecreaseFunding: decimalToFloat(0), // 0%

      // for OI reserve factor = 100%
      borrowingFactor: decimalToFloat(1900, 11), // 0.000000019 * 100% max reserve, 60% per year

      atomicSwapFeeFactor: percentageToFloat("1.25%"),
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

      negativePositionImpactFactor: exponentToFloat("1.5e-10"), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("9e-11"), // 0.05% for ~2,700,000 USD of imbalance

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      maxOpenInterest: decimalToFloat(3_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.36e-12"), // 0.00000000000136, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("1.7e-8"), // 0.0000017%,  0.14212% per hour, 53.61% per year

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

      negativePositionImpactFactor: exponentToFloat("1.5e-10"), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("9e-11"), // 0.05% for ~2,700,000 USD of imbalance

      negativeSwapImpactFactor: exponentToFloat("1e-9"),
      positiveSwapImpactFactor: exponentToFloat("5e-10"),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.36e-12"), // 0.00000000000136, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("1.7e-8"), // 0.0000017%,  0.14212% per hour, 53.61% per year

      // for OI reserve factor = 100%
      borrowingFactor: decimalToFloat(1900, 11), // 0.000000019 * 100% max reserve, 60% per year

      atomicSwapFeeFactor: percentageToFloat("3%"),
    },
    {
      tokens: { indexToken: "WETH.e", longToken: "WETH.e", shortToken: "WETH.e" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),

      ...singleTokenMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(5_000, 18),
      maxShortTokenPoolAmount: expandDecimals(5_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: exponentToFloat("1.5e-10"), // 0.05% for ~1,600,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("9e-11"), // 0.05% for ~2,700,000 USD of imbalance

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      // minCollateralFactor of 0.01 (1%) when open interest is 50,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      maxOpenInterest: decimalToFloat(3_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.36e-12"), // 0.00000000000136, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("1.7e-8"), // 0.0000017%,  0.14212% per hour, 53.61% per year

      // factor in open interest reserve factor 35%
      borrowingFactor: exponentToFloat("3.6e-8"), // 3.60-8, 40% at 100% utilisation
    },
    {
      tokens: { indexToken: "XRP", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:XRP/USD"),
      virtualMarketId: hashString("SPOT:XRP/USD"),

      ...syntheticMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactor: percentageToFloat("80%"), // 80%,

      openInterestReserveFactor: percentageToFloat("75%"), // 75%,

      negativePositionImpactFactor: exponentToFloat("8e-9"), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("4e-9"), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: exponentToFloat("5e-8"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-8"),

      // minCollateralFactor of 0.01 (1%) when open interest is 5,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-9"),

      maxOpenInterest: decimalToFloat(5_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.6e-12"), // 0.0000000000016, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("2e-8"), // 0.000002%,  0.0072% per hour, 63% per year

      // for OI reserve factor = 75%
      borrowingFactor: exponentToFloat("2.95e-8"), // 0.0000000295 * 75% max reserve, ~70%

      atomicSwapFeeFactor: percentageToFloat("2%"),
    },
    {
      tokens: { indexToken: "DOGE", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:DOGE/USD"),
      virtualMarketId: hashString("SPOT:DOGE/USD"),

      ...syntheticMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactor: percentageToFloat("80%"), // 80%
      openInterestReserveFactor: percentageToFloat("75%"), // 75%,

      negativePositionImpactFactor: exponentToFloat("8e-9"), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("4e-9"), // 0.05% for 125,000 USD of imbalance

      // the swap impact factor is for WAVAX-stablecoin swaps
      negativeSwapImpactFactor: exponentToFloat("5e-8"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-8"),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("5e-9"),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.6e-12"), // 0.0000000000016, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("2e-8"), // 0.000002%,  0.0072% per hour, 63% per year

      // for OI reserve factor = 75%
      borrowingFactor: exponentToFloat("2.95e-8"), // 0.0000000295 * 75% max reserve, ~70%

      atomicSwapFeeFactor: percentageToFloat("2%"),
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

      negativePositionImpactFactor: exponentToFloat("1e-8"), // 0.05% for 50,000 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("5e-9"), // 0.05% for 100,000 USD of imbalance

      negativeSwapImpactFactor: exponentToFloat("5e-8"),
      positiveSwapImpactFactor: exponentToFloat("2.5e-8"),

      // minCollateralFactor of 0.01 (1%) when open interest is 2,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("5e-9"),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.6e-12"), // 0.0000000000016, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("2e-8"), // 0.000002%,  0.0072% per hour, 63% per year

      // for OI reserve factor = 100%
      borrowingFactor: exponentToFloat("2.22e-8"), // 0.0000000222 * 100% max reserve, 70% per year

      atomicSwapFeeFactor: percentageToFloat("2%"),
    },
    {
      tokens: { indexToken: "LTC", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:LTC/USD"),
      virtualMarketId: hashString("SPOT:LTC/USD"),

      ...syntheticMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(75_000, 18),
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(1_000_000),

      reserveFactor: percentageToFloat("80%"), // 80%,
      openInterestReserveFactor: percentageToFloat("75%"), // 75%,

      negativePositionImpactFactor: exponentToFloat("8e-9"), // 0.05% for 62,500 USD of imbalance
      positivePositionImpactFactor: exponentToFloat("4e-9"), // 0.05% for 125,000 USD of imbalance

      negativeSwapImpactFactor: exponentToFloat("1e-7"),
      positiveSwapImpactFactor: exponentToFloat("5e-8"),

      // minCollateralFactor of 0.01 (1%) when open interest is 4,000,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.6e-12"), // 0.0000000000016, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("2e-8"), // 0.000002%,  0.0072% per hour, 63% per year

      // for OI reserve factor = 75%
      borrowingFactor: exponentToFloat("2.95e-8"), // 0.0000000295 * 75% max reserve, ~70%

      atomicSwapFeeFactor: percentageToFloat("2%"),
    },
    {
      tokens: { indexToken: "TRUMP", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:TRUMP/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-7"),
      positivePositionImpactFactor: exponentToFloat("2.5e-7"),
      positionImpactExponentFactor: exponentToFloat("1.7e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("40%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("35%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(1_000_000),
      maxPoolUsdForDeposit: decimalToFloat(1_500_000),

      maxLongTokenPoolAmount: expandDecimals(60_000, 18), // ~2M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(2_000_000, 6), // ~2M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2%"),
    },
    {
      tokens: { indexToken: "MELANIA", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:MELANIA/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("5e-7"),
      positivePositionImpactFactor: exponentToFloat("2.5e-7"),
      positionImpactExponentFactor: exponentToFloat("1.7e0"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-10"),

      reserveFactor: percentageToFloat("40%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("35%"), // default is 90%

      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000),

      maxLongTokenPoolAmount: expandDecimals(30_000, 18), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)

      atomicSwapFeeFactor: percentageToFloat("2%"),
    },
    {
      tokens: { indexToken: "PUMP", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:PUMP/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("6e-8"),
      positivePositionImpactFactor: exponentToFloat("5e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("8.89e-8"),

      reserveFactor: percentageToFloat("55%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("50%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(250_000),
      maxPoolUsdForDeposit: decimalToFloat(375_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(22_000, 18), // ~500k USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(500_000, 6), // ~500k USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "WLFI", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:WLFI/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      negativePositionImpactFactor: exponentToFloat("6e-8"),
      positivePositionImpactFactor: exponentToFloat("5e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("1.48e-7"),

      reserveFactor: percentageToFloat("35%"),
      openInterestReserveFactor: percentageToFloat("30%"),

      maxPnlFactorForTraders: percentageToFloat("50%"),

      maxOpenInterest: decimalToFloat(250_000),
      maxPoolUsdForDeposit: decimalToFloat(375_000),

      maxLongTokenPoolAmount: expandDecimals(22_000, 18), // ~500K USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(500_000, 6), // ~500K USD (2x max open interest)
    },
    {
      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "USDC" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),
      virtualMarketId: hashString("SPOT:AVAX/USD"),

      ...baseMarketConfig,

      reserveFactor: percentageToFloat("155%"),
      openInterestReserveFactor: percentageToFloat("150%"),

      maxLongTokenPoolAmount: expandDecimals(775_000, 18),
      maxShortTokenPoolAmount: expandDecimals(14_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(13_000_000),

      negativePositionImpactFactor: exponentToFloat("5e-9"),
      positivePositionImpactFactor: exponentToFloat("2.5e-9"),

      negativeSwapImpactFactor: exponentToFloat("2.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.25e-9"),

      // minCollateralFactor of 0.00833 (0.833%) when open interest is 3,300,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.5e-9"),

      positionImpactPoolDistributionRate: expandDecimals(166, 43), // ~143 AVAX/day
      minPositionImpactPoolAmount: expandDecimals(141, 18),

      maxOpenInterest: decimalToFloat(8_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.6e-12"), // 0.0000000000016, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("2e-8"), // 0.000002%,  0.0072% per hour, 63% per year

      // for OI reserve factor = 150%
      borrowingFactor: exponentToFloat("2e-8"), // 0.00000002 * 150% max reserve, 94.6% per year

      atomicSwapFeeFactor: percentageToFloat("2%"),
    },
    {
      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "WAVAX" },
      virtualTokenIdForIndexToken: hashString("PERP:AVAX/USD"),

      ...singleTokenMarketConfig,

      maxLongTokenPoolAmount: expandDecimals(300_000, 18),
      maxShortTokenPoolAmount: expandDecimals(300_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      negativePositionImpactFactor: exponentToFloat("5e-9"),
      positivePositionImpactFactor: exponentToFloat("2.5e-9"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      // minCollateralFactor of 0.01 (1%) when open interest is 500,000 USD
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2e-8"),

      maxOpenInterest: decimalToFloat(1_000_000),

      fundingIncreaseFactorPerSecond: exponentToFloat("1.6e-12"), // 0.0000000000016, at least 3.5 hours to reach max funding
      maxFundingFactorPerSecond: exponentToFloat("2e-8"), // 0.000002%,  0.0072% per hour, 63% per year

      // factor in open interest reserve factor 35%
      borrowingFactor: exponentToFloat("3.6e-8"), // 3.60-8, 40% at 100% utilisation
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      swapOnly: true,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      atomicSwapFeeFactor: percentageToFloat("0.5%"),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDC.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      swapOnly: true,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      atomicSwapFeeFactor: percentageToFloat("0.5%"),
    },
    {
      tokens: { longToken: "USDT", shortToken: "USDT.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      swapOnly: true,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      atomicSwapFeeFactor: percentageToFloat("0.5%"),
    },
    {
      tokens: { longToken: "USDC", shortToken: "DAI.e" },

      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,

      swapOnly: true,

      maxLongTokenPoolAmount: expandDecimals(10_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(10_000_000, 18),

      maxPoolUsdForDeposit: decimalToFloat(10_000_000),

      atomicSwapFeeFactor: percentageToFloat("0.5%"),
    },
  ],
  arbitrumSepolia: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC.SG" },
      virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      reserveFactor: percentageToFloat("275%"),
      openInterestReserveFactor: percentageToFloat("270%"),

      maxLongTokenPoolAmount: expandDecimals(32_000, 18),
      maxShortTokenPoolAmount: expandDecimals(100_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(50_000_000),

      negativePositionImpactFactor: exponentToFloat("5e-7"), // 0.0000005
      positivePositionImpactFactor: exponentToFloat("4.5e-7"), // 0.00000045

      minPositionImpactPoolAmount: expandDecimals(10, 18), // 10 ETH

      negativeSwapImpactFactor: exponentToFloat("3e-10"),
      positiveSwapImpactFactor: exponentToFloat("2e-10"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.25%"), // 200x leverage

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(70_000_000),

      atomicSwapFeeFactor: percentageToFloat("2.25%"),

      maxLendableImpactFactor: exponentToFloat("2e-3"), // 0.002
      maxLendableImpactFactorForWithdrawals: exponentToFloat("2e-3"), // 0.002
      maxLendableImpactUsd: decimalToFloat(25), // $25
    },
    {
      tokens: { indexToken: "CRV", longToken: "WETH", shortToken: "USDC.SG" },
      virtualTokenIdForIndexToken: hashString("PERP:CRV/USD"),
      virtualMarketId: hashString("SPOT:ETH/USD"),

      ...syntheticMarketConfig,
      ...fundingRateConfig_High,
      ...borrowingRateConfig_HighMax_WithHigherBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("1.4e-8"),
      positivePositionImpactFactor: exponentToFloat("1.2e-8"),

      negativeSwapImpactFactor: exponentToFloat("3.5e-9"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-9"),

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("3.7e-8"),

      reserveFactor: percentageToFloat("65%"), // default is 95%
      openInterestReserveFactor: percentageToFloat("60%"), // default is 90%
      maxPnlFactorForTraders: percentageToFloat("50%"), // default is 60%

      maxOpenInterest: decimalToFloat(500_000),
      maxPoolUsdForDeposit: decimalToFloat(750_000), // 1.5x the max open interest

      maxLongTokenPoolAmount: expandDecimals(400, 18), // ~1M USD (2x the max open interest)
      maxShortTokenPoolAmount: expandDecimals(1_000_000, 6), // ~1M USD (2x the max open interest)
    },
    {
      tokens: { indexToken: "BTC", longToken: "BTC", shortToken: "USDC.SG" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      reserveFactor: percentageToFloat("245%"),
      openInterestReserveFactor: percentageToFloat("240%"),

      maxLongTokenPoolAmount: expandDecimals(2200, 8),
      maxShortTokenPoolAmount: expandDecimals(110_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(60_000_000),

      negativePositionImpactFactor: exponentToFloat("9e-11"),
      positivePositionImpactFactor: exponentToFloat("3e-11"),

      minPositionImpactPoolAmount: expandDecimals(95, 6), // 0.95 BTC

      negativeSwapImpactFactor: exponentToFloat("4e-10"), // 0.05% for 1,250,000 USD of imbalance
      positiveSwapImpactFactor: exponentToFloat("2e-10"), // 0.05% for 2,500,000 USD of imbalance

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("6e-11"),

      maxOpenInterest: decimalToFloat(60_000_000),

      atomicSwapFeeFactor: percentageToFloat("0.75%"),
    },
  ],
  arbitrumGoerli: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      fundingIncreaseFactorPerSecond: decimalToFloat(1, 11), // 0.000000001% per second,  0,0000036% per hour
      fundingDecreaseFactorPerSecond: decimalToFloat(5, 12), // 0.0000000005% per second, 0.0000018% per hour
      minFundingFactorPerSecond: exponentToFloat("1e-9"), // 0,0000001% per second, 0.00036% per.hour
      maxFundingFactorPerSecond: exponentToFloat("3e-8"), // 0,000003% per second,  0,0108% per hour

      thresholdForStableFunding: percentageToFloat("5%"), // 5%
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

      negativePositionImpactFactor: exponentToFloat("1e-9"),
      positivePositionImpactFactor: exponentToFloat("5e-10"),
      negativeSwapImpactFactor: exponentToFloat("1e-7"),
      positiveSwapImpactFactor: exponentToFloat("5e-8"),
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "DAI" },

      negativePositionImpactFactor: exponentToFloat("1e-9"),
      positivePositionImpactFactor: exponentToFloat("5e-10"),
      negativeSwapImpactFactor: exponentToFloat("1e-7"),
      positiveSwapImpactFactor: exponentToFloat("5e-8"),
    },
    {
      tokens: { indexToken: "SOL", longToken: "WBTC", shortToken: "USDC" },
      isDisabled: false,

      negativePositionImpactFactor: exponentToFloat("1e-9"),
      positivePositionImpactFactor: exponentToFloat("5e-10"),
      negativeSwapImpactFactor: exponentToFloat("1e-7"),
      positiveSwapImpactFactor: exponentToFloat("5e-8"),
    },
    {
      tokens: { longToken: "USDC", shortToken: "USDT" },
      swapOnly: true,

      negativeSwapImpactFactor: exponentToFloat("2e-8"),
      positiveSwapImpactFactor: exponentToFloat("1e-8"),
    },
    {
      tokens: {
        indexToken: "DOGE",
        longToken: "WBTC",
        shortToken: "DAI",
      },
      positionImpactPoolDistributionRate: expandDecimals(1, 38), // 1 DOGE / second
      minPositionImpactPoolAmount: expandDecimals(8000, 8), // 8000 DOGE

      negativePositionImpactFactor: exponentToFloat("1e-9"),
      positivePositionImpactFactor: exponentToFloat("5e-10"),
      negativeSwapImpactFactor: exponentToFloat("1e-7"),
      positiveSwapImpactFactor: exponentToFloat("5e-8"),
    },
    {
      tokens: { indexToken: "LINK", longToken: "WBTC", shortToken: "DAI" },

      negativePositionImpactFactor: exponentToFloat("1e-9"),
      positivePositionImpactFactor: exponentToFloat("5e-10"),
      negativeSwapImpactFactor: exponentToFloat("1e-7"),
      positiveSwapImpactFactor: exponentToFloat("5e-8"),
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
      positionImpactExponentFactor: exponentToFloat("2e0"), // 2
      negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001 %
      positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005 %
      swapImpactExponentFactor: exponentToFloat("2e0"), // 2

      maxPnlFactorForAdl: decimalToFloat(2, 2), // 2%

      minPnlFactorAfterAdl: percentageToFloat("1%"), // 1%

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
  botanix: [
    {
      tokens: { indexToken: "BTC", longToken: "pBTC", shortToken: "pBTC" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),

      ...singleTokenMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("3e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),
      maxPnlFactorForTraders: percentageToFloat("90%"),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.78e-9"),

      maxOpenInterest: decimalToFloat(2_000_000),
      maxPoolUsdForDeposit: decimalToFloat(3_000_000), // 1.5x max open interest

      maxLongTokenPoolAmount: expandDecimals(36, 18), // ~4M USD (2x max open interest)
      maxShortTokenPoolAmount: expandDecimals(36, 18), // ~4M USD (2x max open interest)
    },
    {
      tokens: { indexToken: "BTC", longToken: "stBTC", shortToken: "stBTC" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),

      ...singleTokenMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      reserveFactor: percentageToFloat("105%"),
      openInterestReserveFactor: percentageToFloat("100%"),

      maxLongTokenPoolAmount: expandDecimals(50, 18),
      maxShortTokenPoolAmount: expandDecimals(50, 18),

      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("3e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.78e-9"),

      maxOpenInterest: decimalToFloat(2_000_000),
    },
    {
      tokens: { indexToken: "BTC", longToken: "stBTC", shortToken: "USDC.e" },
      virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),
      virtualMarketId: hashString("SPOT:BTC/USD"),

      ...baseMarketConfig,
      ...fundingRateConfig_Low,
      ...borrowingRateConfig_LowMax_WithLowerBase,

      reserveFactor: percentageToFloat("135%"),
      openInterestReserveFactor: percentageToFloat("130%"),

      maxLongTokenPoolAmount: expandDecimals(50, 18),
      maxShortTokenPoolAmount: expandDecimals(5_000_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(3_000_000),

      positionImpactExponentFactor: exponentToFloat("2e0"),
      negativePositionImpactFactor: exponentToFloat("3e-10"),
      positivePositionImpactFactor: exponentToFloat("2.5e-10"),

      swapImpactExponentFactor: exponentToFloat("2e0"),
      negativeSwapImpactFactor: exponentToFloat("3.5e-09"),
      positiveSwapImpactFactor: exponentToFloat("1.75e-09"),

      positionImpactPoolDistributionRate: bigNumberify(0),
      minPositionImpactPoolAmount: bigNumberify(0),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      minCollateralFactorForOpenInterestMultiplier: exponentToFloat("2.14e-9"),

      maxOpenInterest: decimalToFloat(2_000_000),
    },
  ],
  avalancheFuji: [
    {
      ...baseMarketConfig,

      tokens: { indexToken: "WAVAX", longToken: "WAVAX", shortToken: "USDC" },
      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      positionImpactPoolDistributionRate: expandDecimals(3, 11), // ~0.026 ETH per day
      minPositionImpactPoolAmount: expandDecimals(1, 16), // 0.01 ETH

      openInterestReserveFactor: decimalToFloat(7, 1), // 70%,

      maxOpenInterestForLongs: decimalToFloat(55_000),
      maxOpenInterestForShorts: decimalToFloat(40_000),

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "DAI" },
      virtualMarketId: hashString("SPOT:AVAX/USD"),
      virtualTokenIdForIndexToken: "0x275d2a6e341e6a078d4eee59b08907d1e50825031c5481f9551284f4b7ee2fb9",

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
      virtualTokenIdForIndexToken: "0x275d2a6e341e6a078d4eee59b08907d1e50825031c5481f9551284f4b7ee2fb9",

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "USDC" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",
      virtualTokenIdForIndexToken: "0x04533137e2e8ae1c11111111a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "DAI" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...singleTokenMarketConfig,
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "WBTC" },
      virtualMarketId: "0x11111137e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481f",

      negativeSwapImpactFactor: 0,
      positiveSwapImpactFactor: 0,

      maxOpenInterest: decimalToFloat(250_000),

      minCollateralFactor: percentageToFloat("0.5%"), // 200x leverage
      minCollateralFactorForLiquidation: percentageToFloat("0.5%"), // 200x leverage
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "SOL", longToken: "WETH", shortToken: "USDC" },
      virtualMarketId: "0x04533437e2e8ae1c70c421e7a0dd36e023e0d6217198f889f9eb9c2a6727481d",

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...stablecoinSwapMarketConfig,
      tokens: { longToken: "USDC", shortToken: "USDT" },
      swapOnly: true,

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "DOGE", longToken: "WETH", shortToken: "DAI" },
      positionImpactPoolDistributionRate: expandDecimals(12, 33), // ~10 DOGE per day
      minPositionImpactPoolAmount: expandDecimals(1, 8),

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "LINK", longToken: "WETH", shortToken: "DAI" },
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "BNB", longToken: "WETH", shortToken: "DAI" },
      negativeMaxPositionImpactFactor: decimalToFloat(1, 5), // 0.001%
      positiveMaxPositionImpactFactor: decimalToFloat(1, 5), // 0.001%
      maxPositionImpactFactorForLiquidations: decimalToFloat(5, 4), // 0.05%
      minCollateralFactorForOpenInterestMultiplier: decimalToFloat(15, 7),

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "ADA", longToken: "WETH", shortToken: "DAI" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "TRX", longToken: "WETH", shortToken: "DAI" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "MATIC", longToken: "WETH", shortToken: "USDC" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "DOT", longToken: "WETH", shortToken: "USDC" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "UNI", longToken: "WETH", shortToken: "USDC" },

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: {
        indexToken: "TEST",
        longToken: "WETH",
        shortToken: "USDC",
      },
      negativePositionImpactFactor: decimalToFloat(25, 6), // 0.0025 %
      positivePositionImpactFactor: decimalToFloat(125, 7), // 0.00125 %
      positionImpactExponentFactor: exponentToFloat("2e0"), // 2
      negativeSwapImpactFactor: decimalToFloat(1, 5), // 0.001 %
      positiveSwapImpactFactor: decimalToFloat(5, 6), // 0.0005 %
      swapImpactExponentFactor: exponentToFloat("2e0"), // 2

      maxPnlFactorForAdl: decimalToFloat(2, 2), // 2%
      minPnlFactorAfterAdl: percentageToFloat("1%"), // 1%

      maxLongTokenPoolAmount: expandDecimals(10, 18),
      maxShortTokenPoolAmount: expandDecimals(300_000, 6),

      maxPoolUsdForDeposit: decimalToFloat(300_000),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },

    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDT" },

      borrowingFactor: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
    {
      ...baseMarketConfig,
      ...syntheticMarketConfig,
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "DAI" },

      borrowingFactor: decimalToFloat(3, 7), // 0.0000003, 0.00003% / second, 946% per year if the pool is 100% utilized

      fundingFactor: decimalToFloat(16, 7), // ~5000% per year for a 100% skew

      negativeSwapImpactFactor: percentageToFloat("0.000001%"),
      positiveSwapImpactFactor: percentageToFloat("0.0000005%"),
      liquidationFeeFactor: percentageToFloat("0.20%"),
    },
  ],
  hardhat: [
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
    },
    {
      tokens: { indexToken: "GMX", longToken: "GMX", shortToken: "USDC" },
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
      tokens: { indexToken: "GMX", longToken: "GMX", shortToken: "USDC" },
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
