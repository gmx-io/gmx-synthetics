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
  negativeImpactFactor: decimalToFloat(1, 9).div(2),
  expectedSwapImpactRatio: 10000,
};

const recommendedMarketConfig = {
  arbitrum: {
    BTC: {
      negativeImpactFactor: decimalToFloat(5, 11).div(2),
      expectedSwapImpactRatio: 10000,
      expectedPositionImpactRatio: 16666,
    },
    WETH: {
      negativeImpactFactor: decimalToFloat(5, 11).div(2),
      expectedSwapImpactRatio: 10000,
      expectedPositionImpactRatio: 16666,
    },
    LINK: {
      negativeImpactFactor: decimalToFloat(5, 10).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    ARB: {
      negativeImpactFactor: decimalToFloat(5, 10).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    UNI: {
      negativeImpactFactor: decimalToFloat(4, 8).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    LTC: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    DOGE: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    SOL: {
      negativeImpactFactor: decimalToFloat(5, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    XRP: {
      negativeImpactFactor: decimalToFloat(5, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
  },
  avalanche: {
    "BTC.b": {
      negativeImpactFactor: decimalToFloat(5, 11).div(2),
      expectedSwapImpactRatio: 10000,
      expectedPositionImpactRatio: 16666,
    },
    "WETH.e": {
      negativeImpactFactor: decimalToFloat(5, 11).div(2),
      expectedSwapImpactRatio: 10000,
      expectedPositionImpactRatio: 16666,
    },
    WAVAX: {
      negativeImpactFactor: decimalToFloat(1, 8).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    LTC: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    DOGE: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    SOL: {
      negativeImpactFactor: decimalToFloat(5, 9).div(2),
      expectedSwapImpactRatio: 20000,
      expectedPositionImpactRatio: 20000,
    },
    XRP: {
      negativeImpactFactor: decimalToFloat(5, 9).div(2),
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
  if (market.indexToken == ethers.constants.AddressZero) {
    return;
  }

  const recommendedPerpConfig = recommendedMarketConfig[hre.network.name][indexTokenSymbol];

  if (!recommendedPerpConfig || !recommendedPerpConfig.negativeImpactFactor) {
    throw new Error(`Empty recommendedPerpConfig for ${indexTokenSymbol}`);
  }

  let negativePositionImpactFactor = marketConfig.negativePositionImpactFactor;
  let positivePositionImpactFactor = marketConfig.positivePositionImpactFactor;
  let positionImpactExponentFactor = marketConfig.positionImpactExponentFactor;

  if (process.env.READ_FROM_CHAIN === "true") {
    negativePositionImpactFactor = await dataStore.getUint(keys.positionImpactFactorKey(market.marketToken, false));
    positivePositionImpactFactor = await dataStore.getUint(keys.positionImpactFactorKey(market.marketToken, true));
    positionImpactExponentFactor = await dataStore.getUint(keys.positionImpactExponentFactorKey(market.marketToken));
  }

  const percentageOfPerpImpactRecommendation = negativePositionImpactFactor
    .mul(100)
    .div(recommendedPerpConfig.negativeImpactFactor);

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

  if (negativePositionImpactFactor.lt(recommendedPerpConfig.negativeImpactFactor)) {
    errors.push({
      message: `Invalid negativePositionImpactFactor for ${indexTokenSymbol}`,
      expected: recommendedPerpConfig.negativeImpactFactor,
      actual: negativePositionImpactFactor,
    });
  }
}

async function validateSwapConfig({ market, marketConfig, longTokenSymbol, shortTokenSymbol, dataStore, errors }) {
  const isStablecoinMarket = stablecoinSymbols[longTokenSymbol] && stablecoinSymbols[shortTokenSymbol];

  let recommendedSwapConfig;

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
      negativeSwapImpactFactor,
      positiveSwapImpactFactor,
      swapImpactExponentFactor,
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

  const percentageOfSwapImpactRecommendation = negativeSwapImpactFactor
    .mul(100)
    .div(recommendedSwapConfig.negativeImpactFactor);

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
      `Invalid position impact factors for ${longTokenSymbol}: ${impactRatio} expected ${recommendedSwapConfig.expectedSwapImpactRatio}`
    );
  }

  if (negativeSwapImpactFactor.lt(recommendedSwapConfig.negativeImpactFactor)) {
    errors.push({
      message: `Invalid negativeSwapImpactFactor for ${longTokenSymbol}`,
      expected: recommendedSwapConfig.negativeImpactFactor,
      actual: negativeSwapImpactFactor,
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

  if (maxBorrowingFactorForLongsPerYear.gt(decimalToFloat(1))) {
    throw new Error("maxBorrowingFactorForLongsPerYear is more than 100%");
  }

  console.log(`    maxBorrowingFactorForLongsPerYear: ${formatAmount(maxBorrowingFactorForLongsPerYear, 28)}%`);

  const maxShortTokenPoolUsdBasedOnMaxOpenInterest = maxOpenInterestForShorts
    .mul(FLOAT_PRECISION)
    .div(openInterestReserveFactorShorts);
  const maxBorrowingFactorForShortsPerYear = pow(maxOpenInterestForShorts, borrowingExponentFactorForShorts)
    .mul(borrowingFactorForShorts)
    .div(maxShortTokenPoolUsdBasedOnMaxOpenInterest)
    .mul(SECONDS_PER_YEAR);

  if (maxBorrowingFactorForShortsPerYear.gt(decimalToFloat(1))) {
    throw new Error("maxBorrowingFactorForShortsPerYear is more than 100%");
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
