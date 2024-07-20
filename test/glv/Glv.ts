import { expect } from "chai";
import { ethers } from "hardhat";

import { usingResult } from "../../utils/use";
import {
  createGlvDeposit,
  getGlvAddress,
  getGlvDepositKeys,
  getGlvWithdrawalCount,
  getGlvWithdrawalKeys,
  handleGlvDeposit,
  createGlvWithdrawal,
  executeGlvWithdrawal,
} from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { contractAt, deployContract } from "../../utils/deploy";
import { bigNumberify, expandDecimals, decimalToFloat } from "../../utils/math";
import { getBalanceOf, getSupplyOf } from "../../utils/token";
import { getClaimableFeeAmount } from "../../utils/fee";
import {
  getPoolAmount,
  getSwapImpactPoolAmount,
  getMarketTokenPrice,
  getMarketTokenPriceWithPoolValue,
} from "../../utils/market";
import { getDepositCount, getDepositKeys, createDeposit, executeDeposit, handleDeposit } from "../../utils/deposit";
import { getExecuteParams } from "../../utils/exchange";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { SwapPricingType } from "../../utils/swap";
import { prices } from "../../utils/prices";
import { encodeData } from "../../utils/hash";

describe("Glv", () => {
  const { provider } = ethers;
  const { AddressZero, HashZero } = ethers.constants;

  let fixture;
  let user0, user1, user2;
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
    usdc,
    wbtc,
    glvFactory,
    glvHandler,
    glvType,
    glvAddress,
    config;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
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
      usdc,
      wbtc,
      glvFactory,
      glvHandler,
      config,
    } = fixture.contracts);

    glvType = ethers.constants.HashZero;
    glvAddress = getGlvAddress(
      wnt.address,
      usdc.address,
      glvType,
      glvFactory.address,
      roleStore.address,
      dataStore.address
    );

    await Promise.all([
      glvFactory.createGlv(wnt.address, usdc.address, glvType),
      dataStore.setUint(keys.tokenTransferGasLimit(glvAddress), 200_000),
    ]);
  });

  it("glv vault is created", async () => {
    const [glvLongToken, glvShortToken] = await Promise.all([
      dataStore.getAddress(keys.glvLongTokenKey(glvAddress)),
      dataStore.getAddress(keys.glvShortTokenKey(glvAddress)),
    ]);

    expect(glvLongToken).eq(wnt.address);
    expect(glvShortToken).eq(usdc.address);
  });

  it("adds markets to Glv", async () => {
    const marketListKey = keys.glvSupportedMarketListKey(glvAddress);
    let marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(0);

    await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);
    await glvHandler.addMarket(glvAddress, solUsdMarket.marketToken);

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
    await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);
    await expect(glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvMarketAlreadyExists")
      .withArgs(glvAddress, ethUsdMarket.marketToken);
  });

  it("reverts if market has incorrect tokens", async () => {
    await expect(glvHandler.addMarket(glvAddress, btcUsdMarket.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvInvalidLongToken")
      .withArgs(glvAddress, wbtc.address, wnt.address);

    await expect(glvHandler.addMarket(glvAddress, ethUsdSingleTokenMarket2.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvInvalidShortToken")
      .withArgs(glvAddress, wnt.address, usdc.address);
  });

  it("configure Glv", async () => {
    await config.setUint(
      keys.GLV_MAX_MARKET_TOKEN_BALANCE_USD,
      encodeData(["address", "address"], [glvAddress, ethUsdMarket.marketToken]),
      1
    );
    await config.setUint(
      keys.GLV_MAX_CUMULATIVE_DEPOSIT_USD,
      encodeData(["address", "address"], [glvAddress, ethUsdMarket.marketToken]),
      1
    );
    await config.setUint(keys.GLV_MAX_SHIFT_PRICE_IMPACT_FACTOR, encodeData(["address"], [glvAddress]), 1);
  });

  describe("create glv deposit, validations", () => {
    let params;
    const badAddress = ethers.constants.AddressZero.slice(0, -1) + "1";

    beforeEach(async () => {
      await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);

      params = {
        glv: glvAddress,
        receiver: user1,
        callbackContract: user2,
        market: ethUsdMarket,
        initialLongToken: ethUsdMarket.longToken,
        initialShortToken: ethUsdMarket.shortToken,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
        minGlvTokens: 100,
        shouldUnwrapNativeToken: true,
        executionFee: "0",
        callbackGasLimit: "200000",
        gasUsageLabel: "createGlvDeposit",
      };
    });

    it("EmptyAccount", async () => {
      await expect(
        createGlvDeposit(fixture, { ...params, account: { address: ethers.constants.AddressZero } })
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("EmptyGlv", async () => {
      await expect(createGlvDeposit(fixture, { ...params, glv: badAddress }))
        .to.be.revertedWithCustomError(errorsContract, "EmptyGlv")
        .withArgs(badAddress);
    });

    it("GlvUnsupportedMarket", async () => {
      await expect(createGlvDeposit(fixture, { ...params, market: btcUsdMarket }))
        .to.be.revertedWithCustomError(errorsContract, "GlvUnsupportedMarket")
        .withArgs(glvAddress, btcUsdMarket.marketToken);
    });

    // market is not enabled in GLV
    // market is not enabled globally
    // validate swaps

    it("InvalidGlvDepositInitialShortToken", async () => {
      await expect(createGlvDeposit(fixture, { ...params, initialLongToken: ethUsdMarket.marketToken }))
        .to.be.revertedWithCustomError(errorsContract, "InvalidGlvDepositInitialShortToken")
        .withArgs(ethUsdMarket.marketToken, ethUsdMarket.shortToken);
    });

    it("InvalidGlvDepositSwapPath", async () => {
      await expect(
        createGlvDeposit(fixture, {
          ...params,
          initialLongToken: ethUsdMarket.marketToken,
          initialShortToken: ethers.constants.AddressZero,
          longTokenSwapPath: [ethUsdMarket.marketToken],
          shortTokenSwapPath: [ethUsdMarket.marketToken, btcUsdMarket.marketToken],
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "InvalidGlvDepositSwapPath")
        .withArgs(1, 2);
    });
  });

  it("create glv withdrawal", async () => {
    await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);

    expect(await getGlvWithdrawalCount(dataStore)).eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    const glvToken = await contractAt("Glv", glvAddress);
    const glvTokenAmount = expandDecimals(1000, 18);
    await glvToken.mint(user0.address, glvTokenAmount);

    await createGlvWithdrawal(fixture, {
      account: user0,
      receiver: user1,
      callbackContract: user2,
      glv: glvAddress,
      market: ethUsdMarket,
      glvTokenAmount,
      minLongTokenAmount: 100,
      minShortTokenAmount: 50,
      shouldUnwrapNativeToken: true,
      executionFee: 700,
      callbackGasLimit: 100000,
      gasUsageLabel: "createGlvWithdrawal",
    });

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    const block = await provider.getBlock("latest");
    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawal = await reader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

    expect(glvWithdrawal.addresses.account).eq(user0.address);
    expect(glvWithdrawal.addresses.receiver).eq(user1.address);
    expect(glvWithdrawal.addresses.callbackContract).eq(user2.address);
    expect(glvWithdrawal.addresses.market).eq(ethUsdMarket.marketToken);
    expect(glvWithdrawal.numbers.glvTokenAmount).eq(expandDecimals(1000, 18));
    expect(glvWithdrawal.numbers.minLongTokenAmount).eq(100);
    expect(glvWithdrawal.numbers.minShortTokenAmount).eq(50);
    expect(glvWithdrawal.numbers.updatedAtBlock).eq(block.number);
    expect(glvWithdrawal.numbers.executionFee).eq(700);
    expect(glvWithdrawal.numbers.callbackGasLimit).eq(100000);
    expect(glvWithdrawal.flags.shouldUnwrapNativeToken).eq(true);
  });

  it.only("execute glv withdrawal", async () => {
    await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);

    await handleGlvDeposit(fixture, {
      create: {
        glv: glvAddress,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    const glvBalance = await getBalanceOf(glvAddress, user0.address);
    console.log("user glvBalance %s", glvBalance);

    const marketTokenBalance = await getBalanceOf(ethUsdMarket.marketToken, glvAddress);
    console.log("glv %s market %s marketTokenBalance %s", ethUsdMarket.marketToken, glvAddress, marketTokenBalance);

    await createGlvWithdrawal(fixture, {
      glv: glvAddress,
      market: ethUsdMarket,
      glvTokenAmount: glvBalance,
    });

    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 10);
    const glvWithdrawal = await reader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

    expect(glvWithdrawal.addresses.account).eq(user0.address);
    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    await executeGlvWithdrawal(fixture, {
      gasUsageLabel: "executeGlvWithdrawal",
      glv: glvAddress,
      simulate: true,
    });
  });

  it("create glv deposit", async () => {
    await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);

    const params = {
      glv: glvAddress,
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      initialLongToken: ethUsdMarket.longToken,
      initialShortToken: ethUsdMarket.shortToken,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
      minGlvTokens: 100,
      shouldUnwrapNativeToken: true,
      executionFee: "0",
      callbackGasLimit: "200000",
      gasUsageLabel: "createGlvDeposit",
    };

    await createGlvDeposit(fixture, {
      ...params,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      executionFee: "500",
    });

    const block = await provider.getBlock("latest");
    const glvDepositKeys = await getGlvDepositKeys(dataStore, 0, 1);
    const glvDeposit = await reader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);

    expect(glvDeposit.addresses.glv).eq(glvAddress);
    expect(glvDeposit.addresses.account).eq(user0.address);
    expect(glvDeposit.addresses.receiver).eq(user1.address);
    expect(glvDeposit.addresses.callbackContract).eq(user2.address);
    expect(glvDeposit.addresses.market).eq(ethUsdMarket.marketToken);
    expect(glvDeposit.addresses.initialLongToken).eq(ethUsdMarket.longToken);
    expect(glvDeposit.addresses.initialShortToken).eq(ethUsdMarket.shortToken);
    expect(glvDeposit.addresses.longTokenSwapPath).deep.eq([]);
    expect(glvDeposit.addresses.shortTokenSwapPath).deep.eq([]);
    expect(glvDeposit.numbers.initialLongTokenAmount).eq(expandDecimals(10, 18));
    expect(glvDeposit.numbers.initialShortTokenAmount).eq(expandDecimals(10 * 5000, 6));
    expect(glvDeposit.numbers.minGlvTokens).eq(100);
    expect(glvDeposit.numbers.updatedAtBlock).eq(block.number);
    expect(glvDeposit.numbers.executionFee).eq("500");
    expect(glvDeposit.numbers.callbackGasLimit).eq("200000");
    expect(glvDeposit.flags.shouldUnwrapNativeToken).eq(true);
  });

  it("execute glv deposit", async () => {
    await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);
    expect(await getBalanceOf(glvAddress, user0.address)).eq(0);

    await handleGlvDeposit(fixture, {
      create: {
        glv: glvAddress,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
      },
    });

    const glvBalance = await getBalanceOf(glvAddress, user0.address);
    console.log("user glvBalance %s", glvBalance);

    const marketTokenBalance = await getBalanceOf(ethUsdMarket.marketToken, glvAddress);
    console.log("glv marketTokenBalance %s", marketTokenBalance);

    // expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(95000, 18));

    // await handleDeposit(fixture, {
    //   create: {
    //     initialLongToken: usdc.address,
    //     longTokenAmount: expandDecimals(9 * 5000, 6),
    //     initialShortToken: wnt.address,
    //     shortTokenAmount: expandDecimals(10, 18),
    //     longTokenSwapPath: [ethUsdMarket.marketToken],
    //     shortTokenSwapPath: [ethUsdMarket.marketToken],
    //   },
    // });

    // expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(190000, 18));

    // await handleDeposit(fixture, {
    //   create: {
    //     account: user1,
    //     market: btcUsdMarket,
    //     longTokenAmount: expandDecimals(2, 8),
    //     shortTokenAmount: expandDecimals(10, 18),
    //   },
    //   execute: getExecuteParams(fixture, { tokens: [usdc, wbtc] }),
    // });

    // expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(190000, 18));

    // await handleDeposit(fixture, {
    //   create: {
    //     initialLongToken: usdc.address,
    //     longTokenAmount: expandDecimals(9 * 5000, 6),
    //     initialShortToken: wnt.address,
    //     shortTokenAmount: expandDecimals(10, 18),
    //     longTokenSwapPath: [btcUsdMarket.marketToken],
    //     shortTokenSwapPath: [ethUsdMarket.marketToken],
    //   },
    //   execute: {
    //     ...getExecuteParams(fixture, { tokens: [wnt, usdc, wbtc] }),
    //     expectedCancellationReason: "InvalidSwapOutputToken",
    //   },
    // });

    // expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(190000, 18));

    // await handleDeposit(fixture, {
    //   create: {
    //     longTokenAmount: expandDecimals(10, 18),
    //     shortTokenAmount: expandDecimals(9 * 5000, 6),
    //     minMarketTokens: expandDecimals(500000, 18),
    //   },
    //   execute: {
    //     expectedCancellationReason: "MinMarketTokens",
    //   },
    // });

    // expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(190000, 18));
  });
});
