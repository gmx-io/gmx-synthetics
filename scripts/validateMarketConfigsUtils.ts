import hre from "hardhat";
import { decimalToFloat, bigNumberify, formatAmount } from "../utils/math";
import { createMarketConfigByKey, getMarketKey } from "../utils/market";
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

const recommendedStablecoinSwapConfig = {
  negativeImpactFactor: decimalToFloat(1, 9).div(2),
  expectedImpactRatio: 1,
};

const recommendedMarketConfig = {
  arbitrum: {
    BTC: {
      negativeImpactFactor: decimalToFloat(5, 11).div(2),
      expectedImpactRatio: 1,
    },
    WETH: {
      negativeImpactFactor: decimalToFloat(5, 11).div(2),
      expectedImpactRatio: 1,
    },
    LINK: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedImpactRatio: 2,
    },
    ARB: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedImpactRatio: 2,
    },
    UNI: {
      negativeImpactFactor: decimalToFloat(4, 8).div(2),
      expectedImpactRatio: 2,
    },
    LTC: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedImpactRatio: 2,
    },
    DOGE: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedImpactRatio: 2,
    },
    SOL: {
      negativeImpactFactor: decimalToFloat(5, 9).div(2),
      expectedImpactRatio: 2,
    },
    XRP: {
      negativeImpactFactor: decimalToFloat(5, 9).div(2),
      expectedImpactRatio: 2,
    },
  },
  avalanche: {
    "BTC.b": {
      negativeImpactFactor: decimalToFloat(5, 11).div(2),
      expectedImpactRatio: 1,
    },
    "WETH.e": {
      negativeImpactFactor: decimalToFloat(5, 11).div(2),
      expectedImpactRatio: 1,
    },
    WAVAX: {
      negativeImpactFactor: decimalToFloat(1, 8).div(2),
      expectedImpactRatio: 2,
    },
    LTC: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedImpactRatio: 2,
    },
    DOGE: {
      negativeImpactFactor: decimalToFloat(8, 9).div(2),
      expectedImpactRatio: 2,
    },
    SOL: {
      negativeImpactFactor: decimalToFloat(5, 9).div(2),
      expectedImpactRatio: 2,
    },
    XRP: {
      negativeImpactFactor: decimalToFloat(5, 9).div(2),
      expectedImpactRatio: 2,
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

  if (!negativePositionImpactFactor.eq(positivePositionImpactFactor.mul(recommendedPerpConfig.expectedImpactRatio))) {
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

  if (process.env.READ_FROM_CHAIN === "true") {
    negativeSwapImpactFactor = await dataStore.getUint(keys.swapImpactFactorKey(market.marketToken, false));
    positiveSwapImpactFactor = await dataStore.getUint(keys.swapImpactFactorKey(market.marketToken, true));
    swapImpactExponentFactor = await dataStore.getUint(keys.swapImpactExponentFactorKey(market.marketToken));
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

  if (!negativeSwapImpactFactor.eq(positiveSwapImpactFactor.mul(recommendedSwapConfig.expectedImpactRatio))) {
    throw new Error(`Invalid swap impact factors for ${longTokenSymbol}`);
  }

  if (negativeSwapImpactFactor.lt(recommendedSwapConfig.negativeImpactFactor)) {
    errors.push({
      message: `Invalid negativeSwapImpactFactor for ${longTokenSymbol}`,
      expected: recommendedSwapConfig.negativeImpactFactor,
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
