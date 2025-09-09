import fetch from "node-fetch";
import { ConfigChangeItem, handleConfigChanges } from "./updateConfigUtils";
import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";
import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import { validateMarketConfigs } from "./validateMarketConfigsUtils";

const RISK_ORACLE_MANAGED_BASE_KEYS = [
  keys.MAX_OPEN_INTEREST,
  keys.POSITION_IMPACT_FACTOR,
  keys.POSITION_IMPACT_EXPONENT_FACTOR,
];

const RISK_ORACLE_SUPPORTED_NETWORKS = ["arbitrum", "avalanche", "avalancheFuji"];

function getRiskOracleManagedBaseKeys() {
  if (RISK_ORACLE_SUPPORTED_NETWORKS.includes(hre.network.name)) {
    return RISK_ORACLE_MANAGED_BASE_KEYS;
  }
  return [];
}

const KEEPER_MANAGED_BASE_KEYS_ARBITRUM = [
  keys.MAX_FUNDING_FACTOR_PER_SECOND,
  keys.FUNDING_INCREASE_FACTOR_PER_SECOND,
  keys.FUNDING_DECREASE_FACTOR_PER_SECOND,
];

function getKeeperManagedBaseKeys() {
  if (hre.network.name === "arbitrum") {
    return KEEPER_MANAGED_BASE_KEYS_ARBITRUM;
  }

  return [];
}

const processMarkets = async ({
  markets,
  includeMarket,
  onchainMarketsByTokens,
  supportedRiskOracleMarkets,
  tokens,
  generalConfig,
  includeRiskOracleBaseKeys,
  includeKeeperBaseKeys,
  includeMaxOpenInterest,
  includePositionImpact,
  includeFunding,
}): Promise<[ConfigChangeItem[], string[], string[]]> => {
  const configItems: ConfigChangeItem[] = [];
  const ignoredRiskOracleParams: string[] = [];
  const ignoredKeeperParams: string[] = [];

  const shouldIgnoreBaseKey = (
    baseKey: string,
    isSupportedByRiskOracle: boolean
  ): [true, "riskOracle" | "keeper"] | [false] => {
    if (baseKey === keys.MAX_OPEN_INTEREST && includeMaxOpenInterest) {
      return [false];
    }

    if (
      [keys.POSITION_IMPACT_FACTOR, keys.POSITION_IMPACT_EXPONENT_FACTOR].includes(baseKey) &&
      includePositionImpact
    ) {
      return [false];
    }

    if (
      [
        keys.MAX_FUNDING_FACTOR_PER_SECOND,
        keys.FUNDING_INCREASE_FACTOR_PER_SECOND,
        keys.FUNDING_DECREASE_FACTOR_PER_SECOND,
      ].includes(baseKey) &&
      includeFunding
    ) {
      return [false];
    }

    if (getRiskOracleManagedBaseKeys().includes(baseKey) && isSupportedByRiskOracle && !includeRiskOracleBaseKeys) {
      return [true, "riskOracle"];
    }

    if (getKeeperManagedBaseKeys().includes(baseKey) && !includeKeeperBaseKeys) {
      return [true, "keeper"];
    }

    return [false];
  };

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];

    if (!onchainMarket) {
      console.info("WARN: market %s:%s:%s:%s does not exist. skip", marketKey, indexToken, longToken, shortToken);
      continue;
    }

    const marketToken = onchainMarket.marketToken;
    if (includeMarket && marketToken !== includeMarket) {
      continue;
    }

    const marketLabel = `${marketConfig.tokens.indexToken ?? "SPOT-ONLY"} [${marketConfig.tokens.longToken}-${
      marketConfig.tokens.shortToken
    }]`;

    const addConfigItem = (type: string, baseKey: string, keyData: string, value: any, label: string) => {
      if (!value) {
        return;
      }
      const [skip, skipReason] = shouldIgnoreBaseKey(baseKey, supportedRiskOracleMarkets.has(marketConfig));

      if (skip) {
        if (skipReason === "riskOracle") {
          ignoredRiskOracleParams.push(label);
        } else if (skipReason === "keeper") {
          ignoredKeeperParams.push(label);
        }
      } else {
        configItems.push({
          type,
          baseKey,
          keyData,
          value,
          label,
        });
      }
    };

    addConfigItem(
      "uint",
      keys.MAX_POOL_AMOUNT,
      encodeData(["address", "address"], [marketToken, longToken]),
      marketConfig.maxLongTokenPoolAmount,
      `maxLongTokenPoolAmount ${marketLabel} (${marketToken}), ${longToken}`
    );

    addConfigItem(
      "uint",
      keys.MAX_POOL_AMOUNT,
      encodeData(["address", "address"], [marketToken, shortToken]),
      marketConfig.maxShortTokenPoolAmount,
      `maxShortTokenPoolAmount ${marketLabel} (${marketToken}), ${shortToken}`
    );

    addConfigItem(
      "uint",
      keys.MAX_POOL_USD_FOR_DEPOSIT,
      encodeData(["address", "address"], [marketToken, longToken]),
      marketConfig.maxLongTokenPoolUsdForDeposit,
      `maxLongTokenPoolUsdForDeposit ${marketLabel} (${marketToken}), ${longToken}`
    );

    addConfigItem(
      "uint",
      keys.MAX_POOL_USD_FOR_DEPOSIT,
      encodeData(["address", "address"], [marketToken, shortToken]),
      marketConfig.maxShortTokenPoolUsdForDeposit,
      `maxShortTokenPoolUsdForDeposit ${marketLabel} (${marketToken}), ${shortToken}`
    );

    addConfigItem(
      "uint",
      keys.SWAP_IMPACT_EXPONENT_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.swapImpactExponentFactor,
      `swapImpactExponentFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.SWAP_FEE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.swapFeeFactorForPositiveImpact,
      `swapFeeFactorForPositiveImpact ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.SWAP_FEE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.swapFeeFactorForNegativeImpact,
      `swapFeeFactorForNegativeImpact ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.DEPOSIT_FEE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.depositFeeFactorForPositiveImpact ?? marketConfig.swapFeeFactorForPositiveImpact,
      `depositFeeFactorForPositiveImpact ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.DEPOSIT_FEE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.depositFeeFactorForNegativeImpact ?? marketConfig.swapFeeFactorForNegativeImpact,
      `depositFeeFactorForNegativeImpact ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.WITHDRAWAL_FEE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.withdrawalFeeFactorForPositiveImpact ?? marketConfig.swapFeeFactorForPositiveImpact,
      `withdrawalFeeFactorForPositiveImpact ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.WITHDRAWAL_FEE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.withdrawalFeeFactorForNegativeImpact ?? marketConfig.swapFeeFactorForNegativeImpact,
      `withdrawalFeeFactorForNegativeImpact ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.ATOMIC_SWAP_FEE_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.atomicSwapFeeFactor,
      `atomicSwapFeeFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.ATOMIC_WITHDRAWAL_FEE_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.atomicWithdrawalFeeFactor,
      `atomicWithdrawalFeeFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.SWAP_IMPACT_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.positiveSwapImpactFactor,
      `positiveSwapImpactFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.SWAP_IMPACT_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.negativeSwapImpactFactor,
      `negativeSwapImpactFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.TOKEN_TRANSFER_GAS_LIMIT,
      encodeData(["address"], [marketToken]),
      generalConfig.tokenTransferGasLimit,
      `tokenTransferGasLimit ${marketLabel} (${marketToken})`
    );

    // the rest of the params are not used for swap-only markets
    if (marketConfig.swapOnly) {
      continue;
    }

    addConfigItem(
      "uint",
      keys.MIN_COLLATERAL_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.minCollateralFactor,
      `minCollateralFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION,
      encodeData(["address"], [marketToken]),
      marketConfig.minCollateralFactorForLiquidation,
      `minCollateralFactorForLiquidation ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.minCollateralFactorForOpenInterestMultiplierLong,
      `minCollateralFactorForOpenInterestMultiplierLong ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.minCollateralFactorForOpenInterestMultiplierShort,
      `minCollateralFactorForOpenInterestMultiplierShort ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_OPEN_INTEREST,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.maxOpenInterestForLongs,
      `maxOpenInterestForLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_OPEN_INTEREST,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.maxOpenInterestForShorts,
      `maxOpenInterestForShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.RESERVE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.reserveFactorLongs,
      `reserveFactorLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.RESERVE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.reserveFactorShorts,
      `reserveFactorShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.openInterestReserveFactorLongs,
      `openInterestReserveFactorLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.openInterestReserveFactorShorts,
      `openInterestReserveFactorShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_TRADERS, marketToken, true]),
      marketConfig.maxPnlFactorForTradersLongs,
      `maxPnlFactorForTradersLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_TRADERS, marketToken, false]),
      marketConfig.maxPnlFactorForTradersShorts,
      `maxPnlFactorForTradersShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_ADL, marketToken, true]),
      marketConfig.maxPnlFactorForAdlLongs,
      `maxPnlFactorForAdlLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_ADL, marketToken, false]),
      marketConfig.maxPnlFactorForAdlShorts,
      `maxPnlFactorForAdlShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MIN_PNL_FACTOR_AFTER_ADL,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.minPnlFactorAfterAdlLongs,
      `minPnlFactorAfterAdlLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MIN_PNL_FACTOR_AFTER_ADL,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.minPnlFactorAfterAdlShorts,
      `minPnlFactorAfterAdlShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_DEPOSITS, marketToken, true]),
      marketConfig.maxPnlFactorForDepositsLongs,
      `maxPnlFactorForDepositsLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_DEPOSITS, marketToken, false]),
      marketConfig.maxPnlFactorForDepositsShorts,
      `maxPnlFactorForDepositsShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketToken, true]),
      marketConfig.maxPnlFactorForWithdrawalsLongs,
      `maxPnlFactorForWithdrawalsLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketToken, false]),
      marketConfig.maxPnlFactorForWithdrawalsShorts,
      `maxPnlFactorForWithdrawalsShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.POSITION_IMPACT_EXPONENT_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.positionImpactExponentFactor,
      `positionImpactExponentFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.FUNDING_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.fundingFactor,
      `fundingFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.FUNDING_EXPONENT_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.fundingExponentFactor,
      `fundingFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.FUNDING_INCREASE_FACTOR_PER_SECOND,
      encodeData(["address"], [marketToken]),
      marketConfig.fundingIncreaseFactorPerSecond,
      `fundingIncreaseFactorPerSecond ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.FUNDING_DECREASE_FACTOR_PER_SECOND,
      encodeData(["address"], [marketToken]),
      marketConfig.fundingDecreaseFactorPerSecond,
      `fundingDecreaseFactorPerSecond ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_FUNDING_FACTOR_PER_SECOND,
      encodeData(["address"], [marketToken]),
      marketConfig.maxFundingFactorPerSecond,
      `maxFundingFactorPerSecond ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MIN_FUNDING_FACTOR_PER_SECOND,
      encodeData(["address"], [marketToken]),
      marketConfig.minFundingFactorPerSecond,
      `minFundingFactorPerSecond ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.THRESHOLD_FOR_STABLE_FUNDING,
      encodeData(["address"], [marketToken]),
      marketConfig.thresholdForStableFunding,
      `thresholdForStableFunding ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.THRESHOLD_FOR_DECREASE_FUNDING,
      encodeData(["address"], [marketToken]),
      marketConfig.thresholdForDecreaseFunding,
      `thresholdForDecreaseFunding ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.LIQUIDATION_FEE_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.liquidationFeeFactor,
      `liquidationFeeFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.POSITION_FEE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.positionFeeFactorForPositiveImpact,
      `positionFeeFactorForPositiveImpact ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.POSITION_FEE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.positionFeeFactorForNegativeImpact,
      `positionFeeFactorForNegativeImpact ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.OPTIMAL_USAGE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.optimalUsageFactorForLongs,
      `optimalUsageFactorForLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.OPTIMAL_USAGE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.optimalUsageFactorForShorts,
      `optimalUsageFactorForShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.BASE_BORROWING_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.baseBorrowingFactorForLongs,
      `baseBorrowingFactorForLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.BASE_BORROWING_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.baseBorrowingFactorForShorts,
      `baseBorrowingFactorForShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.aboveOptimalUsageBorrowingFactorForLongs,
      `aboveOptimalUsageBorrowingFactorForLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.aboveOptimalUsageBorrowingFactorForShorts,
      `aboveOptimalUsageBorrowingFactorForShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.BORROWING_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.borrowingFactorForLongs,
      `borrowingFactorForLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.BORROWING_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.borrowingFactorForShorts,
      `borrowingFactorForShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.BORROWING_EXPONENT_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.borrowingExponentFactorForLongs,
      `borrowingExponentFactorForLongs ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.BORROWING_EXPONENT_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.borrowingExponentFactorForShorts,
      `borrowingExponentFactorForShorts ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.POSITION_IMPACT_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.positivePositionImpactFactor,
      `positivePositionImpactFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.POSITION_IMPACT_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.negativePositionImpactFactor,
      `negativePositionImpactFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS,
      encodeData(["address"], [marketToken]),
      marketConfig.maxPositionImpactFactorForLiquidations,
      `maxPositionImpactFactorForLiquidations ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_POSITION_IMPACT_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.positiveMaxPositionImpactFactor,
      `positiveMaxPositionImpactFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_POSITION_IMPACT_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.negativeMaxPositionImpactFactor,
      `negativeMaxPositionImpactFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_LENDABLE_IMPACT_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.maxLendableImpactFactor,
      `maxLendableImpactFactor ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS,
      encodeData(["address"], [marketToken]),
      marketConfig.maxLendableImpactFactorForWithdrawals,
      `maxLendableImpactFactorForWithdrawals ${marketLabel} (${marketToken})`
    );

    addConfigItem(
      "uint",
      keys.MAX_LENDABLE_IMPACT_USD,
      encodeData(["address"], [marketToken]),
      marketConfig.maxLendableImpactUsd,
      `maxLendableImpactUsd ${marketLabel} (${marketToken})`
    );
  }

  return [configItems, ignoredRiskOracleParams, ignoredKeeperParams];
};

export async function updateMarketConfig({
  write = false,
  market = undefined,
  includeRiskOracleBaseKeys = false,
  includeKeeperBaseKeys = false,
  includeFunding = false,
  includePositionImpact = false,
  includeMaxOpenInterest = false,
}) {
  if (!["arbitrumGoerli", "avalancheFuji", "hardhat"].includes(hre.network.name)) {
    const { errors } = await validateMarketConfigs();
    if (errors.length !== 0) {
      throw new Error("Invalid market configs");
    }
  }

  const { read } = hre.deployments;

  const generalConfig = await hre.gmx.getGeneral();
  const tokens = await hre.gmx.getTokens();
  const markets = await hre.gmx.getMarkets();

  const dataStore = await hre.ethers.getContract("DataStore");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);
  const supportedRiskOracleMarkets = await getSupportedRiskOracleMarkets(markets, tokens, onchainMarketsByTokens);

  const [configItems, ignoredRiskOracleParams, ignoredKeeperParams] = await processMarkets({
    markets,
    includeMarket: market,
    onchainMarketsByTokens,
    tokens,
    supportedRiskOracleMarkets,
    generalConfig,
    includeRiskOracleBaseKeys,
    includeKeeperBaseKeys,
    includeMaxOpenInterest,
    includePositionImpact,
    includeFunding,
  });

  if (ignoredRiskOracleParams.length > 0) {
    const ignoredParameterNames = getIgnoredParameterNames(ignoredRiskOracleParams);

    console.info("\n=================\n");
    console.info(`WARN: Ignored risk oracle params for ${supportedRiskOracleMarkets.size} markets`);
    console.info(`Ignored params: ${ignoredParameterNames.join(",")}`);
    console.info("Add INCLUDE_RISK_ORACLE_BASE_KEYS=true to include them\n");
  }

  if (ignoredKeeperParams.length > 0) {
    const ignoredParameterNames = getIgnoredParameterNames(ignoredKeeperParams);

    console.info("\n=================\n");
    console.info(`Ignored params: ${ignoredParameterNames.join(",")}`);
    console.info("Add INCLUDE_KEEPER_BASE_KEYS=true to include them\n");
  }

  await handleConfigChanges(configItems, write, 100);
}

function getIgnoredParameterNames(ignoredParams) {
  const ignoredParameterNames = [];

  const marketsByParameterName = ignoredParams
    .map((label) => {
      return {
        parameterName: label.split(" ")[0],
        market: label.split(" ").slice(1, 3).join(" "),
      };
    })
    .reduce((acc, { parameterName, market }) => {
      acc[parameterName] = acc[parameterName] || [];
      acc[parameterName].push(market);
      return acc;
    }, {} as Record<string, string[]>);

  Object.entries(marketsByParameterName).forEach(([parameterName]) => {
    ignoredParameterNames.push(parameterName);
  });

  return ignoredParameterNames;
}

async function getSupportedRiskOracleMarkets(markets, tokens, onchainMarketsByTokens) {
  const supported = new Set();

  if (!RISK_ORACLE_SUPPORTED_NETWORKS.includes(hre.network.name)) {
    return supported;
  }

  // Chaos API does not support fuji
  if (hre.network.name === "avalancheFuji") {
    return supported;
  }

  const response = await fetch("https://cloud.chaoslabs.co/query/ccar-perpetuals", {
    method: "POST",
    headers: {
      protocol: `gmx-v2-${hre.network.name}`,
      "content-type": "application/json",
    },
    body: `{
      "query": "{ markets { id } }"
    }`,
  });

  const { data } = await response.json();
  const supportedMarketTokens = data.markets.map((market) => market.id);

  supportedMarketTokens.forEach((supportedMarketToken) => {
    const market = markets.find((market) => {
      const marketToken = getMarketToken(market, tokens, onchainMarketsByTokens);
      return marketToken.toLowerCase() === supportedMarketToken.toLowerCase();
    });

    if (!market) {
      throw new Error(`Market with id ${supportedMarketToken} not found`);
    }

    supported.add(market);
  });

  return supported;
}

function getMarketToken(market, tokens, onchainMarketsByTokens) {
  const [indexToken, longToken, shortToken] = getMarketTokenAddresses(market, tokens);
  const marketKey = getMarketKey(indexToken, longToken, shortToken);
  const onchainMarket = onchainMarketsByTokens[marketKey];
  return onchainMarket.marketToken;
}
