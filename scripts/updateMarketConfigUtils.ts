import hre, { network } from "hardhat";

import fetch from "node-fetch";
import { handleInBatches } from "../utils/batch";
import { appendUintConfigIfDifferent, getFullKey } from "../utils/config";
import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";
import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import { bigNumberify } from "../utils/math";
import { validateMarketConfigs } from "./validateMarketConfigsUtils";

const RISK_ORACLE_MANAGED_BASE_KEYS = [keys.MAX_OPEN_INTEREST];
const RISK_ORACLE_SUPPORTED_NETWORKS = ["arbitrum", "avalanche", "avalancheFuji"];

const processMarkets = async ({
  markets,
  onchainMarketsByTokens,
  supportedRiskOracleMarkets,
  tokens,
  generalConfig,
  handleConfig: handleConfigArg,
}) => {
  const shouldHandleBaseKey = (baseKey: string, isSupportedByRiskOracle: boolean) => {
    if (!RISK_ORACLE_SUPPORTED_NETWORKS.includes(hre.network.name)) {
      return true;
    }

    if (!RISK_ORACLE_MANAGED_BASE_KEYS.includes(baseKey)) {
      return true;
    }

    if (isSupportedByRiskOracle) {
      return process.env.INCLUDE_RISK_ORACLE_BASE_KEYS;
    }

    return true;
  };

  const ignoredRiskOracleParams: string[] = [];

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];

    if (!onchainMarket) {
      console.info("WARN: market %s:%s:%s:%s does not exist. skip", marketKey, indexToken, longToken, shortToken);
      continue;
    }

    const marketToken = onchainMarket.marketToken;
    const marketLabel = `${marketConfig.tokens.indexToken} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}]`;

    const handleConfig = async (type, baseKey, keyData, value, label) => {
      if (shouldHandleBaseKey(baseKey, supportedRiskOracleMarkets.has(marketConfig))) {
        await handleConfigArg(type, baseKey, keyData, value, label);
      } else {
        ignoredRiskOracleParams.push(label);
      }
    };

    await handleConfig(
      "uint",
      keys.MAX_POOL_AMOUNT,
      encodeData(["address", "address"], [marketToken, longToken]),
      marketConfig.maxLongTokenPoolAmount,
      `maxLongTokenPoolAmount ${marketLabel} (${marketToken}), ${longToken}`
    );

    await handleConfig(
      "uint",
      keys.MAX_POOL_AMOUNT,
      encodeData(["address", "address"], [marketToken, shortToken]),
      marketConfig.maxShortTokenPoolAmount,
      `maxShortTokenPoolAmount ${marketLabel} (${marketToken}), ${shortToken}`
    );

    await handleConfig(
      "uint",
      keys.MAX_POOL_USD_FOR_DEPOSIT,
      encodeData(["address", "address"], [marketToken, longToken]),
      marketConfig.maxLongTokenPoolUsdForDeposit,
      `maxLongTokenPoolUsdForDeposit ${marketLabel} (${marketToken}), ${longToken}`
    );

    await handleConfig(
      "uint",
      keys.MAX_POOL_USD_FOR_DEPOSIT,
      encodeData(["address", "address"], [marketToken, shortToken]),
      marketConfig.maxShortTokenPoolUsdForDeposit,
      `maxShortTokenPoolUsdForDeposit ${marketLabel} (${marketToken}), ${shortToken}`
    );

    if (marketConfig.swapImpactExponentFactor) {
      await handleConfig(
        "uint",
        keys.SWAP_IMPACT_EXPONENT_FACTOR,
        encodeData(["address"], [marketToken]),
        marketConfig.swapImpactExponentFactor,
        `swapImpactExponentFactor ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.swapFeeFactorForPositiveImpact) {
      await handleConfig(
        "uint",
        keys.SWAP_FEE_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.swapFeeFactorForPositiveImpact,
        `swapFeeFactorForPositiveImpact ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.swapFeeFactorForNegativeImpact) {
      await handleConfig(
        "uint",
        keys.SWAP_FEE_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.swapFeeFactorForNegativeImpact,
        `swapFeeFactorForNegativeImpact ${marketLabel} (${marketToken})`
      );
    }

    // if (marketConfig.depositFeeFactorForPositiveImpact || marketConfig.swapFeeFactorForPositiveImpact) {
    //   await handleConfig(
    //     "uint",
    //     keys.DEPOSIT_FEE_FACTOR,
    //     encodeData(["address", "bool"], [marketToken, true]),
    //     marketConfig.depositFeeFactorForPositiveImpact ?? marketConfig.swapFeeFactorForPositiveImpact,
    //     `depositFeeFactorForPositiveImpact ${marketLabel} (${marketToken})`
    //   );
    // }
    //
    // if (marketConfig.depositFeeFactorForNegativeImpact || marketConfig.swapFeeFactorForNegativeImpact) {
    //   await handleConfig(
    //     "uint",
    //     keys.DEPOSIT_FEE_FACTOR,
    //     encodeData(["address", "bool"], [marketToken, true]),
    //     marketConfig.depositFeeFactorForNegativeImpact ?? marketConfig.swapFeeFactorForNegativeImpact,
    //     `depositFeeFactorForNegativeImpact ${marketLabel} (${marketToken})`
    //   );
    // }
    //
    // if (marketConfig.withdrawalFeeFactorForPositiveImpact || marketConfig.swapFeeFactorForPositiveImpact) {
    //   await handleConfig(
    //     "uint",
    //     keys.WITHDRAWAL_FEE_FACTOR,
    //     encodeData(["address", "bool"], [marketToken, true]),
    //     marketConfig.withdrawalFeeFactorForPositiveImpact ?? marketConfig.swapFeeFactorForPositiveImpact,
    //     `withdrawalFeeFactorForPositiveImpact ${marketLabel} (${marketToken})`
    //   );
    // }
    //
    // if (marketConfig.withdrawalFeeFactorForNegativeImpact || marketConfig.swapFeeFactorForNegativeImpact) {
    //   await handleConfig(
    //     "uint",
    //     keys.WITHDRAWAL_FEE_FACTOR,
    //     encodeData(["address", "bool"], [marketToken, true]),
    //     marketConfig.withdrawalFeeFactorForNegativeImpact ?? marketConfig.swapFeeFactorForNegativeImpact,
    //     `withdrawalFeeFactorForNegativeImpact ${marketLabel} (${marketToken})`
    //   );
    // }

    if (marketConfig.atomicSwapFeeFactor) {
      await handleConfig(
        "uint",
        keys.ATOMIC_SWAP_FEE_FACTOR,
        encodeData(["address"], [marketToken]),
        marketConfig.atomicSwapFeeFactor,
        `atomicSwapFeeFactor ${marketToken}`
      );
    }

    if (marketConfig.positiveSwapImpactFactor) {
      await handleConfig(
        "uint",
        keys.SWAP_IMPACT_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.positiveSwapImpactFactor,
        `positiveSwapImpactFactor ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.negativeSwapImpactFactor) {
      await handleConfig(
        "uint",
        keys.SWAP_IMPACT_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.negativeSwapImpactFactor,
        `negativeSwapImpactFactor ${marketLabel} (${marketToken})`
      );
    }

    await handleConfig(
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

    await handleConfig(
      "uint",
      keys.MIN_COLLATERAL_FACTOR,
      encodeData(["address"], [marketToken]),
      marketConfig.minCollateralFactor,
      `minCollateralFactor ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.minCollateralFactorForOpenInterestMultiplierLong,
      `minCollateralFactorForOpenInterestMultiplierLong ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.minCollateralFactorForOpenInterestMultiplierShort,
      `minCollateralFactorForOpenInterestMultiplierShort ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_OPEN_INTEREST,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.maxOpenInterestForLongs,
      `maxOpenInterestForLongs ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_OPEN_INTEREST,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.maxOpenInterestForShorts,
      `maxOpenInterestForShorts ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.RESERVE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.reserveFactorLongs,
      `reserveFactorLongs ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.RESERVE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.reserveFactorShorts,
      `reserveFactorShorts ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.openInterestReserveFactorLongs,
      `openInterestReserveFactorLongs ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.openInterestReserveFactorShorts,
      `openInterestReserveFactorShorts ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_TRADERS, marketToken, true]),
      marketConfig.maxPnlFactorForTradersLongs,
      `maxPnlFactorForTradersLongs ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_TRADERS, marketToken, false]),
      marketConfig.maxPnlFactorForTradersShorts,
      `maxPnlFactorForTradersShorts ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_ADL, marketToken, true]),
      marketConfig.maxPnlFactorForAdlLongs,
      `maxPnlFactorForAdlLongs ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_ADL, marketToken, false]),
      marketConfig.maxPnlFactorForAdlShorts,
      `maxPnlFactorForAdlShorts ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MIN_PNL_FACTOR_AFTER_ADL,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.minPnlFactorAfterAdlLongs,
      `minPnlFactorAfterAdlLongs ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MIN_PNL_FACTOR_AFTER_ADL,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.minPnlFactorAfterAdlShorts,
      `minPnlFactorAfterAdlShorts ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_DEPOSITS, marketToken, true]),
      marketConfig.maxPnlFactorForDepositsLongs,
      `maxPnlFactorForDepositsLongs ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_DEPOSITS, marketToken, false]),
      marketConfig.maxPnlFactorForDepositsShorts,
      `maxPnlFactorForDepositsShorts ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketToken, true]),
      marketConfig.maxPnlFactorForWithdrawalsLongs,
      `maxPnlFactorForWithdrawalsLongs ${marketLabel} (${marketToken})`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketToken, false]),
      marketConfig.maxPnlFactorForWithdrawalsShorts,
      `maxPnlFactorForWithdrawalsShorts ${marketLabel} (${marketToken})`
    );

    if (marketConfig.positionImpactExponentFactor) {
      await handleConfig(
        "uint",
        keys.POSITION_IMPACT_EXPONENT_FACTOR,
        encodeData(["address"], [marketToken]),
        marketConfig.positionImpactExponentFactor,
        `positionImpactExponentFactor ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.fundingFactor) {
      await handleConfig(
        "uint",
        keys.FUNDING_FACTOR,
        encodeData(["address"], [marketToken]),
        marketConfig.fundingFactor,
        `fundingFactor ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.fundingExponentFactor) {
      await handleConfig(
        "uint",
        keys.FUNDING_EXPONENT_FACTOR,
        encodeData(["address"], [marketToken]),
        marketConfig.fundingExponentFactor,
        `fundingFactor ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.fundingIncreaseFactorPerSecond) {
      await handleConfig(
        "uint",
        keys.FUNDING_INCREASE_FACTOR_PER_SECOND,
        encodeData(["address"], [marketToken]),
        marketConfig.fundingIncreaseFactorPerSecond,
        `fundingIncreaseFactorPerSecond ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.fundingDecreaseFactorPerSecond) {
      await handleConfig(
        "uint",
        keys.FUNDING_DECREASE_FACTOR_PER_SECOND,
        encodeData(["address"], [marketToken]),
        marketConfig.fundingDecreaseFactorPerSecond,
        `fundingDecreaseFactorPerSecond ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.minFundingFactorPerSecond) {
      await handleConfig(
        "uint",
        keys.MIN_FUNDING_FACTOR_PER_SECOND,
        encodeData(["address"], [marketToken]),
        marketConfig.minFundingFactorPerSecond,
        `minFundingFactorPerSecond ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.maxFundingFactorPerSecond) {
      await handleConfig(
        "uint",
        keys.MAX_FUNDING_FACTOR_PER_SECOND,
        encodeData(["address"], [marketToken]),
        marketConfig.maxFundingFactorPerSecond,
        `maxFundingFactorPerSecond ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.thresholdForStableFunding) {
      await handleConfig(
        "uint",
        keys.THRESHOLD_FOR_STABLE_FUNDING,
        encodeData(["address"], [marketToken]),
        marketConfig.thresholdForStableFunding,
        `thresholdForStableFunding ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.thresholdForDecreaseFunding) {
      await handleConfig(
        "uint",
        keys.THRESHOLD_FOR_DECREASE_FUNDING,
        encodeData(["address"], [marketToken]),
        marketConfig.thresholdForDecreaseFunding,
        `thresholdForDecreaseFunding ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.positionFeeFactorForPositiveImpact) {
      await handleConfig(
        "uint",
        keys.POSITION_FEE_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.positionFeeFactorForPositiveImpact,
        `positionFeeFactorForPositiveImpact ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.positionFeeFactorForNegativeImpact) {
      await handleConfig(
        "uint",
        keys.POSITION_FEE_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.positionFeeFactorForNegativeImpact,
        `positionFeeFactorForNegativeImpact ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.optimalUsageFactorForLongs !== undefined) {
      await handleConfig(
        "uint",
        keys.OPTIMAL_USAGE_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.optimalUsageFactorForLongs,
        `optimalUsageFactorForLongs ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.optimalUsageFactorForShorts !== undefined) {
      await handleConfig(
        "uint",
        keys.OPTIMAL_USAGE_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.optimalUsageFactorForShorts,
        `optimalUsageFactorForShorts ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.baseBorrowingFactorForLongs) {
      await handleConfig(
        "uint",
        keys.BASE_BORROWING_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.baseBorrowingFactorForLongs,
        `baseBorrowingFactorForLongs ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.baseBorrowingFactorForShorts) {
      await handleConfig(
        "uint",
        keys.BASE_BORROWING_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.baseBorrowingFactorForShorts,
        `baseBorrowingFactorForShorts ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.aboveOptimalUsageBorrowingFactorForLongs) {
      await handleConfig(
        "uint",
        keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.aboveOptimalUsageBorrowingFactorForLongs,
        `aboveOptimalUsageBorrowingFactorForLongs ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.aboveOptimalUsageBorrowingFactorForShorts) {
      await handleConfig(
        "uint",
        keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.aboveOptimalUsageBorrowingFactorForShorts,
        `aboveOptimalUsageBorrowingFactorForShorts ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.borrowingFactorForLongs) {
      await handleConfig(
        "uint",
        keys.BORROWING_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.borrowingFactorForLongs,
        `borrowingFactorForLongs ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.borrowingFactorForShorts) {
      await handleConfig(
        "uint",
        keys.BORROWING_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.borrowingFactorForShorts,
        `borrowingFactorForShorts ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.borrowingExponentFactorForLongs) {
      await handleConfig(
        "uint",
        keys.BORROWING_EXPONENT_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.borrowingExponentFactorForLongs,
        `borrowingExponentFactorForLongs ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.borrowingExponentFactorForShorts) {
      await handleConfig(
        "uint",
        keys.BORROWING_EXPONENT_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.borrowingExponentFactorForShorts,
        `borrowingExponentFactorForShorts ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.positivePositionImpactFactor !== undefined) {
      await handleConfig(
        "uint",
        keys.POSITION_IMPACT_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.positivePositionImpactFactor,
        `positivePositionImpactFactor ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.negativePositionImpactFactor !== undefined) {
      await handleConfig(
        "uint",
        keys.POSITION_IMPACT_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.negativePositionImpactFactor,
        `negativePositionImpactFactor ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.maxPositionImpactFactorForLiquidations) {
      await handleConfig(
        "uint",
        keys.MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS,
        encodeData(["address"], [marketToken]),
        marketConfig.maxPositionImpactFactorForLiquidations,
        `maxPositionImpactFactorForLiquidations ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.positiveMaxPositionImpactFactor) {
      await handleConfig(
        "uint",
        keys.MAX_POSITION_IMPACT_FACTOR,
        encodeData(["address", "bool"], [marketToken, true]),
        marketConfig.positiveMaxPositionImpactFactor,
        `positiveMaxPositionImpactFactor ${marketLabel} (${marketToken})`
      );
    }

    if (marketConfig.negativeMaxPositionImpactFactor) {
      await handleConfig(
        "uint",
        keys.MAX_POSITION_IMPACT_FACTOR,
        encodeData(["address", "bool"], [marketToken, false]),
        marketConfig.negativeMaxPositionImpactFactor,
        `negativeMaxPositionImpactFactor ${marketLabel} (${marketToken})`
      );
    }
  }

  return ignoredRiskOracleParams;
};

export async function updateMarketConfig({ write }) {
  if (!["arbitrumGoerli", "avalancheFuji", "hardhat"].includes(network.name)) {
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
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  const configKeys = [];
  const multicallReadParams = [];

  const supportedRiskOracleMarkets = await getSupportedRiskOracleMarkets(markets, tokens, onchainMarketsByTokens);

  await processMarkets({
    markets,
    onchainMarketsByTokens,
    tokens,
    supportedRiskOracleMarkets,
    generalConfig,
    handleConfig: async (type, baseKey, keyData) => {
      if (type !== "uint") {
        throw new Error("Unsupported type");
      }

      const key = getFullKey(baseKey, keyData);

      configKeys.push(key);
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [key]),
      });
    },
  });

  const result = await multicall.callStatic.aggregate3(multicallReadParams);
  const dataCache = {};
  for (let i = 0; i < configKeys.length; i++) {
    const key = configKeys[i];
    const value = result[i].returnData;
    dataCache[key] = bigNumberify(value);
  }

  const multicallWriteParams = [];

  const ignoredRiskOracleParams = await processMarkets({
    markets,
    onchainMarketsByTokens,
    supportedRiskOracleMarkets,
    tokens,
    generalConfig,
    handleConfig: async (type, baseKey, keyData, value, label) => {
      if (type !== "uint") {
        throw new Error("Unsupported type");
      }

      await appendUintConfigIfDifferent(multicallWriteParams, dataCache, baseKey, keyData, value, label);
    },
  });

  console.info(`updating ${multicallWriteParams.length} params`);
  console.info("multicallWriteParams", multicallWriteParams);

  if (write) {
    await handleInBatches(multicallWriteParams, 100, async (batch) => {
      const tx = await config.multicall(batch);
      console.info(`tx sent: ${tx.hash}`);
    });
  } else {
    await handleInBatches(multicallWriteParams, 100, async (batch) => {
      await config.callStatic.multicall(batch);
    });
    await console.info("NOTE: executed in read-only mode, no transactions were sent");
  }

  if (ignoredRiskOracleParams.length > 0) {
    const ignoredParameterNames = [];

    const marketsByParameterName = ignoredRiskOracleParams
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

    console.info("\n=================\n");
    console.info(`WARN: Ignored risk oracle params for ${supportedRiskOracleMarkets.size} markets`);
    console.info(`Ignored params: ${ignoredParameterNames.join(",")}`);
    console.info("Add `INCLUDE_RISK_ORACLE_BASE_KEYS=1` to include them\n");
  }
}

async function getSupportedRiskOracleMarkets(markets, tokens, onchainMarketsByTokens) {
  const supported = new Set();

  if (!RISK_ORACLE_SUPPORTED_NETWORKS.includes(hre.network.name)) {
    return supported;
  }

  if (!RISK_ORACLE_SUPPORTED_NETWORKS.includes(network.name)) {
    return supported;
  }

  const response = await fetch("https://cloud.chaoslabs.co/query/ccar-perpetuals", {
    method: "POST",
    headers: {
      protocol: `gmx-v2-${network.name}`,
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
