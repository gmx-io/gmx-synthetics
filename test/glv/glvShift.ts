import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import {
  handleGlvDeposit,
  handleGlvWithdrawal,
  createGlvShift,
  handleGlvShift,
  getGlvShiftKeys,
  executeGlvShift,
  getGlvShiftCount,
  getGlvAddress,
  setupDistressedGlvMarket,
} from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { expectBalances } from "../../utils/validation";
import { DEFAULT_MARKET_TYPE, getMarketTokenAddress } from "../../utils/market";
import { setBytes32IfDifferent } from "../../utils/dataStore";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { hashString } from "../../utils/hash";

describe("Glv Shifts", () => {
  const { provider } = ethers;

  let fixture;
  let user1;
  let glvReader,
    dataStore,
    ethUsdMarket,
    solUsdMarket,
    btcUsdMarket,
    ethUsdGlvAddress,
    marketFactory,
    roleStore,
    reader,
    glvFactory,
    glvShiftHandler,
    ethUsdSingleTokenMarket2,
    wnt,
    sol,
    usdc,
    wbtc,
    chainlinkDataStreamProvider,
    oracle;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({
      glvReader,
      dataStore,
      ethUsdMarket,
      solUsdMarket,
      btcUsdMarket,
      ethUsdGlvAddress,
      marketFactory,
      roleStore,
      reader,
      glvFactory,
      glvShiftHandler,
      ethUsdSingleTokenMarket2,
      sol,
      wnt,
      usdc,
      wbtc,
      chainlinkDataStreamProvider,
      oracle,
    } = fixture.contracts);

    ({ user1 } = fixture.accounts);
  });

  it("create glv shift", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
      },
    });

    await createGlvShift(fixture, {
      glv: ethUsdGlvAddress,
      fromMarket: ethUsdMarket,
      toMarket: solUsdMarket,
      marketTokenAmount: expandDecimals(100, 18),
      minMarketTokens: expandDecimals(99, 18),
    });

    const block = await provider.getBlock("latest");
    const glvShiftKeys = await getGlvShiftKeys(dataStore, 0, 1);
    expect(glvShiftKeys.length).to.eq(1);
    const glvShift = await glvReader.getGlvShift(dataStore.address, glvShiftKeys[0]);

    expect(glvShift.addresses.glv).eq(ethUsdGlvAddress);
    expect(glvShift.addresses.fromMarket).eq(ethUsdMarket.marketToken);
    expect(glvShift.addresses.toMarket).eq(solUsdMarket.marketToken);
    expect(glvShift.numbers.marketTokenAmount).eq(expandDecimals(100, 18));
    expect(glvShift.numbers.minMarketTokens).eq(expandDecimals(99, 18));
    expect(glvShift.numbers.updatedAtTime).eq(block.timestamp);
  });

  describe("create glv shift, validations", () => {
    const params = {
      glv: ethUsdGlvAddress,
      fromMarket: ethUsdMarket,
      toMarket: solUsdMarket,
      marketTokenAmount: expandDecimals(100, 18),
      minMarketTokens: expandDecimals(99, 18),
    };

    it("EmptyGlv", async () => {
      const badGlvAddress = ethers.constants.AddressZero.slice(0, -1) + "C";
      await expect(createGlvShift(fixture, { ...params, glv: badGlvAddress }))
        .to.be.revertedWithCustomError(errorsContract, "EmptyGlv")
        .withArgs(badGlvAddress);
    });

    it("GlvUnsupportedMarket", async () => {
      await expect(createGlvShift(fixture, { ...params, fromMarket: btcUsdMarket }))
        .to.be.revertedWithCustomError(errorsContract, "GlvUnsupportedMarket")
        .withArgs(ethUsdGlvAddress, btcUsdMarket.marketToken);

      await expect(createGlvShift(fixture, { ...params, toMarket: btcUsdMarket }))
        .to.be.revertedWithCustomError(errorsContract, "GlvUnsupportedMarket")
        .withArgs(ethUsdGlvAddress, btcUsdMarket.marketToken);
    });

    it("ShiftFromAndToMarketAreEqual", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });

      await expect(createGlvShift(fixture, { fromMarket: ethUsdMarket, toMarket: ethUsdMarket }))
        .to.be.revertedWithCustomError(errorsContract, "ShiftFromAndToMarketAreEqual")
        .withArgs(ethUsdMarket.marketToken);
    });

    it("GlvDisabledMarket", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
          market: solUsdMarket,
        },
      });

      await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, solUsdMarket.marketToken), true);
      await expect(createGlvShift(fixture, params))
        .to.be.revertedWithCustomError(errorsContract, "GlvDisabledMarket")
        .withArgs(ethUsdGlvAddress, solUsdMarket.marketToken);

      // the opposite is okay
      // it is possible to move liquidity FROM disabled market
      await createGlvShift(fixture, { fromMarket: solUsdMarket, toMarket: ethUsdMarket });
    });

    it("GlvInsufficientMarketTokenBalance", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });

      await expect(createGlvShift(fixture, { params, marketTokenAmount: expandDecimals(10001, 18) }))
        .to.be.revertedWithCustomError(errorsContract, "GlvInsufficientMarketTokenBalance")
        .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken, expandDecimals(10000, 18), expandDecimals(10001, 18));

      await createGlvShift(fixture, { params, marketTokenAmount: expandDecimals(10000, 18) });
    });
  });

  it("execute glv shift", async () => {
    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: 0,
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(10000, 18),
        [solUsdMarket.marketToken]: 0,
      },
    });

    const { executeResult } = await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(1000, 18),
        minMarketTokens: expandDecimals(1000, 18),
      },
      execute: {
        gasUsageLabel: "executeGlvShift",
      },
    });

    const glvValueUpdatedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvValueUpdated");
    expect(glvValueUpdatedLog, "GlvValueUpdated log").to.not.be.undefined;
    expect(glvValueUpdatedLog.parsedEventData.value).eq(expandDecimals(10000, 30));
    expect(glvValueUpdatedLog.parsedEventData.supply).eq(expandDecimals(10000, 18));

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
        [solUsdMarket.marketToken]: expandDecimals(1000, 18),
      },
    });
  });

  it("execute glv shift with oracle GLV price", async () => {
    const oracleTypeKey = keys.oracleTypeKey(ethUsdGlvAddress);
    await setBytes32IfDifferent(oracleTypeKey, TOKEN_ORACLE_TYPES.DEFAULT, "oracle type");
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, ethUsdGlvAddress),
      chainlinkDataStreamProvider.address
    );

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: 0,
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(10000, 18),
        [solUsdMarket.marketToken]: 0,
      },
    });

    const { executeResult } = await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(1000, 18),
        minMarketTokens: expandDecimals(1000, 18),
      },
      execute: {
        tokens: [wnt.address, usdc.address, sol.address, ethUsdGlvAddress],
        precisions: [8, 18, 8, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4), expandDecimals(1, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4), expandDecimals(1, 4)],
      },
    });

    const glvValueUpdatedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvValueUpdated");
    expect(glvValueUpdatedLog.parsedEventData.value).eq(expandDecimals(10000, 30));

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
        [solUsdMarket.marketToken]: expandDecimals(1000, 18),
      },
    });
  });

  it("execute glv shift if unrelated market has negative pool value", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    await setupDistressedGlvMarket(fixture);

    const { executeResult } = await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(1000, 18),
        minMarketTokens: expandDecimals(1000, 18),
      },
    });

    const glvShiftExecutedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvShiftExecuted");
    expect(glvShiftExecutedLog, "GlvShiftExecuted log").to.not.be.undefined;

    const glvValueUpdatedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvValueUpdated");
    expect(glvValueUpdatedLog, "GlvValueUpdated log").to.be.undefined;

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
        [solUsdMarket.marketToken]: expandDecimals(1000, 18),
      },
    });
  });

  it("execute glv shift if unrelated market has zero pool value and open interest", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    const marketType = hashString("zero-pool-borrowing-market");
    await marketFactory.createMarket(sol.address, wnt.address, usdc.address, marketType);
    const zeroPoolMarketAddress = getMarketTokenAddress(
      sol.address,
      wnt.address,
      usdc.address,
      marketType,
      marketFactory.address,
      roleStore.address,
      dataStore.address
    );
    await glvShiftHandler.addMarketToGlv(ethUsdGlvAddress, zeroPoolMarketAddress);

    const marketToken = await ethers.getContractAt("MarketToken", zeroPoolMarketAddress);
    await marketToken.mint(ethUsdGlvAddress, expandDecimals(1, 18));
    const glvToken = await ethers.getContractAt("GlvToken", ethUsdGlvAddress);
    await glvToken.syncTokenBalance(zeroPoolMarketAddress);

    await dataStore.setUint(keys.openInterestKey(zeroPoolMarketAddress, wnt.address, true), decimalToFloat(600));
    await dataStore.setUint(
      keys.openInterestInTokensKey(zeroPoolMarketAddress, wnt.address, true),
      expandDecimals(1, 18)
    );

    const { executeResult } = await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(1000, 18),
        minMarketTokens: expandDecimals(1000, 18),
      },
    });

    const glvShiftExecutedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvShiftExecuted");
    expect(glvShiftExecutedLog, "GlvShiftExecuted log").to.not.be.undefined;

    const glvValueUpdatedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvValueUpdated");
    expect(glvValueUpdatedLog, "GlvValueUpdated log").to.not.be.undefined;

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
        [solUsdMarket.marketToken]: expandDecimals(1000, 18),
        [zeroPoolMarketAddress]: expandDecimals(1, 18),
      },
    });
  });

  it("execute glv shift with oracle GLV price if unrelated market has negative pool value", async () => {
    const oracleTypeKey = keys.oracleTypeKey(ethUsdGlvAddress);
    await setBytes32IfDifferent(oracleTypeKey, TOKEN_ORACLE_TYPES.DEFAULT, "oracle type");
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, ethUsdGlvAddress),
      chainlinkDataStreamProvider.address
    );

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    await setupDistressedGlvMarket(fixture);

    const { executeResult } = await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(1000, 18),
        minMarketTokens: expandDecimals(1000, 18),
      },
      execute: {
        tokens: [wnt.address, usdc.address, sol.address, ethUsdGlvAddress],
        precisions: [8, 18, 8, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4), expandDecimals(1, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4), expandDecimals(1, 4)],
      },
    });

    const glvValueUpdatedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvValueUpdated");
    expect(glvValueUpdatedLog, "GlvValueUpdated log").to.not.be.undefined;
    expect(glvValueUpdatedLog.parsedEventData.value).eq(expandDecimals(10000, 30));

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
        [solUsdMarket.marketToken]: expandDecimals(1000, 18),
      },
    });
  });

  it("getGlvValue reverts if a market has negative pool value", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    const distressedMarket = await setupDistressedGlvMarket(fixture);

    const getPriceProp = (price, decimals) => ({
      min: expandDecimals(price, decimals),
      max: expandDecimals(price, decimals),
    });

    await expect(
      glvReader.getGlvValue(
        dataStore.address,
        [ethUsdMarket.marketToken, solUsdMarket.marketToken, distressedMarket],
        [getPriceProp(5000, 12), getPriceProp(600, 12), getPriceProp(600, 12)],
        getPriceProp(5000, 12),
        getPriceProp(1, 24),
        ethUsdGlvAddress,
        true
      )
    )
      .to.be.revertedWithCustomError(errorsContract, "GlvNegativeMarketPoolValue")
      .withArgs(ethUsdGlvAddress, distressedMarket);

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
      execute: {
        expectedCancellationReason: "GlvNegativeMarketPoolValue",
      },
    });

    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: expandDecimals(100, 18),
      },
      execute: {
        expectedCancellationReason: "GlvNegativeMarketPoolValue",
      },
    });
  });

  it("execute glv shift fails if index price for a supported market is missing", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    await marketFactory.createMarket(wbtc.address, wnt.address, usdc.address, DEFAULT_MARKET_TYPE);
    const btcMarketAddress = getMarketTokenAddress(
      wbtc.address,
      wnt.address,
      usdc.address,
      DEFAULT_MARKET_TYPE,
      marketFactory.address,
      roleStore.address,
      dataStore.address
    );
    await glvShiftHandler.addMarketToGlv(ethUsdGlvAddress, btcMarketAddress);

    await createGlvShift(fixture, {
      fromMarket: ethUsdMarket,
      toMarket: solUsdMarket,
      marketTokenAmount: expandDecimals(1000, 18),
      minMarketTokens: expandDecimals(1000, 18),
    });

    await expect(executeGlvShift(fixture, {}))
      .to.be.revertedWithCustomError(errorsContract, "EmptyPrimaryPrice")
      .withArgs(wbtc.address);
  });

  it("execute glv shift does not require prices for markets after a distressed market", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    await setupDistressedGlvMarket(fixture);

    await marketFactory.createMarket(wbtc.address, wnt.address, usdc.address, DEFAULT_MARKET_TYPE);
    const btcMarketAddress = getMarketTokenAddress(
      wbtc.address,
      wnt.address,
      usdc.address,
      DEFAULT_MARKET_TYPE,
      marketFactory.address,
      roleStore.address,
      dataStore.address
    );
    await glvShiftHandler.addMarketToGlv(ethUsdGlvAddress, btcMarketAddress);

    const { executeResult } = await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(1000, 18),
        minMarketTokens: expandDecimals(1000, 18),
      },
    });

    const glvShiftExecutedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvShiftExecuted");
    expect(glvShiftExecutedLog, "GlvShiftExecuted log").to.not.be.undefined;
    const glvValueUpdatedLog = executeResult.logs.find((log) => log.parsedEventInfo?.eventName === "GlvValueUpdated");
    expect(glvValueUpdatedLog, "GlvValueUpdated log").to.be.undefined;

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
        [solUsdMarket.marketToken]: expandDecimals(1000, 18),
      },
    });
  });

  it("glv deposits resume after a distressed market is removed", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    const distressedMarket = await setupDistressedGlvMarket(fixture);

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
      execute: {
        expectedCancellationReason: "GlvNegativeMarketPoolValue",
      },
    });

    await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, distressedMarket), true);
    await dataStore.setUint(
      keys.glvMarketRemovalDustThresholdKey(ethUsdGlvAddress, distressedMarket),
      expandDecimals(1, 18)
    );
    await glvShiftHandler.removeMarketFromGlv(ethUsdGlvAddress, distressedMarket);

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });
  });

  it("execute glv shift, single asset", async () => {
    await marketFactory.createMarket(sol.address, wnt.address, wnt.address, DEFAULT_MARKET_TYPE);

    const solUsdSingleTokenMarket2Address = getMarketTokenAddress(
      sol.address,
      wnt.address,
      wnt.address,
      DEFAULT_MARKET_TYPE,
      marketFactory.address,
      roleStore.address,
      dataStore.address
    );
    const solUsdSingleTokenMarket2 = await reader.getMarket(dataStore.address, solUsdSingleTokenMarket2Address);
    await dataStore.setUint(
      keys.maxPoolAmountKey(solUsdSingleTokenMarket2.marketToken, wnt.address),
      expandDecimals(5, 18)
    );
    await dataStore.setUint(
      keys.maxPoolUsdForDepositKey(solUsdSingleTokenMarket2.marketToken, wnt.address),
      decimalToFloat(10_000)
    );

    const glvType = ethers.constants.HashZero;
    const ethUsdSingleTokenGlvAddress = getGlvAddress(
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
    await glvShiftHandler.addMarketToGlv(ethUsdSingleTokenGlvAddress, ethUsdSingleTokenMarket2.marketToken);
    await glvShiftHandler.addMarketToGlv(ethUsdSingleTokenGlvAddress, solUsdSingleTokenMarket2.marketToken);

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdSingleTokenMarket2.marketToken]: 0,
        [solUsdSingleTokenMarket2.marketToken]: 0,
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdSingleTokenGlvAddress,
        market: ethUsdSingleTokenMarket2,
        longTokenAmount: expandDecimals(1, 18),
      },
    });

    await expectBalances({
      [ethUsdSingleTokenGlvAddress]: {
        [ethUsdSingleTokenMarket2.marketToken]: expandDecimals(5000, 18),
        [solUsdSingleTokenMarket2.marketToken]: 0,
      },
    });

    await handleGlvShift(fixture, {
      create: {
        glv: ethUsdSingleTokenGlvAddress,
        fromMarket: ethUsdSingleTokenMarket2,
        toMarket: solUsdSingleTokenMarket2,
        marketTokenAmount: expandDecimals(2000, 18),
        minMarketTokens: expandDecimals(2000, 18),
      },
    });

    await expectBalances({
      [ethUsdSingleTokenGlvAddress]: {
        [ethUsdSingleTokenMarket2.marketToken]: expandDecimals(3000, 18),
        [solUsdSingleTokenMarket2.marketToken]: expandDecimals(2000, 18),
      },
    });
  });

  describe("execute glv shift, validations", () => {
    it("GlvShiftNotFound", async () => {
      const key = ethers.constants.HashZero.slice(0, -1) + "f";
      await expect(executeGlvShift(fixture, { key }))
        .to.be.revertedWithCustomError(errorsContract, "GlvShiftNotFound")
        .withArgs(key);
    });

    describe("with initial deposit", () => {
      // just to avoid copy-pasting `handleGlvDeposit` in all tests
      beforeEach(async () => {
        await handleGlvDeposit(fixture, {
          create: {
            longTokenAmount: expandDecimals(1, 18),
            shortTokenAmount: expandDecimals(5000, 6),
          },
        });
      });

      it("MinMarketTokens", async () => {
        await handleGlvShift(fixture, {
          create: {
            marketTokenAmount: expandDecimals(1000, 18),
            minMarketTokens: expandDecimals(1001, 18),
          },
          execute: {
            expectedCancellationReason: {
              name: "MinMarketTokens",
              args: [expandDecimals(1000, 18), expandDecimals(1001, 18)],
            },
          },
        });

        await handleGlvShift(fixture, {
          create: {
            marketTokenAmount: expandDecimals(1000, 18),
            minMarketTokens: expandDecimals(1000, 18),
          },
        });
      });

      it("GlvShiftIntervalNotYetPassed", async () => {
        const params = {
          marketTokenAmount: expandDecimals(1000, 18),
          minMarketTokens: expandDecimals(1000, 18),
        };

        expect(await dataStore.getUint(keys.glvShiftMinIntervalKey(ethUsdGlvAddress))).to.be.eq(0);
        // can execute multiple shifts in a row
        await handleGlvShift(fixture, { create: params });
        await handleGlvShift(fixture, { create: params });

        await createGlvShift(fixture, params);
        await createGlvShift(fixture, params);
        await dataStore.setUint(keys.glvShiftMinIntervalKey(ethUsdGlvAddress), 300);
        const lastGlvShiftExecutedAt = await time.latest();

        await expect(createGlvShift(fixture, params)).to.be.revertedWithCustomError(
          errorsContract,
          "GlvShiftIntervalNotYetPassed"
        );

        expect(await getGlvShiftCount(dataStore)).to.be.eq(2);

        await executeGlvShift(fixture, {
          expectedCancellationReason: "GlvShiftIntervalNotYetPassed",
        });

        expect(await getGlvShiftCount(dataStore)).to.be.eq(1);
        await time.setNextBlockTimestamp(lastGlvShiftExecutedAt + 300);
        await executeGlvShift(fixture);
        expect(await getGlvShiftCount(dataStore)).to.be.eq(0);
      });

      it("GlvMaxMarketTokenBalanceUsdExceeded", async () => {
        await dataStore.setUint(
          keys.glvMaxMarketTokenBalanceUsdKey(ethUsdGlvAddress, solUsdMarket.marketToken),
          expandDecimals(999, 30)
        );
        await handleGlvShift(fixture, {
          create: {
            marketTokenAmount: expandDecimals(1000, 18),
            minMarketTokens: expandDecimals(1000, 18),
          },
          execute: {
            expectedCancellationReason: {
              name: "GlvMaxMarketTokenBalanceUsdExceeded",
              args: [ethUsdGlvAddress, solUsdMarket.marketToken, expandDecimals(999, 30), expandDecimals(1000, 30)],
            },
          },
        });

        await handleGlvShift(fixture, {
          create: {
            marketTokenAmount: expandDecimals(999, 18),
            minMarketTokens: expandDecimals(999, 18),
          },
        });
      });

      it("GlvMaxMarketTokenBalanceAmountExceeded", async () => {
        await dataStore.setUint(
          keys.glvMaxMarketTokenBalanceAmountKey(ethUsdGlvAddress, solUsdMarket.marketToken),
          expandDecimals(500, 18)
        );
        await handleGlvShift(fixture, {
          create: {
            marketTokenAmount: expandDecimals(501, 18),
            minMarketTokens: expandDecimals(501, 18),
          },
          execute: {
            expectedCancellationReason: {
              name: "GlvMaxMarketTokenBalanceAmountExceeded",
              args: [ethUsdGlvAddress, solUsdMarket.marketToken, expandDecimals(500, 18), expandDecimals(501, 18)],
            },
          },
        });

        await handleGlvShift(fixture, {
          create: {
            marketTokenAmount: expandDecimals(500, 18),
            minMarketTokens: expandDecimals(500, 18),
          },
        });
      });

      it("OracleTimestampsAreSmallerThanRequired", async () => {
        await createGlvShift(fixture, {
          marketTokenAmount: expandDecimals(1000, 18),
        });
        const block = await time.latestBlock();
        await expect(
          executeGlvShift(fixture, {
            oracleBlockNumber: block - 1,
          })
        ).to.be.revertedWithCustomError(errorsContract, "OracleTimestampsAreSmallerThanRequired");
        await executeGlvShift(fixture, {
          oracleBlockNumber: block,
        });
      });

      it("OracleTimestampsAreLargerThanRequestExpirationTime", async () => {
        await createGlvShift(fixture, {
          marketTokenAmount: expandDecimals(1000, 18),
        });
        await time.increase(60);
        await dataStore.setUint(keys.REQUEST_EXPIRATION_TIME, 60);
        expect(await dataStore.getUint(keys.REQUEST_EXPIRATION_TIME)).to.be.eq(60);

        await expect(executeGlvShift(fixture)).to.be.revertedWithCustomError(
          errorsContract,
          "OracleTimestampsAreLargerThanRequestExpirationTime"
        );

        await dataStore.setUint(keys.REQUEST_EXPIRATION_TIME, 300);
        expect(await dataStore.getUint(keys.REQUEST_EXPIRATION_TIME)).to.be.eq(300);
        await executeGlvShift(fixture);
      });

      // fromMarket may be disabled at execute (drain path); toMarket must still be enabled
      it("allows execute when fromMarket is disabled but still listed", async () => {
        await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, ethUsdMarket.marketToken), true);

        await handleGlvShift(fixture, {
          create: {
            fromMarket: ethUsdMarket,
            toMarket: solUsdMarket,
            marketTokenAmount: expandDecimals(1000, 18),
            minMarketTokens: expandDecimals(1000, 18),
          },
        });

        await expectBalances({
          [ethUsdGlvAddress]: {
            [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
            [solUsdMarket.marketToken]: expandDecimals(1000, 18),
          },
        });
      });

      it("cancels execute when toMarket is disabled after create", async () => {
        await createGlvShift(fixture, {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
          minMarketTokens: expandDecimals(1000, 18),
        });

        await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, solUsdMarket.marketToken), true);

        await executeGlvShift(fixture, {
          expectedCancellationReason: {
            name: "GlvDisabledMarket",
            args: [ethUsdGlvAddress, solUsdMarket.marketToken],
          },
        });

        expect(await getGlvShiftCount(dataStore)).eq(0);
        // GM stays on fromMarket (execute state rolled back before cancel)
        await expectBalances({
          [ethUsdGlvAddress]: {
            [ethUsdMarket.marketToken]: expandDecimals(10000, 18),
            [solUsdMarket.marketToken]: 0,
          },
        });
      });

      // toMarket removed while shift is pending: execute must cancel, not sync GM outside NAV
      it("cancels execute when toMarket was removed after create", async () => {
        await createGlvShift(fixture, {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
          minMarketTokens: expandDecimals(1000, 18),
        });

        expect(await getGlvShiftCount(dataStore)).eq(1);

        // solUsdMarket has zero GLV balance, so it can be removed after disable
        await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, solUsdMarket.marketToken), true);
        await glvShiftHandler.removeMarketFromGlv(ethUsdGlvAddress, solUsdMarket.marketToken);

        await executeGlvShift(fixture, {
          expectedCancellationReason: {
            name: "GlvUnsupportedMarket",
            args: [ethUsdGlvAddress, solUsdMarket.marketToken],
          },
        });

        expect(await getGlvShiftCount(dataStore)).eq(0);
        await expectBalances({
          [ethUsdGlvAddress]: {
            [ethUsdMarket.marketToken]: expandDecimals(10000, 18),
            [solUsdMarket.marketToken]: 0,
          },
        });
      });
    });

    it("GlvShiftMaxLossExceeded", async () => {
      // make first pool imbalanced
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(2, 18),
          shortTokenAmount: 0,
        },
      });
      await handleGlvDeposit(fixture, {
        create: {
          market: solUsdMarket,
          longTokenAmount: expandDecimals(2, 18),
          shortTokenAmount: expandDecimals(10_000, 6),
        },
      });

      // $1 for $1000 diff
      await dataStore.setUint(keys.swapImpactFactorKey(solUsdMarket.marketToken, false), decimalToFloat(1, 6));
      await dataStore.setUint(keys.swapImpactFactorKey(solUsdMarket.marketToken, true), decimalToFloat(5, 7));
      await dataStore.setUint(keys.swapImpactExponentFactorKey(solUsdMarket.marketToken), decimalToFloat(2, 0));

      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
        },
        execute: {
          expectedCancellationReason: {
            name: "GlvShiftMaxLossExceeded",

            // 0.1%
            args: [decimalToFloat(1, 3), 0],
          },
        },
      });

      await dataStore.setUint(keys.glvShiftMaxLossFactorKey(ethUsdGlvAddress), decimalToFloat(9, 4)); // 0.09%
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
        },
        execute: {
          expectedCancellationReason: {
            name: "GlvShiftMaxLossExceeded",

            // 0.1%
            args: [decimalToFloat(1, 3), decimalToFloat(9, 4)],
          },
        },
      });

      await dataStore.setUint(keys.glvShiftMaxLossFactorKey(ethUsdGlvAddress), decimalToFloat(1, 3)); // 0.1%
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
        },
      });

      await handleGlvDeposit(fixture, {
        create: {
          market: solUsdMarket,
          longTokenAmount: 0,
          shortTokenAmount: expandDecimals(100_000, 6),
        },
      });

      // positive impact is always allowed
      await dataStore.setUint(keys.glvShiftMaxLossFactorKey(ethUsdGlvAddress), 0);
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
        },
      });
    });
  });

  it("GlvShiftHandler.doExecuteGlvShift Unauthorized", async () => {
    await expect(
      glvShiftHandler.connect(user1).doExecuteGlvShift(
        ethers.constants.HashZero,
        {
          addresses: {
            fromMarket: ethUsdMarket.marketToken,
            toMarket: solUsdMarket.marketToken,
            glv: ethUsdGlvAddress,
          },
          numbers: {
            marketTokenAmount: expandDecimals(1000, 18),
            minMarketTokens: expandDecimals(1000, 18),
            updatedAtTime: 123123,
          },
        },
        ethers.constants.AddressZero,
        false
      )
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
  });
});
