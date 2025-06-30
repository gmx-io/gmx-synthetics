import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import * as keys from "../../utils/keys";
import { expandDecimals } from "../../utils/math";
import { decodeValidatedPrice } from "../../utils/oracle-provider";
import { BigNumberish } from "ethers";
import { encodeData, hashString, keccakString } from "../../utils/hash";
import { ethers } from "hardhat";

describe("EdgeDataStreamProvider", function () {
  let fixture;
  let edgeDataStreamProvider, dataStore, oracle, token;
  const BTC_USD_FEED_ID = "BTCUSD";
  const TIMESTAMP = 1750837864n;
  const BID = 10671055000000n;
  const ASK = 10671056000000n;
  const PRICE = 10671056000000n;
  const ROUND_ID = 69643918n;

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
      "0x362238f28eb7273f1235d307a147e2ccdef655835566b43a22c5902b9673f64332b206ff569dbdc08e69ff60db64a93189817d8f38e15a8074bc2e2315b6cd0e1c";
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

    await dataStore.setBytes32(keys.edgeDataStreamIdKey(token.address), keccakString(BTC_USD_FEED_ID));
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
