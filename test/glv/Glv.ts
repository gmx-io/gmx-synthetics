import { expect } from "chai";
import { ethers } from "hardhat";

import { getGlvAddress, handleGlvDeposit, handleGlvShift } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { encodeData } from "../../utils/hash";
import { contractAt } from "../../utils/deploy";
import { expandDecimals } from "../../utils/math";
import { expectBalances } from "../../utils/validation";
import { handleDeposit } from "../../utils/deposit";

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
    glvReader;

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
      glvReader,
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
    const glv = await glvReader.getGlv(dataStore.address, glvAddress);

    expect(glv.longToken).eq(wbtc.address);
    expect(glv.shortToken).eq(usdc.address);
    expect(glv.glvToken).eq(glvAddress);

    const glvToken = await contractAt("MarketToken", glvAddress);
    expect(await glvToken.name()).to.be.eq("Glv name");
    expect(await glvToken.symbol()).to.be.eq("Glv symbol");
  });

  it("creates glv vault, single asset markets", async () => {
    const glvType = ethers.constants.HashZero;
    const glvAddress = getGlvAddress(
      wbtc.address,
      wbtc.address,
      glvType,
      "Glv name",
      "Glv symbol",
      glvFactory.address,
      roleStore.address,
      dataStore.address
    );
    await glvFactory.createGlv(wbtc.address, wbtc.address, glvType, "Glv name", "Glv symbol");
    const glv = await glvReader.getGlv(dataStore.address, glvAddress);

    expect(glv.longToken).eq(wbtc.address);
    expect(glv.shortToken).eq(wbtc.address);
    expect(glv.glvToken).eq(glvAddress);

    const glvToken = await contractAt("MarketToken", glvAddress);
    expect(await glvToken.name()).to.be.eq("Glv name");
    expect(await glvToken.symbol()).to.be.eq("Glv symbol");
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

  it("removes markets from Glv", async () => {
    const marketListKey = keys.glvSupportedMarketListKey(ethUsdGlvAddress);
    let marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(2);

    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(100_000, 18),
      },
    });

    let listedMarkets = await dataStore.getAddressValuesAt(marketListKey, 0, marketListCount);
    expect(listedMarkets[0]).eq(ethUsdMarket.marketToken);
    expect(listedMarkets[1]).eq(solUsdMarket.marketToken);

    await expect(
      glvHandler.removeMarketFromGlv(ethUsdGlvAddress, ethUsdMarket.marketToken)
    ).to.be.revertedWithCustomError(errorsContract, "GlvEnabledMarket");

    await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, ethUsdMarket.marketToken), true);
    await expect(
      glvHandler.removeMarketFromGlv(ethUsdGlvAddress, ethUsdMarket.marketToken)
    ).to.be.revertedWithCustomError(errorsContract, "GlvNonZeroMarketBalance");

    await handleGlvShift(fixture, {
      create: {
        marketTokenAmount: expandDecimals(100_000, 18),
      },
    });
    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: 0,
      },
    });
    await glvHandler.removeMarketFromGlv(ethUsdGlvAddress, ethUsdMarket.marketToken);

    marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(1);
    listedMarkets = await dataStore.getAddressValuesAt(marketListKey, 0, marketListCount);
    expect(listedMarkets[0]).eq(solUsdMarket.marketToken);
  });

  it("adds markets to Glv, single asset markets", async () => {
    const glvType = ethers.constants.HashZero;
    const glvAddress = getGlvAddress(
      wnt.address,
      wnt.address,
      glvType,
      "Glv name",
      "Glv symbol",
      glvFactory.address,
      roleStore.address,
      dataStore.address
    );
    await glvFactory.createGlv(wnt.address, wnt.address, glvType, "Glv name", "Glv symbol");

    const marketListKey = keys.glvSupportedMarketListKey(glvAddress);
    let marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(0);

    await glvHandler.addMarketToGlv(glvAddress, ethUsdSingleTokenMarket2.marketToken);

    marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(1);

    const listedMarkets = await dataStore.getAddressValuesAt(
      keys.glvSupportedMarketListKey(glvAddress),
      0,
      marketListCount
    );
    expect(listedMarkets[0]).eq(ethUsdSingleTokenMarket2.marketToken);
  });

  it("reverts if market is already added", async () => {
    await expect(glvHandler.addMarketToGlv(ethUsdGlvAddress, ethUsdMarket.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvMarketAlreadyExists")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);
  });

  it("reverts if max market count exceeded", async () => {
    await dataStore.setUint(keys.GLV_MAX_MARKET_COUNT, 1);
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
    marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(1);

    await expect(glvHandler.addMarketToGlv(glvAddress, solUsdMarket.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvMaxMarketCountExceeded")
      .withArgs(glvAddress, 1);

    await dataStore.setUint(keys.GLV_MAX_MARKET_COUNT, 2);
    await glvHandler.addMarketToGlv(glvAddress, solUsdMarket.marketToken);
    marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(2);
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
