import hre from "hardhat";
import { fetchRealtimeFeedReport } from "../utils/realtimeFeed";
import { expandDecimals, formatAmount } from "../utils/math";
import { validateTokens } from "./validateTokenUtils";
import { fetchTickerPrices } from "../utils/prices";
import * as keys from "../utils/keys";

const expectedRealtimeFeedIds = {
  arbitrum: {
    USDC: "0x95241f154d34539741b19ce4bae815473fd1b2a90ac3b4b023a692f31edfe90e",
    "USDC.e": "0x95241f154d34539741b19ce4bae815473fd1b2a90ac3b4b023a692f31edfe90e",
    USDT: "0x297cc1e1ee5fc2f45dff1dd11a46694567904f4dbc596c7cc216d6c688605a1b",
  },
};

async function validateRealtimeFeedConfig({
  token,
  tokenSymbol,
  dataStore,
  blockNumber,
  clientId,
  clientSecret,
  tickerPrices,
}) {
  if (
    expectedRealtimeFeedIds[hre.network.name] &&
    expectedRealtimeFeedIds[hre.network.name][tokenSymbol] &&
    expectedRealtimeFeedIds[hre.network.name][tokenSymbol] !== token.realtimeFeedId
  ) {
    throw new Error(`realtimeFeedId for ${tokenSymbol} does not match expected value`);
  }

  if (!token.address) {
    throw new Error(`token ${tokenSymbol} has no address`);
  }

  if (!token.decimals) {
    throw new Error(`token ${tokenSymbol} has no decimals`);
  }

  if (!token.realtimeFeedDecimals) {
    throw new Error(`token ${tokenSymbol} has no realtimeFeedDecimals`);
  }

  const realtimeFeedMultiplier = expandDecimals(1, 60 - token.decimals - token.realtimeFeedDecimals);
  const report = await fetchRealtimeFeedReport({ feedId: token.realtimeFeedId, blockNumber, clientId, clientSecret });

  const storedRealtimeFeedId = await dataStore.getBytes32(keys.realtimeFeedIdKey(token.address));

  const pricePerUnit = {
    min: report.minPrice.mul(realtimeFeedMultiplier).div(expandDecimals(1, 30)),
    max: report.maxPrice.mul(realtimeFeedMultiplier).div(expandDecimals(1, 30)),
    median: report.medianPrice.mul(realtimeFeedMultiplier).div(expandDecimals(1, 30)),
  };

  const pricePerToken = {
    min: pricePerUnit.min.mul(expandDecimals(1, token.decimals)),
    max: pricePerUnit.max.mul(expandDecimals(1, token.decimals)),
    median: pricePerUnit.median.mul(expandDecimals(1, token.decimals)),
  };

  const tickerPrice = tickerPrices[token.address.toLowerCase()];
  if (!tickerPrice) {
    throw new Error(`could not fetch ticker price for ${tokenSymbol}`);
  }

  const minMaxSpread = pricePerUnit.max.sub(pricePerUnit.min).mul(10_000).div(pricePerUnit.min);

  if (minMaxSpread.gt(50)) {
    throw new Error("minMaxSpread exceeds 0.5%");
  }

  const tickerPricePerToken = {
    min: tickerPrice.min.mul(expandDecimals(1, token.decimals)),
    max: tickerPrice.max.mul(expandDecimals(1, token.decimals)),
  };

  const tickerSpreadMin = pricePerToken.min.sub(tickerPricePerToken.min).mul(10_000).div(tickerPricePerToken.min).abs();

  const tickerSpreadMax = pricePerToken.min.sub(tickerPricePerToken.min).mul(10_000).div(tickerPricePerToken.max).abs();

  if (tickerSpreadMin.gt(50)) {
    throw new Error("tickerSpreadMin exceeds 0.5%");
  }

  if (tickerSpreadMax.gt(50)) {
    throw new Error("tickerSpreadMax exceeds 0.5%");
  }

  console.log(tokenSymbol);
  console.log(
    `    `,
    formatAmount(pricePerToken.min, 30, 4, true),
    formatAmount(pricePerToken.max, 30, 4, true),
    formatAmount(pricePerToken.median, 30, 4, true)
  );
  console.log(
    `    `,
    formatAmount(tickerPricePerToken.min, 30, 4, true),
    formatAmount(tickerPricePerToken.max, 30, 4, true)
  );

  console.log(
    `    `,
    `minMaxSpread: ${formatAmount(minMaxSpread, 2, 2)}%, tickerSpreadMin: ${formatAmount(
      tickerSpreadMin,
      2,
      2
    )}%, tickerSpreadMax: ${formatAmount(tickerSpreadMax, 2, 2)}%`
  );

  if (storedRealtimeFeedId !== ethers.constants.HashZero) {
    if (storedRealtimeFeedId === token.realtimeFeedId) {
      console.log(`skipping ${tokenSymbol} as the stored realtimeFeedId already matches the config`);
      return { shouldUpdate: false };
    }

    throw new Error(`${tokenSymbol}'s stored realtimeFeedId does not match the config'`);
  }

  return { shouldUpdate: true, realtimeFeedMultiplier };
}

export async function validatePriceFeeds() {
  if (process.env.SKIP_TOKEN_VALIDATION === undefined) {
    await validateTokens();
  }

  const dataStore = await hre.ethers.getContract("DataStore");
  const clientId = process.env.REALTIME_FEED_CLIENT_ID;
  const clientSecret = process.env.REALTIME_FEED_CLIENT_SECRET;
  const blockNumber = await hre.ethers.provider.getBlockNumber();

  const tokens = await hre.gmx.getTokens();
  const tickerPrices = await fetchTickerPrices();

  const realtimeFeedConfigs = [];

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if (!token.realtimeFeedId) {
      console.log(`skipping ${tokenSymbol} as it does not have a realtimeFeedId`);
      continue;
    }

    const { shouldUpdate, realtimeFeedMultiplier } = await validateRealtimeFeedConfig({
      token,
      tokenSymbol,
      dataStore,
      blockNumber,
      clientId,
      clientSecret,
      tickerPrices,
    });

    if (shouldUpdate) {
      realtimeFeedConfigs.push({
        token: token.address,
        feedId: token.realtimeFeedId,
        realtimeFeedMultiplier: realtimeFeedMultiplier.toString(),
      });
    }
  }

  console.log(`${realtimeFeedConfigs.length} realtimeFeedConfigs`);
  console.log(realtimeFeedConfigs);
}
