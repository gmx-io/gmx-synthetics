import hre from "hardhat";
import { decimalToFloat } from "../utils/math";
import * as keys from "../utils/keys";

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

async function main() {
  const tokens = await hre.gmx.getTokens();
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
    if (market.indexToken == ethers.constants.AddressZero) {
      continue;
    }

    const indexTokenSymbol = addressToSymbol[market.indexToken];
    const longTokenSymbol = addressToSymbol[market.longToken];
    const shortTokenSymbol = addressToSymbol[market.shortToken];

    console.log(
      "%s index: %s long: %s short: %s",
      market.marketToken,
      indexTokenSymbol?.padEnd(5) || "(swap only)",
      longTokenSymbol?.padEnd(5),
      shortTokenSymbol?.padEnd(5)
    );
    const recommendedPerpConfig = recommendedMarketConfig[hre.network.name][indexTokenSymbol];

    if (!recommendedPerpConfig || !recommendedPerpConfig.negativeImpactFactor) {
      throw new Error(`Empty recommendedPerpConfig for ${indexTokenSymbol}`);
    }

    const negativePositionImpactFactor = await dataStore.getUint(
      keys.positionImpactFactorKey(market.marketToken, false)
    );
    const positivePositionImpactFactor = await dataStore.getUint(
      keys.positionImpactFactorKey(market.marketToken, true)
    );

    const percentageOfPerpImpactRecommendation = negativePositionImpactFactor
      .mul(100)
      .div(recommendedPerpConfig.negativeImpactFactor);

    console.log(
      `Position impact compared to recommendation: ${
        parseFloat(percentageOfPerpImpactRecommendation.toNumber()) / 100
      }x smallest safe value`
    );

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

    const recommendedSwapConfig =
      recommendedMarketConfig[hre.network.name][longTokenSymbol] ||
      recommendedMarketConfig[hre.network.name][configTokenMapping[hre.network.name][longTokenSymbol]];

    if (!recommendedSwapConfig) {
      throw new Error(`Empty recommendedSwapConfig for ${longTokenSymbol}`);
    }

    const negativeSwapImpactFactor = await dataStore.getUint(keys.swapImpactFactorKey(market.marketToken, false));
    const positiveSwapImpactFactor = await dataStore.getUint(keys.swapImpactFactorKey(market.marketToken, true));

    const percentageOfSwapImpactRecommendation = negativeSwapImpactFactor
      .mul(100)
      .div(recommendedSwapConfig.negativeImpactFactor);

    console.log(
      `Swap impact compared to recommendation: ${
        parseFloat(percentageOfSwapImpactRecommendation.toNumber()) / 100
      }x smallest safe value`
    );

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

  for (const error of errors) {
    console.log(`Error: ${error.message}, expected: ${error.expected.toString()}, actual: ${error.actual.toString()}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
