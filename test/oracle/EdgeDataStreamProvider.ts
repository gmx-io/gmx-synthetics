import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import * as keys from "../../utils/keys";
import { expandDecimals } from "../../utils/math";
import { decodeValidatedPrice } from "../../utils/oracle-provider";
import { BigNumberish } from "ethers";
import { encodeData, keccakString } from "../../utils/hash";
import { ethers } from "hardhat";

describe("EdgeDataStreamProvider", function () {
  let fixture;
  let edgeDataStreamProvider, dataStore, oracle, wbtc, wnt;
  const BTC_USD_FEED_ID = "BTCUSD";
  const ETH_USD_FEED_ID = "ETHUSD";
  const TIMESTAMP = 1750837864n;
  const BID = 10671055000000n;
  const ASK = 10671056000000n;
  const PRICE = 10671056000000n;
  const ROUND_ID = 69643918n;
  const EDGE_DECIMALS = 8;

  function encodeReport(feedId: string, bid: BigNumberish, ask: BigNumberish, signature: string, expo: BigNumberish) {
    return encodeData(
      ["string", "uint192", "uint32", "uint32", "uint256", "uint256", "bytes", "int32"],
      [feedId, PRICE, ROUND_ID, TIMESTAMP, bid, ask, signature, expo]
    );
  }

  async function callOraclePrice(
    token: string,
    overrides?: {
      feedIdOverride?: string;
      expoOverride?: BigNumberish;
      dataOverride?: string;
    }
  ) {
    let data: string;
    if (overrides?.dataOverride) {
      data = overrides.dataOverride;
    } else {
      const feedId = overrides?.feedIdOverride || BTC_USD_FEED_ID;
      const bid = BID;
      const ask = ASK;
      const expo = overrides?.expoOverride || -8n;
      const signature =
        "0x362238f28eb7273f1235d307a147e2ccdef655835566b43a22c5902b9673f64332b206ff569dbdc08e69ff60db64a93189817d8f38e15a8074bc2e2315b6cd0e1c";
      data = encodeReport(feedId, bid, ask, signature, expo);
    }

    const callData = edgeDataStreamProvider.interface.encodeFunctionData("getOraclePrice", [token, data]);
    const result = await ethers.provider.call({
      to: edgeDataStreamProvider.address,
      data: callData,
      from: oracle.address,
    });

    return decodeValidatedPrice(result);
  }

  beforeEach(async function () {
    fixture = await deployFixture();
    ({ edgeDataStreamProvider, dataStore, oracle, wbtc, wnt } = fixture.contracts);

    await dataStore.setBytes32(keys.edgeDataStreamIdKey(wbtc.address), keccakString(BTC_USD_FEED_ID));
    await dataStore.setBytes32(keys.edgeDataStreamIdKey(wnt.address), keccakString(ETH_USD_FEED_ID));

    await dataStore.setUint(keys.edgeDataStreamTokenDecimalsKey(wbtc.address), 8);
    await dataStore.setUint(keys.edgeDataStreamTokenDecimalsKey(wnt.address), 18);
  });

  it("should call getOraclePrice and return valid params", async function () {
    const decoded = await callOraclePrice(wbtc.address);

    const wbtcDecimals = await wbtc.decimals();

    expect(decoded.token).to.equal(wbtc.address);
    // Edge decimals are 8. We want oracle decimals to be 22. So token decimals(8 for WBTC) * price(oracle) decimals will be 30
    expect(decoded.min).to.equal(expandDecimals(BID, 30 - EDGE_DECIMALS - wbtcDecimals));
    expect(decoded.max).to.equal(expandDecimals(ASK, 30 - EDGE_DECIMALS - wbtcDecimals));
    expect(decoded.timestamp).to.equal(TIMESTAMP);
    expect(decoded.provider).to.equal(edgeDataStreamProvider.address);
  });

  it("should call getOraclePrice for weth and return valid decimals", async function () {
    const wethBid = 297693000000n;
    const wethAsk = 297693500000n;
    const data = encodeData(
      ["string", "uint192", "uint32", "uint32", "uint256", "uint256", "bytes", "int32"],
      [
        ETH_USD_FEED_ID,
        297693500000n,
        73114463n,
        1752573186n,
        wethBid,
        wethAsk,
        "0xaeeea3573a30495c0f17d901ffdf8679a38fca9e33e4b0eaeaed441a609d83ee33846a6039473a419189aecefd5f2e3b2ca5741de8995ba7c72a8499e7f8767f1c",
        -8n,
      ]
    );

    const decoded = await callOraclePrice(wnt.address, {
      dataOverride: data,
    });

    const wethDecimals = await wnt.decimals();

    expect(decoded.token).to.equal(wnt.address);
    // Edge decimals are 8. We want oracle decimals to be 22. So token decimals(18 for WETH) * price(oracle) decimals will be 30
    expect(decoded.min).to.equal(expandDecimals(wethBid, 30 - EDGE_DECIMALS - wethDecimals));
    expect(decoded.max).to.equal(expandDecimals(wethAsk, 30 - EDGE_DECIMALS - wethDecimals));
  });

  it("should revert when non-oracle calls getOraclePrice", async function () {
    const [user] = await ethers.getSigners();
    const data = "0x";

    await expect(edgeDataStreamProvider.connect(user).getOraclePrice(wbtc.address, data)).to.be.revertedWithCustomError(
      edgeDataStreamProvider,
      "Unauthorized"
    );
  });

  it("should revert when feed ID is not set", async function () {
    await dataStore.setBytes32(keys.edgeDataStreamIdKey(wbtc.address), ethers.utils.formatBytes32String(""));

    try {
      await callOraclePrice(wbtc.address);
    } catch (e) {
      expect(e.name).to.eq("EmptyDataStreamFeedId");
    }
  });

  it("should revert when feed ID mismatch", async function () {
    const wrongFeedId = "ETHUSD";

    await dataStore.setBytes32(keys.edgeDataStreamIdKey(wbtc.address), ethers.utils.formatBytes32String(wrongFeedId));

    try {
      await callOraclePrice(wbtc.address);
    } catch (e) {
      expect(e.name).to.eq("InvalidDataStreamFeedId");
    }
  });
});
