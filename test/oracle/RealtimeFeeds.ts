import { expect } from "chai";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

import { deployContract } from "../../utils/deploy";
import { hashString } from "../../utils/hash";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import {
  TOKEN_ORACLE_TYPES,
  signPrices,
  getSignerInfo,
  getCompactedPrices,
  getCompactedPriceIndexes,
  getCompactedDecimals,
  getCompactedOracleBlockNumbers,
  getCompactedOracleTimestamps,
  encodeRealtimeData,
} from "../../utils/oracle";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Oracle.RealtimeFeeds", () => {
  const { provider } = ethers;

  let signer0, signer1, signer2, signer3, signer4, signer7, signer9;
  let dataStore, eventEmitter, oracle, wnt, wbtc;
  let oracleSalt;

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

  const getBaseRealtimeDataForBlockRange = (lowerBlock, upperBlock) => {
    return {
      feedId: hashString("feedId"),
      observationsTimestamp: upperBlock.timestamp,
      median: expandDecimals(5000, 8),
      bid: expandDecimals(5000, 8),
      ask: expandDecimals(5000, 8),
      blocknumberUpperBound: upperBlock.number,
      upperBlockhash: upperBlock.hash,
      blocknumberLowerBound: lowerBlock.number,
      currentBlockTimestamp: upperBlock.timestamp,
    };
  };

  beforeEach(async () => {
    const fixture = await deployFixture();

    ({ signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.accounts);
    ({ dataStore, eventEmitter, oracle, wnt, wbtc } = fixture.contracts);
    ({ oracleSalt } = fixture.props);
  });

  // it("realtime feed validations", async () => {
  //   const block = await provider.getBlock();
  //   const baseRealtimeData = getBaseRealtimeData(block);
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address, wbtc.address],
  //       realtimeFeedData: [encodeRealtimeData(baseRealtimeData)],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeFeedLengths")
  //     .withArgs(2, 1);
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address],
  //       realtimeFeedData: [encodeRealtimeData(baseRealtimeData)],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "EmptyRealtimeFeedId")
  //     .withArgs(wnt.address);
  //
  //   await dataStore.setBytes32(keys.dataStreamFeedIdKey(wnt.address), hashString("WNT"));
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address],
  //       realtimeFeedData: [encodeRealtimeData(baseRealtimeData)],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeFeedId")
  //     .withArgs(wnt.address, hashString("feedId"), hashString("WNT"));
  //
  //   await dataStore.setBytes32(keys.dataStreamFeedIdKey(wbtc.address), hashString("WBTC"));
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address, wbtc.address],
  //       realtimeFeedData: [
  //         encodeRealtimeData({ ...baseRealtimeData, feedId: hashString("WNT") }),
  //         encodeRealtimeData({ ...baseRealtimeData, feedId: hashString("WBTC2") }),
  //       ],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeFeedId")
  //     .withArgs(wbtc.address, hashString("WBTC2"), hashString("WBTC"));
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address],
  //       realtimeFeedData: [encodeRealtimeData({ ...baseRealtimeData, feedId: hashString("WNT"), bid: -10, ask: -1 })],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimePrices")
  //     .withArgs(wnt.address, -10, -1);
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address],
  //       realtimeFeedData: [encodeRealtimeData({ ...baseRealtimeData, feedId: hashString("WNT"), bid: 100, ask: 10 })],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeBidAsk")
  //     .withArgs(wnt.address, 100, 10);
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address],
  //       realtimeFeedData: [
  //         encodeRealtimeData({
  //           ...baseRealtimeData,
  //           feedId: hashString("WNT"),
  //           bid: expandDecimals(5000, 8),
  //           ask: expandDecimals(5002, 8),
  //         }),
  //       ],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "EmptyRealtimeFeedMultiplier")
  //     .withArgs(wnt.address);
  //
  //   await dataStore.setUint(keys.dataStreamMultiplierKey(wnt.address), expandDecimals(1, 34));
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address],
  //       realtimeFeedData: [
  //         encodeRealtimeData({
  //           ...baseRealtimeData,
  //           feedId: hashString("WNT"),
  //           bid: expandDecimals(5000, 8),
  //           ask: expandDecimals(5002, 8),
  //           upperBlockhash: hashString("block.hash"),
  //         }),
  //       ],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "InvalidRealtimeBlockHash")
  //     .withArgs(wnt.address, hashString("block.hash"), block.hash);
  //
  //   const wntPriceFeed = await deployContract("MockPriceFeed", []);
  //   await dataStore.setAddress(keys.priceFeedKey(wnt.address), wntPriceFeed.address);
  //   await dataStore.setUint(keys.priceFeedMultiplierKey(wnt.address), expandDecimals(1, 42));
  //   await dataStore.setUint(keys.priceFeedHeartbeatDurationKey(wnt.address), 60 * 60);
  //   await dataStore.setUint(keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR, decimalToFloat(5, 1)); // 50%
  //
  //   await wntPriceFeed.setAnswer(12_000);
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address],
  //       realtimeFeedData: [
  //         encodeRealtimeData({
  //           ...baseRealtimeData,
  //           feedId: hashString("WNT"),
  //           bid: expandDecimals(5000, 8),
  //           ask: expandDecimals(5002, 8),
  //         }),
  //       ],
  //     })
  //   ).to.be.revertedWithCustomError(errorsContract, "MaxRefPriceDeviationExceeded");
  //
  //   await wntPriceFeed.setAnswer(10_000);
  //
  //   await time.increase(60 * 60 + 10);
  //   await mine(1);
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address],
  //       realtimeFeedData: [
  //         encodeRealtimeData({
  //           ...baseRealtimeData,
  //           feedId: hashString("WNT"),
  //           bid: expandDecimals(5000, 8),
  //           ask: expandDecimals(5002, 8),
  //         }),
  //       ],
  //     })
  //   ).to.be.revertedWithCustomError(errorsContract, "RealtimeMaxPriceAgeExceeded");
  // });
  //
  // it("sets prices with realtime feeds", async () => {
  //   const block = await provider.getBlock();
  //   const baseRealtimeData = getBaseRealtimeData(block);
  //
  //   await dataStore.setBytes32(keys.dataStreamFeedIdKey(wnt.address), hashString("WNT"));
  //   await dataStore.setBytes32(keys.dataStreamFeedIdKey(wbtc.address), hashString("WBTC"));
  //
  //   await dataStore.setUint(keys.dataStreamMultiplierKey(wnt.address), expandDecimals(1, 34));
  //   await dataStore.setUint(keys.dataStreamMultiplierKey(wbtc.address), expandDecimals(1, 44));
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
  //
  // it("sets prices with regular and realtime feeds", async () => {
  //   const block = await provider.getBlock();
  //   const baseRealtimeData = getBaseRealtimeData(block);
  //
  //   await dataStore.setBytes32(keys.dataStreamFeedIdKey(wnt.address), hashString("WNT"));
  //   await dataStore.setUint(keys.dataStreamMultiplierKey(wnt.address), expandDecimals(1, 34));
  //
  //   const wbtcMinPrices = [60100, 60101, 60102, 60110, 60200, 60300, 60500];
  //   const wbtcMaxPrices = [60100, 60101, 60102, 60510, 60700, 60800, 60900];
  //
  //   const wbtcSignatures = await signPrices({
  //     signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
  //     salt: oracleSalt,
  //     minOracleBlockNumber: block.number,
  //     maxOracleBlockNumber: block.number,
  //     oracleTimestamp: block.timestamp,
  //     blockHash: block.hash,
  //     token: wbtc.address,
  //     tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
  //     precision: 2,
  //     minPrices: wbtcMinPrices,
  //     maxPrices: wbtcMaxPrices,
  //   });
  //
  //   const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
  //
  //   await oracle.setPrices(dataStore.address, eventEmitter.address, {
  //     priceFeedTokens: [],
  //     realtimeFeedTokens: [],
  //     realtimeFeedData: [],
  //     signerInfo,
  //     tokens: [wbtc.address],
  //     compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number]),
  //     compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number]),
  //     compactedOracleTimestamps: getCompactedOracleTimestamps([block.timestamp]),
  //     compactedDecimals: getCompactedDecimals([2]),
  //     compactedMinPrices: getCompactedPrices(wbtcMinPrices),
  //     compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
  //     compactedMaxPrices: getCompactedPrices(wbtcMaxPrices),
  //     compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
  //     signatures: wbtcSignatures,
  //     realtimeFeedTokens: [wnt.address],
  //     realtimeFeedData: [
  //       encodeRealtimeData({
  //         ...baseRealtimeData,
  //         feedId: hashString("WNT"),
  //         bid: expandDecimals(5000, 8),
  //         ask: expandDecimals(5002, 8),
  //       }),
  //     ],
  //   });
  //
  //   expect((await oracle.getPrimaryPrice(wnt.address)).min).eq(expandDecimals(5000, 12));
  //   expect((await oracle.getPrimaryPrice(wnt.address)).max).eq(expandDecimals(5002, 12));
  //
  //   expect((await oracle.getPrimaryPrice(wbtc.address)).min).eq(6011000);
  //   expect((await oracle.getPrimaryPrice(wbtc.address)).max).eq(6051000);
  // });
  //
  // it("requires block numbers to be overlapping", async () => {
  //   await mine(10);
  //
  //   const block = await provider.getBlock();
  //   const block0 = await provider.getBlock(block.number - 5);
  //   const block1 = await provider.getBlock(block.number - 4);
  //   const block2 = await provider.getBlock(block.number - 3);
  //   const block3 = await provider.getBlock(block.number - 2);
  //   const block4 = await provider.getBlock(block.number - 1);
  //   const block5 = block;
  //
  //   await dataStore.setBytes32(keys.dataStreamFeedIdKey(wnt.address), hashString("WNT"));
  //   await dataStore.setBytes32(keys.dataStreamFeedIdKey(wbtc.address), hashString("WBTC"));
  //
  //   await dataStore.setUint(keys.dataStreamMultiplierKey(wnt.address), expandDecimals(1, 34));
  //   await dataStore.setUint(keys.dataStreamMultiplierKey(wbtc.address), expandDecimals(1, 44));
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address, wbtc.address],
  //       realtimeFeedData: [
  //         encodeRealtimeData({
  //           ...getBaseRealtimeDataForBlockRange(block0, block3),
  //           feedId: hashString("WNT"),
  //           bid: expandDecimals(5000, 8),
  //           ask: expandDecimals(5002, 8),
  //         }),
  //         encodeRealtimeData({
  //           ...getBaseRealtimeDataForBlockRange(block4, block5),
  //           feedId: hashString("WBTC"),
  //           bid: expandDecimals(75_000, 8),
  //           ask: expandDecimals(75_020, 8),
  //         }),
  //       ],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "InvalidBlockRangeSet")
  //     .withArgs(block4.number, block3.number);
  //
  //   await expect(
  //     oracle.setPrices(dataStore.address, eventEmitter.address, {
  //       ...baseSetPricesParams,
  //       realtimeFeedTokens: [wnt.address, wbtc.address],
  //       realtimeFeedData: [
  //         encodeRealtimeData({
  //           ...getBaseRealtimeDataForBlockRange(block1, block2),
  //           feedId: hashString("WNT"),
  //           bid: expandDecimals(5000, 8),
  //           ask: expandDecimals(5002, 8),
  //         }),
  //         encodeRealtimeData({
  //           ...getBaseRealtimeDataForBlockRange(block0, block0),
  //           feedId: hashString("WBTC"),
  //           bid: expandDecimals(75_000, 8),
  //           ask: expandDecimals(75_020, 8),
  //         }),
  //       ],
  //     })
  //   )
  //     .to.be.revertedWithCustomError(errorsContract, "InvalidBlockRangeSet")
  //     .withArgs(block1.number, block0.number);
  //
  //   await oracle.setPrices(dataStore.address, eventEmitter.address, {
  //     ...baseSetPricesParams,
  //     realtimeFeedTokens: [wnt.address, wbtc.address],
  //     realtimeFeedData: [
  //       encodeRealtimeData({
  //         ...getBaseRealtimeDataForBlockRange(block0, block3),
  //         feedId: hashString("WNT"),
  //         bid: expandDecimals(5000, 8),
  //         ask: expandDecimals(5002, 8),
  //       }),
  //       encodeRealtimeData({
  //         ...getBaseRealtimeDataForBlockRange(block3, block4),
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
  //
  //   await oracle.clearAllPrices();
  //
  //   await oracle.setPrices(dataStore.address, eventEmitter.address, {
  //     ...baseSetPricesParams,
  //     realtimeFeedTokens: [wnt.address, wbtc.address],
  //     realtimeFeedData: [
  //       encodeRealtimeData({
  //         ...getBaseRealtimeDataForBlockRange(block0, block5),
  //         feedId: hashString("WNT"),
  //         bid: expandDecimals(5000, 8),
  //         ask: expandDecimals(5002, 8),
  //       }),
  //       encodeRealtimeData({
  //         ...getBaseRealtimeDataForBlockRange(block1, block2),
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
  //
  //   await oracle.clearAllPrices();
  //
  //   await oracle.setPrices(dataStore.address, eventEmitter.address, {
  //     ...baseSetPricesParams,
  //     realtimeFeedTokens: [wnt.address, wbtc.address],
  //     realtimeFeedData: [
  //       encodeRealtimeData({
  //         ...getBaseRealtimeDataForBlockRange(block3, block3),
  //         feedId: hashString("WNT"),
  //         bid: expandDecimals(5000, 8),
  //         ask: expandDecimals(5002, 8),
  //       }),
  //       encodeRealtimeData({
  //         ...getBaseRealtimeDataForBlockRange(block1, block3),
  //         feedId: hashString("WBTC"),
  //         bid: expandDecimals(75_000, 8),
  //         ask: expandDecimals(75_020, 8),
  //       }),
  //     ],
  //   });
  // });
});
