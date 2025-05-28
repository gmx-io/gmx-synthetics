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
  const TIMESTAMP = 1747034118n;
  const BID = 10569056357735n;
  const ASK = 10569056357735n;
  const PRICE = 10569056357735n;
  const ROUND_ID = 62036512n;

  function encodeReport(feedId: string, bid: BigNumberish, ask: BigNumberish, signature: string, expo: BigNumberish) {
    return encodeData(
      ["string", "uint192", "uint32", "uint32", "uint256", "uint256", "bytes", "int32"],
      [feedId, PRICE, ROUND_ID, TIMESTAMP, bid, ask, signature, expo]
    );
  }

  async function callOraclePrice(overrides?: { feedIdOverride?: string; expoOverride?: BigNumberish }) {
    const feedId = overrides?.feedIdOverride || BTC_USD_FEED_ID;
    const bid = BID;
    const ask = ASK;
    const expo = overrides?.expoOverride || -8n;
    const signature =
      "0xac126b457de59dfdda25c19dde8e78104cf5a6a30613bb8916aef73551cb97710b563a8fe98c6fd5d054a2940ba90af7c66b129b0b2deb841cd1d490bb4ef19e1b";
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
});
