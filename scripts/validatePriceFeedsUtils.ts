import hre from "hardhat";
import { fetchRealtimeFeedReport } from "../utils/realtimeFeed";
import { expandDecimals } from "../utils/math";
import * as keys from "../utils/keys";

export async function validatePriceFeeds() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const clientId = process.env.REALTIME_FEED_CLIENT_ID;
  const clientSecret = process.env.REALTIME_FEED_CLIENT_SECRET;
  const blockNumber = await hre.ethers.provider.getBlockNumber();

  const tokens = await hre.gmx.getTokens();

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if (!token.realtimeFeedId) {
      console.log(`skipping ${tokenSymbol} as it does not have a realtimeFeedId`);
      continue;
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

    if (storedRealtimeFeedId !== ethers.constants.HashZero) {
      if (storedRealtimeFeedId === token.realtimeFeedId) {
        console.log(`skipping ${tokenSymbol} as the stored realtimeFeedId already matches the config`);
        continue;
      }

      throw new Error(`${tokenSymbol}'s stored realtimeFeedId does not match the config'`);
    }

    const pricePerUnit = report.console.log("report", report);

    // TODO: fetch and validate token decimals with ERC20 contract
  }
}
