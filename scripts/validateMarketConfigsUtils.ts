import hre from "hardhat";
import { decimalToFloat, bigNumberify, formatAmount, pow, FLOAT_PRECISION } from "../utils/math";
import { createMarketConfigByKey, getMarketKey } from "../utils/market";
import { performMulticall } from "../utils/multicall";
import { SECONDS_PER_YEAR } from "../utils/constants";
import * as keys from "../utils/keys";

const priceImpactBpsList = [1, 5, 10];

const stablecoinSymbols = {
  USDC: true,
  "USDC.e": true,
  USDT: true,
  "USDT.e": true,
  DAI: true,
  "DAI.e": true,
};

const BASIS_POINTS_DIVISOR = 10000;

const recommendedStablecoinSwapConfig = {
  negativeSwapImpactFactor: decimalToFloat(1, 9).div(2),
  negativePositionImpactFactor: decimalToFloat(1, 9).div(2),
  expectedSwapImpactRatio: 10000,
};

// negativePositionImpactFactor: the recommended negative position impact factor
// negativeSwapImpactFactor: the recommended negative swap impact factor
// the market config should be validated to have a higher or equal value to the recommended value
//
// expectedSwapImpactRatio: expected ratio of negative to positive swap price impact
// a ratio of 20000 means that the negative swap price price impact is twice the positive swap price impact
//
// expectedPositionImpactRatio: expected ratio of negative to positive position price impact
// a ratio of 20000 means that the negative position price price impact is twice the positive position price impact
const recommendedMarketConfig = {
  arbitrum: {
    BTC: {
      negativePositionImpactFactor: decimalToFloat(5, 11),
      negativeSwapImpactFactor: decimalToFloat(5, 11),
      expectedSwapImpactRatio: 10000,
      expectedPositionImpactRatio: 20000,
    },
    WETH: {
      negativePositionImpactFactor: decimalToFloat(5, 11),
      negativeSwapImpactFactor: decimalToFloat(5, 11),
      expectedSwapImpactRatio: 10000,
      expectedPositionImpactRatio: 20000,
    },
    BNB: {
      negativePositionImpactFactor: decimalToFloat(38, 12),
      negativeSwapImpactFactor: decimalToFloat(38, 12),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    LINK: {
      negativePositionImpactFactor: decimalToFloat(4, 10),
      negativeSwapImpactFactor: decimalToFloat(5, 10),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    ARB: {
      negativePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(5, 10),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    UNI: {
      negativePositionImpactFactor: decimalToFloat(3, 8),
      negativeSwapImpactFactor: decimalToFloat(3, 8),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    LTC: {
      negativePositionImpactFactor: decimalToFloat(8, 9),
      negativeSwapImpactFactor: decimalToFloat(8, 9),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    DOGE: {
      negativePositionImpactFactor: decimalToFloat(8, 9),
      negativeSwapImpactFactor: decimalToFloat(8, 9),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    SOL: {
      negativePositionImpactFactor: decimalToFloat(65, 12),
      negativeSwapImpactFactor: decimalToFloat(65, 12),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    XRP: {
      negativePositionImpactFactor: decimalToFloat(5, 9),
      negativeSwapImpactFactor: decimalToFloat(5, 9),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    AAVE: {
      negativePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(5, 10),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    AVAX: {
      negativePositionImpactFactor: decimalToFloat(5, 9),
      negativeSwapImpactFactor: decimalToFloat(5, 9),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    ATOM: {
      negativePositionImpactFactor: decimalToFloat(26, 9),
      negativeSwapImpactFactor: decimalToFloat(26, 9),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    NEAR: {
      negativePositionImpactFactor: decimalToFloat(26, 9),
      negativeSwapImpactFactor: decimalToFloat(26, 9),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    OP: {
      negativePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(5, 10),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    GMX: {
      negativePositionImpactFactor: decimalToFloat(5, 10),
      negativeSwapImpactFactor: decimalToFloat(8, 9),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
  },
  avalanche: {
    "BTC.b": {
      negativePositionImpactFactor: decimalToFloat(5, 11).div(2),
      negativeSwapImpactFactor: decimalToFloat(5, 11).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 16666,
    },
    "WETH.e": {
      negativePositionImpactFactor: decimalToFloat(5, 11).div(2),
      negativeSwapImpactFactor: decimalToFloat(5, 11).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 16666,
    },
    WAVAX: {
      negativePositionImpactFactor: decimalToFloat(1, 8).div(2),
      negativeSwapImpactFactor: decimalToFloat(5, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    LTC: {
      negativePositionImpactFactor: decimalToFloat(8, 9).div(2),
      negativeSwapImpactFactor: decimalToFloat(8, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    DOGE: {
      negativePositionImpactFactor: decimalToFloat(8, 9).div(2),
      negativeSwapImpactFactor: decimalToFloat(8, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    SOL: {
      negativePositionImpactFactor: decimalToFloat(5, 9).div(2),
      negativeSwapImpactFactor: decimalToFloat(5, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    XRP: {
      negativePositionImpactFactor: decimalToFloat(5, 9).div(2),
      negativeSwapImpactFactor: decimalToFloat(5, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
  },
};

const configTokenMapping = {
  arbitrum: {
    "WBTC.e": "BTC",
  },
};

function getTradeSizeForImpact({ priceImpactBps, impactExponentFactor, impactFactor }) {
  const exponent = 1 / (impactExponentFactor.div(decimalToFloat(1)).toNumber() - 1);
  const base = bigNumberify(priceImpactBps).mul(decimalToFloat(1)).div(10_000).div(impactFactor).toNumber();

  const tradeSize = Math.pow(base, exponent);
  return tradeSize;
}

async function validatePerpConfig({ market, marketConfig, indexTokenSymbol, dataStore, errors }) {
  if (!marketConfig.tokens.indexToken) {
    return;
  }

  console.log("validatePerpConfig", indexTokenSymbol);
  const recommendedPerpConfig = recommendedMarketConfig[hre.network.name][indexTokenSymbol];

  if (!recommendedPerpConfig || !recommendedPerpConfig.negativePositionImpactFactor) {
    throw new Error(`Empty recommendedPerpConfig for ${indexTokenSymbol}`);
  }

  let negativePositionImpactFactor = marketConfig.negativePositionImpactFactor;
  let positivePositionImpactFactor = marketConfig.positivePositionImpactFactor;
  let positionImpactExponentFactor = marketConfig.positionImpactExponentFactor;
  let openInterestReserveFactorLongs = marketConfig.openInterestReserveFactorLongs;
  let openInterestReserveFactorShorts = marketConfig.openInterestReserveFactorShorts;
  let borrowingFactorForLongs = marketConfig.borrowingFactorForLongs;
  let borrowingExponentFactorForLongs = marketConfig.borrowingExponentFactorForLongs;
  let borrowingFactorForShorts = marketConfig.borrowingFactorForShorts;
  let borrowingExponentFactorForShorts = marketConfig.borrowingExponentFactorForShorts;
  let fundingFactor = marketConfig.fundingFactor;
  let fundingExponentFactor = marketConfig.fundingExponentFactor;
  const maxOpenInterestForLongs = marketConfig.maxOpenInterestForLongs;
  const maxOpenInterestForShorts = marketConfig.maxOpenInterestForShorts;

  if (maxOpenInterestForLongs === undefined) {
    throw new Error(`Empty maxOpenInterestForLongs for ${indexTokenSymbol}`);
  }

  if (maxOpenInterestForShorts === undefined) {
    throw new Error(`Empty maxOpenInterestForShorts for ${indexTokenSymbol}`);
  }

  if (process.env.READ_FROM_CHAIN === "true") {
    const multicallReadParams = [];

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.positionImpactFactorKey(market.marketToken, false),
      ]),
      label: "negativePositionImpactFactor",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.positionImpactFactorKey(market.marketToken, true),
      ]),
      label: "positivePositionImpactFactor",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.positionImpactExponentFactorKey(market.marketToken),
      ]),
      label: "positionImpactExponentFactor",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.openInterestReserveFactorKey(market.marketToken, true),
      ]),
      label: "openInterestReserveFactorLongs",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.openInterestReserveFactorKey(market.marketToken, false),
      ]),
      label: "openInterestReserveFactorShorts",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [keys.borrowingFactorKey(market.marketToken, true)]),
      label: "borrowingFactorForLongs",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.borrowingExponentFactorKey(market.marketToken, true),
      ]),
      label: "borrowingExponentFactorForLongs",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [keys.borrowingFactorKey(market.marketToken, false)]),
      label: "borrowingFactorForShorts",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.borrowingExponentFactorKey(market.marketToken, false),
      ]),
      label: "borrowingExponentFactorForShorts",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [keys.fundingFactorKey(market.marketToken)]),
      label: "fundingFactor",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [keys.fundingExponentFactorKey(market.marketToken)]),
      label: "fundingExponentFactor",
    });

    const { bigNumberResults } = await performMulticall({ multicallReadParams });
    ({
      negativePositionImpactFactor,
      positivePositionImpactFactor,
      positionImpactExponentFactor,
      openInterestReserveFactorLongs,
      openInterestReserveFactorShorts,
      borrowingFactorForLongs,
      borrowingExponentFactorForLongs,
      borrowingFactorForShorts,
      borrowingExponentFactorForShorts,
      fundingFactor,
      fundingExponentFactor,
    } = bigNumberResults);
  }

  const percentageOfPerpImpactRecommendation = negativePositionImpactFactor
    .mul(100)
    .div(recommendedPerpConfig.negativePositionImpactFactor);

  console.log(
    `    Position impact compared to recommendation: ${
      parseFloat(percentageOfPerpImpactRecommendation.toNumber()) / 100
    }x smallest safe value`
  );

  for (const priceImpactBps of priceImpactBpsList) {
    console.log(
      `    Negative (${formatAmount(priceImpactBps, 2, 2)}%): $${formatAmount(
        getTradeSizeForImpact({
          priceImpactBps,
          impactExponentFactor: positionImpactExponentFactor,
          impactFactor: negativePositionImpactFactor,
        }),
        0,
        0,
        true
      )}, Positive (${formatAmount(priceImpactBps, 2, 2)}%): $${formatAmount(
        getTradeSizeForImpact({
          priceImpactBps,
          impactExponentFactor: positionImpactExponentFactor,
          impactFactor: positivePositionImpactFactor,
        }),
        0,
        0,
        true
      )}`
    );
  }

  const impactRatio = negativePositionImpactFactor.mul(BASIS_POINTS_DIVISOR).div(positivePositionImpactFactor);
  if (impactRatio.sub(recommendedPerpConfig.expectedPositionImpactRatio).abs().gt(100)) {
    throw new Error(`Invalid position impact factors for ${indexTokenSymbol}`);
  }

  if (negativePositionImpactFactor.lt(recommendedPerpConfig.negativePositionImpactFactor)) {
    errors.push({
      message: `Invalid negativePositionImpactFactor for ${indexTokenSymbol}`,
      expected: recommendedPerpConfig.negativePositionImpactFactor,
      actual: negativePositionImpactFactor,
    });
  }

  if (
    borrowingExponentFactorForLongs.lt(decimalToFloat(1)) ||
    borrowingExponentFactorForLongs.gt(decimalToFloat(15, 1))
  ) {
    throw new Error(
      `borrowingExponentFactorForLongs should be in range 1 – 1.5, provided ${formatAmount(
        borrowingExponentFactorForLongs,
        30
      )}`
    );
  }

  if (
    borrowingExponentFactorForShorts.lt(decimalToFloat(1)) ||
    borrowingExponentFactorForShorts.gt(decimalToFloat(15, 1))
  ) {
    throw new Error(
      `borrowingExponentFactorForShorts should be in range 1 – 1.5, provided ${formatAmount(
        borrowingExponentFactorForShorts,
        30
      )}`
    );
  }

  const maxLongTokenPoolUsdBasedOnMaxOpenInterest = maxOpenInterestForLongs
    .mul(FLOAT_PRECISION)
    .div(openInterestReserveFactorLongs);
  const maxBorrowingFactorForLongsPerYear = pow(maxOpenInterestForLongs, borrowingExponentFactorForLongs)
    .mul(borrowingFactorForLongs)
    .div(maxLongTokenPoolUsdBasedOnMaxOpenInterest)
    .mul(SECONDS_PER_YEAR);

  if (maxBorrowingFactorForLongsPerYear.gt(decimalToFloat(15, 1))) {
    throw new Error("maxBorrowingFactorForLongsPerYear is more than 150%");
  }

  console.log(`    maxBorrowingFactorForLongsPerYear: ${formatAmount(maxBorrowingFactorForLongsPerYear, 28)}%`);

  const maxShortTokenPoolUsdBasedOnMaxOpenInterest = maxOpenInterestForShorts
    .mul(FLOAT_PRECISION)
    .div(openInterestReserveFactorShorts);
  const maxBorrowingFactorForShortsPerYear = pow(maxOpenInterestForShorts, borrowingExponentFactorForShorts)
    .mul(borrowingFactorForShorts)
    .div(maxShortTokenPoolUsdBasedOnMaxOpenInterest)
    .mul(SECONDS_PER_YEAR);

  if (maxBorrowingFactorForShortsPerYear.gt(decimalToFloat(15, 1))) {
    throw new Error("maxBorrowingFactorForShortsPerYear is more than 150%");
  }

  console.log(`    maxBorrowingFactorForShortsPerYear: ${formatAmount(maxBorrowingFactorForShortsPerYear, 28)}%`);

  if (!fundingExponentFactor.eq(decimalToFloat(1))) {
    throw new Error("fundingExponentFactor != 1");
  }

  const maxFundingFactorPerYear = fundingFactor.mul(SECONDS_PER_YEAR);

  if (maxFundingFactorPerYear.gt(decimalToFloat(1))) {
    throw new Error("maxFundingFactorPerYear is more than 100%");
  }

  console.log(`    maxFundingFactorPerYear: ${formatAmount(maxFundingFactorPerYear, 28)}%`);
}

async function validateSwapConfig({
  market,
  marketConfig,
  indexTokenSymbol,
  longTokenSymbol,
  shortTokenSymbol,
  dataStore,
  errors,
}) {
  const isStablecoinMarket = stablecoinSymbols[longTokenSymbol] && stablecoinSymbols[shortTokenSymbol];

  let recommendedSwapConfig;

  if (longTokenSymbol === shortTokenSymbol) {
    if (!marketConfig.negativeSwapImpactFactor.eq(0)) {
      throw new Error("negativeSwapImpactFactor should be zero");
    }

    if (!marketConfig.positiveSwapImpactFactor.eq(0)) {
      throw new Error("negativeSwapImpactFactor should be zero");
    }

    return;
  }

  if (isStablecoinMarket) {
    recommendedSwapConfig = recommendedStablecoinSwapConfig;
  } else {
    // first try to get config for longToken
    // if that is empty try to get config for longToken after re-mapping it using configTokenMapping
    recommendedSwapConfig =
      recommendedMarketConfig[hre.network.name][longTokenSymbol] ||
      recommendedMarketConfig[hre.network.name][configTokenMapping[hre.network.name][longTokenSymbol]];
  }

  if (!recommendedSwapConfig) {
    throw new Error(`Empty recommendedSwapConfig for ${longTokenSymbol}`);
  }

  if (!stablecoinSymbols[shortTokenSymbol]) {
    throw new Error(`Short token has not been categorized as a stablecoin`);
  }

  let negativeSwapImpactFactor = marketConfig.negativeSwapImpactFactor;
  let positiveSwapImpactFactor = marketConfig.positiveSwapImpactFactor;
  let swapImpactExponentFactor = marketConfig.swapImpactExponentFactor;

  if (process.env.READ_FROM_CHAIN === "true") {
    const multicallReadParams = [];

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.swapImpactFactorKey(market.marketToken, false),
      ]),
      label: "negativeSwapImpactFactor",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [keys.swapImpactFactorKey(market.marketToken, true)]),
      label: "positiveSwapImpactFactor",
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.swapImpactExponentFactorKey(market.marketToken),
      ]),
      label: "swapImpactExponentFactor",
    });

    const { bigNumberResults } = await performMulticall({ multicallReadParams });
    ({ negativeSwapImpactFactor, positiveSwapImpactFactor, swapImpactExponentFactor } = bigNumberResults);
  }

  const percentageOfSwapImpactRecommendation = negativeSwapImpactFactor
    .mul(100)
    .div(recommendedSwapConfig.negativeSwapImpactFactor);

  console.log(
    `    Swap impact compared to recommendation: ${
      parseFloat(percentageOfSwapImpactRecommendation.toNumber()) / 100
    }x smallest safe value`
  );

  for (const priceImpactBps of priceImpactBpsList) {
    console.log(
      `    Negative (${formatAmount(priceImpactBps, 2, 2)}%): $${formatAmount(
        getTradeSizeForImpact({
          priceImpactBps,
          impactExponentFactor: swapImpactExponentFactor,
          impactFactor: negativeSwapImpactFactor,
        }),
        0,
        0,
        true
      )}, Positive: (${formatAmount(priceImpactBps, 2, 2)}%): $${formatAmount(
        getTradeSizeForImpact({
          priceImpactBps,
          impactExponentFactor: swapImpactExponentFactor,
          impactFactor: positiveSwapImpactFactor,
        }),
        0,
        0,
        true
      )}`
    );
  }

  const impactRatio = negativeSwapImpactFactor.mul(BASIS_POINTS_DIVISOR).div(positiveSwapImpactFactor);
  if (impactRatio.sub(recommendedSwapConfig.expectedSwapImpactRatio).abs().gt(100)) {
    throw new Error(
      `Invalid swap impact factors for ${indexTokenSymbol}: ${impactRatio} expected ${recommendedSwapConfig.expectedSwapImpactRatio} negativeSwapImpactFactor ${negativeSwapImpactFactor} positiveSwapImpactFactor ${positiveSwapImpactFactor}`
    );
  }

  if (negativeSwapImpactFactor.lt(recommendedSwapConfig.negativeSwapImpactFactor)) {
    errors.push({
      message: `Invalid negativeSwapImpactFactor for ${indexTokenSymbol}`,
      expected: recommendedSwapConfig.negativeSwapImpactFactor,
      actual: negativeSwapImpactFactor,
    });
  }
}

export async function validateMarketConfigs() {
  const tokens = await hre.gmx.getTokens();
  const marketConfigs = await hre.gmx.getMarkets();
  const marketConfigByKey = createMarketConfigByKey({ marketConfigs, tokens });

  const addressToSymbol: { [address: string]: string } = {};
  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = tokenConfig.address;
    if (!address) {
      address = (await hre.ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address] = tokenSymbol;
  }

  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");
  console.log("reading data from DataStore %s Reader %s", dataStore.address, reader.address);
  const markets = [...(await reader.getMarkets(dataStore.address, 0, 100))];
  markets.sort((a, b) => a.indexToken.localeCompare(b.indexToken));

  const errors = [];

  // validate market configs as some markets may not be created on-chain yet
  for (const marketConfig of marketConfigs) {
    const indexTokenSymbol = marketConfig.tokens.indexToken;
    const longTokenSymbol = marketConfig.tokens.longToken;
    const shortTokenSymbol = marketConfig.tokens.shortToken;

    console.log(
      "index: %s long: %s short: %s",
      indexTokenSymbol?.padEnd(5) || "(swap only)",
      longTokenSymbol?.padEnd(5),
      shortTokenSymbol?.padEnd(5)
    );

    await validatePerpConfig({ marketConfig, indexTokenSymbol, dataStore, errors });
    await validateSwapConfig({ marketConfig, indexTokenSymbol, longTokenSymbol, shortTokenSymbol, dataStore, errors });
  }

  for (const market of markets) {
    const indexTokenSymbol = addressToSymbol[market.indexToken];
    const longTokenSymbol = addressToSymbol[market.longToken];
    const shortTokenSymbol = addressToSymbol[market.shortToken];
    const marketKey = getMarketKey(market.indexToken, market.longToken, market.shortToken);
    const marketConfig = marketConfigByKey[marketKey];

    console.log(
      "%s index: %s long: %s short: %s",
      market.marketToken,
      indexTokenSymbol?.padEnd(5) || "(swap only)",
      longTokenSymbol?.padEnd(5),
      shortTokenSymbol?.padEnd(5)
    );

    await validatePerpConfig({ market, marketConfig, indexTokenSymbol, dataStore, errors });
    await validateSwapConfig({ market, marketConfig, longTokenSymbol, shortTokenSymbol, dataStore, errors });
  }

  for (const error of errors) {
    console.log(`Error: ${error.message}, expected: ${error.expected.toString()}, actual: ${error.actual.toString()}`);
  }

  return { errors };
}
