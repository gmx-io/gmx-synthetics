import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import * as keys from "../../utils/keys";
import { expandDecimals } from "../../utils/math";
import { decodeValidatedPrice } from "../../utils/oracle-provider";
import { BigNumberish } from "ethers";
import { encodeData } from "../../utils/hash";
import { ethers } from "hardhat";

describe("EdgeDataStreamProvider", function () {
  let fixture;
  let edgeDataStreamProvider, dataStore, oracle, token;
  const BTC_USD_FEED_ID = "BTCUSD";
  const TIMESTAMP = 1744260903n;
  const BID = 8194357398389n;
  const ASK = 8194362396466n;

  function encodeReport(feedId: string, bid: BigNumberish, ask: BigNumberish, signature: string, expo: BigNumberish) {
    return encodeData(
      ["string", "uint192", "uint32", "uint32", "uint256", "uint256", "bytes", "int32"],
      [feedId, 8194362396466n, 56490146n, TIMESTAMP, bid, ask, signature, expo]
    );
  }

  async function callOraclePrice(overrides?: { feedIdOverride?: string; expoOverride?: BigNumberish }) {
    const feedId = overrides?.feedIdOverride || BTC_USD_FEED_ID;
    const bid = BID;
    const ask = ASK;
    const expo = overrides?.expoOverride || -8n;
    const signature =
      "0x74f634fce6ae2bf6d6b3d93b36276253f15037e12ad5a4c240d823166983d5100c5a21209f3369760d3bd5f55b278e98d9d1875485fd12114d9c1dcdbcbf9c951c";
    const data = encodeReport(feedId, bid, ask, signature, expo);

    const callData = edgeDataStreamProvider.interface.encodeFunctionData("getOraclePrice", [token.address, data]);
    const result = await ethers.provider.call({
      to: edgeDataStreamProvider.address,
      data: callData,
      from: oracle.address,
    });

    return decodeValidatedPrice(result);
  }

  beforeEach(async function () {
    fixture = await deployFixture();
    ({ edgeDataStreamProvider, dataStore, oracle, wbtc: token } = fixture.contracts);

    await dataStore.setBytes32(
      keys.edgeDataStreamIdKey(token.address),
      ethers.utils.formatBytes32String(BTC_USD_FEED_ID)
    );
  });

  it("should call getOraclePrice and return valid params", async function () {
    const decoded = await callOraclePrice();

    expect(decoded.token).to.equal(token.address);
    expect(decoded.min).to.equal(expandDecimals(BID, 22)); // 30 - 8 = 22
    expect(decoded.max).to.equal(expandDecimals(ASK, 22));
    expect(decoded.timestamp).to.equal(TIMESTAMP);
    expect(decoded.provider).to.equal(edgeDataStreamProvider.address);
  });

  it("should revert when non-oracle calls getOraclePrice", async function () {
    const [user] = await ethers.getSigners();
    const data = "0x";

    await expect(
      edgeDataStreamProvider.connect(user).getOraclePrice(token.address, data)
    ).to.be.revertedWithCustomError(edgeDataStreamProvider, "Unauthorized");
  });

  it("should revert when feed ID is not set", async function () {
    await dataStore.setBytes32(keys.edgeDataStreamIdKey(token.address), ethers.utils.formatBytes32String(""));

    try {
      await callOraclePrice();
    } catch (e) {
      expect(e.name).to.eq("EmptyDataStreamFeedId");
    }
  });

  it("should revert when feed ID mismatch", async function () {
    const wrongFeedId = "ETHUSD";

    await dataStore.setBytes32(keys.edgeDataStreamIdKey(token.address), ethers.utils.formatBytes32String(wrongFeedId));

    try {
      await callOraclePrice();
    } catch (e) {
      expect(e.name).to.eq("InvalidDataStreamFeedId");
    }
  });

  it("should revert when expo is negative", async function () {
    try {
      await callOraclePrice({ expoOverride: -31n });
    } catch (e) {
      expect(e.name).to.eq("InvalidEdgeDataStreamExpo");
    }
  });
});
