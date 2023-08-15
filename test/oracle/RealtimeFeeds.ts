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

    await dataStore.setBytes32(keys.realtimeFeedIdKey(wbtc.address), hashString("WBTC"));

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        ...baseSetPricesParams,
        realtimeFeedTokens: [wnt.address, wbtc.address],
        realtimeFeedData: [
          encodeRealtimeData({ ...baseRealtimeData, feedId: hashString("WNT") }),
          encodeRealtimeData({ ...baseRealtimeData, feedId: hashString("WBTC2") }),
        ],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeFeedId")
      .withArgs(wbtc.address, hashString("WBTC2"), hashString("WBTC"));

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

  it("sets prices with realtime feeds", async () => {
    const block = await provider.getBlock();
    const baseRealtimeData = getBaseRealtimeData(block);

    await dataStore.setBytes32(keys.realtimeFeedIdKey(wnt.address), hashString("WNT"));
    await dataStore.setBytes32(keys.realtimeFeedIdKey(wbtc.address), hashString("WBTC"));

    await dataStore.setUint(keys.realtimeFeedMultiplierKey(wnt.address), expandDecimals(1, 34));
    await dataStore.setUint(keys.realtimeFeedMultiplierKey(wbtc.address), expandDecimals(1, 44));

    await oracle.setPrices(dataStore.address, eventEmitter.address, {
      ...baseSetPricesParams,
      realtimeFeedTokens: [wnt.address, wbtc.address],
      realtimeFeedData: [
        encodeRealtimeData({
          ...baseRealtimeData,
          feedId: hashString("WNT"),
          bid: expandDecimals(5000, 8),
          ask: expandDecimals(5002, 8),
        }),
        encodeRealtimeData({
          ...baseRealtimeData,
          feedId: hashString("WBTC"),
          bid: expandDecimals(75_000, 8),
          ask: expandDecimals(75_020, 8),
        }),
      ],
    });

    expect((await oracle.getPrimaryPrice(wnt.address)).min).eq(expandDecimals(5000, 12));
    expect((await oracle.getPrimaryPrice(wnt.address)).max).eq(expandDecimals(5002, 12));

    expect((await oracle.getPrimaryPrice(wbtc.address)).min).eq(expandDecimals(75_000, 22));
    expect((await oracle.getPrimaryPrice(wbtc.address)).max).eq(expandDecimals(75_020, 22));
  });

  // it("sets prices with regular and realtime feeds", async () => {
  //   const block = await provider.getBlock();
  //   const baseRealtimeData = getBaseRealtimeData(block);
  //
  //   await dataStore.setBytes32(keys.realtimeFeedIdKey(wnt.address), hashString("WNT"));
  //   await dataStore.setBytes32(keys.realtimeFeedIdKey(wbtc.address), hashString("WBTC"));
  //
  //   await dataStore.setUint(keys.realtimeFeedMultiplierKey(wnt.address), expandDecimals(1, 34));
  //   await dataStore.setUint(keys.realtimeFeedMultiplierKey(wbtc.address), expandDecimals(1, 44));
  //
  //   await oracle.setPrices(dataStore.address, eventEmitter.address, {
  //     ...baseSetPricesParams,
  //     realtimeFeedTokens: [wnt.address, wbtc.address],
  //     realtimeFeedData: [
  //       encodeRealtimeData({
  //         ...baseRealtimeData,
  //         feedId: hashString("WNT"),
  //         bid: expandDecimals(5000, 8),
  //         ask: expandDecimals(5002, 8),
  //       }),
  //       encodeRealtimeData({
  //         ...baseRealtimeData,
  //         feedId: hashString("WBTC"),
  //         bid: expandDecimals(75_000, 8),
  //         ask: expandDecimals(75_020, 8),
  //       }),
  //     ],
  //   });
  //
  //   expect((await oracle.getPrimaryPrice(wnt.address)).min).eq(expandDecimals(5000, 12));
  //   expect((await oracle.getPrimaryPrice(wnt.address)).max).eq(expandDecimals(5002, 12));
  //
  //   expect((await oracle.getPrimaryPrice(wbtc.address)).min).eq(expandDecimals(75_000, 22));
  //   expect((await oracle.getPrimaryPrice(wbtc.address)).max).eq(expandDecimals(75_020, 22));
  // });
});
