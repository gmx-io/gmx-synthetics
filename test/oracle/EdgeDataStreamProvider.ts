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
  const TIMESTAMP = 1742151449n;
  const BID = 8365522090596n;
  const ASK = 8365522590590n;

  function encodeReport(feedId: string, bid: BigNumberish, ask: BigNumberish, signature: string, expo: BigNumberish) {
    return encodeData(
      ["string", "uint192", "uint32", "uint32", "uint256", "uint256", "bytes", "int32"],
      [feedId, 8365522590590n, 52271251n, TIMESTAMP, bid, ask, signature, expo]
    );
  }

  async function callOraclePrice(overrides?: { feedIdOverride?: string; expoOverride?: BigNumberish }) {
    const feedId = overrides?.feedIdOverride || BTC_USD_FEED_ID;
    const bid = BID;
    const ask = ASK;
    const expo = overrides?.expoOverride || -8n;
    const signature =
      "0x001fc991ea2d28a74f24f7ab90c23dd4188afba53c4bafdb91f588af230c00ed1f4c1930e7ae2d025874e8380598eb851987d197cf39c7edba1f0992f9d440a300";
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
