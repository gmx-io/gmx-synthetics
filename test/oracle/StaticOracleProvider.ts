import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import * as keys from "../../utils/keys";
import { expandDecimals } from "../../utils/math";
import { decodeValidatedPrice } from "../../utils/oracle-provider";
import { ethers } from "hardhat";

describe("StaticOracleProvider", function () {
  let fixture;
  let config, staticOracleProvider, dataStore, chainlinkPriceFeedProvider, oracle, wnt;
  let feedId;

  async function getOraclePrice(provider) {
    const callData = provider.interface.encodeFunctionData("getOraclePrice", [wnt.address, "0x"]);

    const result = await ethers.provider.call({
      to: provider.address,
      data: callData,
      from: oracle.address,
    });

    return decodeValidatedPrice(result);
  }

  beforeEach(async function () {
    fixture = await deployFixture();
    ({
      config,
      staticOracle: staticOracleProvider,
      dataStore,
      chainlinkPriceFeedProvider,
      oracle,
      wnt,
    } = fixture.contracts);

    feedId = "0x0000000000000000000000000000000000000000000000000000000000000001";

    await dataStore.setBool(keys.isOracleProviderEnabledKey(staticOracleProvider.address), true);
    await dataStore.setBool(keys.isAtomicOracleProviderKey(chainlinkPriceFeedProvider.address), true);
    await dataStore.setBytes32(keys.dataStreamIdKey(wnt.address), feedId);
    await dataStore.setUint(keys.dataStreamMultiplierKey(wnt.address), expandDecimals(1, 30));
  });

  it("should set static price from chainlink datastream", async function () {
    const bid = 5000000000000000;
    const ask = 5000000000000000;

    try {
      await getOraclePrice(staticOracleProvider);
    } catch (e) {
      expect(e.name).to.eq("StaticPriceNotSet");
    }

    const oraclePriceA = await getOraclePrice(chainlinkPriceFeedProvider);
    expect(oraclePriceA.min).eq(bid);
    expect(oraclePriceA.max).eq(ask);

    const oracleParams = {
      tokens: [wnt.address],
      providers: [chainlinkPriceFeedProvider.address],
      data: ["0x"],
    };

    await config.setStaticPriceForToken(wnt.address, oracleParams);

    const oraclePriceStaticB = await getOraclePrice(staticOracleProvider);
    expect(oraclePriceStaticB.min).eq(bid);
    expect(oraclePriceStaticB.max).eq(ask);
  });
});
