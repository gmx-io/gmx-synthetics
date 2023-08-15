import { expect } from "chai";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

import { hashString } from "../../utils/hash";
import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { encodeRealtimeData } from "../../utils/oracle";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Oracle.RealtimeFeeds", () => {
  const { provider } = ethers;
  let dataStore, eventEmitter, oracle, wnt, wbtc;

  const baseSetPricesParams = {
    signerInfo: 0,
    tokens: [],
    compactedMinOracleBlockNumbers: [],
    compactedMaxOracleBlockNumbers: [],
    compactedOracleTimestamps: [],
    compactedDecimals: [],
    compactedMinPrices: [],
    compactedMinPricesIndexes: [],
    compactedMaxPrices: [],
    compactedMaxPricesIndexes: [],
    signatures: [],
    priceFeedTokens: [],
  };

  const getBaseRealtimeData = (block) => {
    return {
      feedId: hashString("feedId"),
      observationsTimestamp: block.timestamp,
      median: expandDecimals(5000, 8),
      bid: expandDecimals(5000, 8),
      ask: expandDecimals(5000, 8),
      blocknumberUpperBound: block.number,
      upperBlockhash: block.hash,
      blocknumberLowerBound: block.number,
      currentBlockTimestamp: block.timestamp,
    };
  };

  beforeEach(async () => {
    const fixture = await deployFixture();

    ({ dataStore, eventEmitter, oracle, wnt, wbtc } = fixture.contracts);
  });

  it("realtime feed validations", async () => {
    const block = await provider.getBlock();

    const baseRealtimeData = getBaseRealtimeData(block);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address, wbtc.address],
        realtimeFeedData: [encodeRealtimeData(baseRealtimeData)],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeFeedLengths")
      .withArgs(2, 1);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address],
        realtimeFeedData: [encodeRealtimeData(baseRealtimeData)],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "EmptyRealtimeFeedId")
      .withArgs(wnt.address);

    await dataStore.setBytes32(keys.realtimeFeedIdKey(wnt.address), hashString("WNT"));

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address],
        realtimeFeedData: [encodeRealtimeData(baseRealtimeData)],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeFeedId")
      .withArgs(wnt.address, hashString("feedId"), hashString("WNT"));

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address],
        realtimeFeedData: [encodeRealtimeData({ ...baseRealtimeData, feedId: hashString("WNT"), bid: -10, ask: -1 })],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimePrices")
      .withArgs(wnt.address, -10, -1);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address],
        realtimeFeedData: [encodeRealtimeData({ ...baseRealtimeData, feedId: hashString("WNT"), bid: 100, ask: 10 })],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeBidAsk")
      .withArgs(wnt.address, 100, 10);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address],
        realtimeFeedData: [
          encodeRealtimeData({
            ...baseRealtimeData,
            feedId: hashString("WNT"),
            bid: expandDecimals(5000, 8),
            ask: expandDecimals(5002, 8),
          }),
        ],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "EmptyRealtimeFeedMultiplier")
      .withArgs(wnt.address);

    // the number of realtime decimals: 8
    // the number of token decimals for WNT: 18
    // realtimePrice: price * (10 ^ 8)
    // the price per unit of token: realtimePrice / (10 ^ 8) / (10 ^ 18) * (10 ^ 30)
    // e.g. (5000 * (10 ^ 8)) / (10 ^ 8) / (10 ^ 18) * (10 ^ 30) = 5000 * (10 ^ 12)
    // the stored oracle price is: realtimePrice * multiplier / (10 ^ 30)
    // in this case the multiplier should be (10 ^ 22)
    // e.g. (5000 * (10 ^ 8)) * (10 ^ 34) / (10 ^ 30) = 5000 * (10 ^ 12)

    await dataStore.setUint(keys.realtimeFeedMultiplierKey(wnt.address), expandDecimals(1, 34));

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address],
        realtimeFeedData: [
          encodeRealtimeData({
            ...baseRealtimeData,
            feedId: hashString("WNT"),
            bid: expandDecimals(5000, 8),
            ask: expandDecimals(5002, 8),
            upperBlockhash: hashString("block.hash"),
          }),
        ],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeBlockHash")
      .withArgs(wnt.address, hashString("block.hash"), block.hash);

    await time.increase(60 * 60 + 10);
    await mine(1);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address],
        realtimeFeedData: [
          encodeRealtimeData({
            ...baseRealtimeData,
            feedId: hashString("WNT"),
            bid: expandDecimals(5000, 8),
            ask: expandDecimals(5002, 8),
          }),
        ],
      })
    ).to.be.revertedWithCustomError(errorsContract, "RealtimeMaxPriceAgeExceeded");
  });
});
