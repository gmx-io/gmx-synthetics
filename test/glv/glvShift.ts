import { expect } from "chai";
import { ethers } from "hardhat";

import { handleGlvDeposit, createGlvShift, handleGlvShift, getGlvShiftKeys } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";

describe("Glv", () => {
  const { provider } = ethers;
  const { AddressZero, HashZero } = ethers.constants;

  let fixture;
  let user0, user1, user2, user3;
  let reader,
    dataStore,
    roleStore,
    depositVault,
    depositHandler,
    depositStoreUtils,
    ethUsdMarket,
    ethUsdSpotOnlyMarket,
    ethUsdSingleTokenMarket2,
    btcUsdMarket,
    solUsdMarket,
    wnt,
    sol,
    usdc,
    wbtc,
    glvFactory,
    glvHandler,
    glvType,
    ethUsdGlvAddress,
    config;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      reader,
      dataStore,
      roleStore,
      depositVault,
      depositHandler,
      depositStoreUtils,
      ethUsdMarket,
      ethUsdSpotOnlyMarket,
      ethUsdSingleTokenMarket2,
      btcUsdMarket,
      solUsdMarket,
      wnt,
      sol,
      usdc,
      wbtc,
      glvFactory,
      glvHandler,
      config,
      ethUsdGlvAddress,
    } = fixture.contracts);
  });

  it("create glv shift", async () => {
    const tokens = [wnt.address, usdc.address, sol.address];
    const precisions = [8, 18, 8];
    const minPrices = [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
    const maxPrices = [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];

    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
        tokens,
        precisions,
        minPrices,
        maxPrices,
      },
      execute: {
        tokens,
        precisions,
        minPrices,
        maxPrices,
      },
    });

    await createGlvShift(fixture, {
      glv: ethUsdGlvAddress,
      fromMarket: ethUsdMarket,
      toMarket: solUsdMarket,
      marketTokenAmount: expandDecimals(100, 18),
      minMarketTokens: expandDecimals(99, 18),
      executionFee: 500,
    });

    const block = await provider.getBlock("latest");
    const glvShiftKeys = await getGlvShiftKeys(dataStore, 0, 1);
    expect(glvShiftKeys.length).to.eq(1);
    const glvShift = await reader.getGlvShift(dataStore.address, glvShiftKeys[0]);

    expect(glvShift.addresses.glv).eq(ethUsdGlvAddress);
    expect(glvShift.addresses.fromMarket).eq(ethUsdMarket.marketToken);
    expect(glvShift.addresses.toMarket).eq(solUsdMarket.marketToken);
    expect(glvShift.numbers.marketTokenAmount).eq(expandDecimals(100, 18));
    expect(glvShift.numbers.minMarketTokens).eq(expandDecimals(99, 18));
    expect(glvShift.numbers.updatedAtTime).eq(block.timestamp);
    expect(glvShift.numbers.executionFee).eq("500");
  });

  it("execute glv shift", async () => {
    const tokens = [wnt.address, usdc.address, sol.address];
    const precisions = [8, 18, 8];
    const minPrices = [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
    const maxPrices = [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];

    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
        tokens,
        precisions,
        minPrices,
        maxPrices,
      },
      execute: {
        tokens,
        precisions,
        minPrices,
        maxPrices,
      },
    });

    await handleGlvShift(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(100, 18),
        minMarketTokens: expandDecimals(99, 18),
        executionFee: 500,
      },
      execute: {
        glv: ethUsdGlvAddress,
      },
    });
  });
});
