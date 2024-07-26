import { expect } from "chai";
import { ethers } from "hardhat";

import { getGlvAddress } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { encodeData } from "../../utils/hash";

describe("Glv", () => {
  let fixture;
  let dataStore,
    roleStore,
    ethUsdMarket,
    ethUsdSingleTokenMarket2,
    btcUsdMarket,
    solUsdMarket,
    wnt,
    usdc,
    wbtc,
    glvFactory,
    glvHandler,
    ethUsdGlvAddress,
    config,
    reader;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({
      dataStore,
      roleStore,
      ethUsdMarket,
      ethUsdSingleTokenMarket2,
      btcUsdMarket,
      solUsdMarket,
      wnt,
      usdc,
      wbtc,
      glvFactory,
      glvHandler,
      config,
      ethUsdGlvAddress,
      reader,
    } = fixture.contracts);
  });

  it("creates glv vault", async () => {
    const glvType = ethers.constants.HashZero;
    const glvAddress = getGlvAddress(
      wbtc.address,
      usdc.address,
      glvType,
      "Glv name",
      "Glv symbol",
      glvFactory.address,
      roleStore.address,
      dataStore.address
    );
    await glvFactory.createGlv(wbtc.address, usdc.address, glvType, "Glv name", "Glv symbol");
    const glv = await reader.getGlv(dataStore.address, glvAddress);

    expect(glv.longToken).eq(wbtc.address);
    expect(glv.shortToken).eq(usdc.address);
    expect(glv.glvToken).eq(glvAddress);
  });

  it("adds markets to Glv", async () => {
    const glvType = ethers.constants.HashZero.slice(0, -1) + "1"; // to avoid conflict with existing market
    const glvAddress = getGlvAddress(
      wnt.address,
      usdc.address,
      glvType,
      "Glv name",
      "Glv symbol",
      glvFactory.address,
      roleStore.address,
      dataStore.address
    );
    await glvFactory.createGlv(wnt.address, usdc.address, glvType, "Glv name", "Glv symbol");

    const marketListKey = keys.glvSupportedMarketListKey(glvAddress);
    let marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(0);

    await glvHandler.addMarketToGlv(glvAddress, ethUsdMarket.marketToken);
    await glvHandler.addMarketToGlv(glvAddress, solUsdMarket.marketToken);

    marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(2);

    const listedMarkets = await dataStore.getAddressValuesAt(
      keys.glvSupportedMarketListKey(glvAddress),
      0,
      marketListCount
    );
    expect(listedMarkets[0]).eq(ethUsdMarket.marketToken);
    expect(listedMarkets[1]).eq(solUsdMarket.marketToken);
  });

  it("reverts if market is already added", async () => {
    await expect(glvHandler.addMarketToGlv(ethUsdGlvAddress, ethUsdMarket.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvMarketAlreadyExists")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);
  });

  it("reverts if market has incorrect tokens", async () => {
    await expect(glvHandler.addMarketToGlv(ethUsdGlvAddress, btcUsdMarket.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvInvalidLongToken")
      .withArgs(ethUsdGlvAddress, wbtc.address, wnt.address);

    await expect(glvHandler.addMarketToGlv(ethUsdGlvAddress, ethUsdSingleTokenMarket2.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvInvalidShortToken")
      .withArgs(ethUsdGlvAddress, wnt.address, usdc.address);
  });

  it("configure Glv", async () => {
    await config.setUint(
      keys.GLV_MAX_MARKET_TOKEN_BALANCE_USD,
      encodeData(["address", "address"], [ethUsdGlvAddress, ethUsdMarket.marketToken]),
      1
    );
    // TODO add GLV_MAX_MARKET_TOKEN_BALANCE_AMOUNT
    await config.setUint(keys.GLV_SHIFT_MAX_PRICE_IMPACT_FACTOR, encodeData(["address"], [ethUsdGlvAddress]), 1);
  });
});
